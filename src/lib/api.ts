import type {
  ApiErrorBody,
  ApiErrorCode,
  ApiErrorDetail,
  DetectedLanguage,
  ExportDocument,
  ExportFormat,
  ExtractionResult,
  GeneratedQuestion,
  HealthResponse,
  QuestionRequest,
  SummarizeEvent,
  SummarizeProgress,
  SummaryExample,
  SummaryLanguage,
  SummaryLength,
  SummaryMode,
  SummaryResult,
  TranslateRequest,
  TranslateResponse,
} from '../types';

export const DEFAULT_API_BASE = '/api';
const STORAGE_KEY = 'leaderforge_api_base';
const DEFAULT_TIMEOUT_MS = 30_000;

/** Codes raised client-side (no usable response from the server). */
type ClientErrorCode = 'network_error' | 'timeout' | 'invalid_response' | 'http_error';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: ApiErrorCode | ClientErrorCode,
    public readonly requestId?: string,
    public readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Accepts a same-origin path ("/api") or an absolute http(s) URL and returns it
 * without a trailing slash. Returns null if the value is not a usable base.
 */
export function normalizeApiBase(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value.replace(/\/+$/, '') || '/';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.search || url.hash) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function getApiBase(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored && normalizeApiBase(stored)) || DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

/** Persists the base URL; pass the default (or an empty string) to reset it. */
export function setApiBase(value: string): string {
  const normalized = normalizeApiBase(value) ?? DEFAULT_API_BASE;
  try {
    if (normalized === DEFAULT_API_BASE) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // Storage unavailable (private mode etc.): the choice just won't persist.
  }
  return normalized;
}

let accessTokenProvider: (() => Promise<string | null>) | null = null;

/** Registers how to get the signed-in user's access token; every API call then sends it. */
export function setAccessTokenProvider(provider: (() => Promise<string | null>) | null): void {
  accessTokenProvider = provider;
}

async function authorizationHeader(): Promise<Record<string, string>> {
  try {
    const token = await accessTokenProvider?.();
    return token ? {Authorization: `Bearer ${token}`} : {};
  } catch {
    return {};
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Plain objects are sent as JSON; FormData is sent as multipart. */
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Override the configured base URL (used by "Test connection" before saving). */
  baseUrl?: string;
}

/** Sends a request and returns the response once it is known to be a success; failures throw an ApiError. */
async function request(path: string, options: RequestOptions, accept: string): Promise<Response> {
  const {method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS, baseUrl} = options;
  const base = baseUrl ? (normalizeApiBase(baseUrl) ?? DEFAULT_API_BASE) : getApiBase();

  const headers: Record<string, string> = {Accept: accept, ...(await authorizationHeader())};
  // The caller may have cancelled while we were fetching the token.
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body; // the browser sets the multipart boundary
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener('abort', onCallerAbort, {once: true});

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {method, headers, body: payload, signal: controller.signal});
  } catch (err) {
    if (timedOut) throw new ApiError('The request timed out.', 0, 'timeout');
    if (signal?.aborted) throw err; // caller cancelled: let the AbortError propagate
    throw new ApiError('Could not reach the server. Is it running?', 0, 'network_error');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }

  if (!res.ok) {
    const requestId = res.headers.get('x-request-id') ?? undefined;
    const text = await res.text().catch(() => '');
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    const apiError = (json as Partial<ApiErrorBody> | undefined)?.error;
    if (apiError?.code && apiError.message) {
      throw new ApiError(apiError.message, res.status, apiError.code, apiError.requestId ?? requestId, apiError.details);
    }
    throw new ApiError(`Server responded with HTTP ${res.status}.`, res.status, 'http_error', requestId);
  }
  return res;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await request(path, options, 'application/json');
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (json === undefined) {
    throw new ApiError('The server returned an empty or non-JSON response.', res.status, 'invalid_response', res.headers.get('x-request-id') ?? undefined);
  }
  return json as T;
}

export function getHealth(options: Pick<RequestOptions, 'signal' | 'timeoutMs' | 'baseUrl'> = {}): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health', {timeoutMs: 8_000, ...options});
}

/** Client-side mirror of the server's upload rules; the server remains the authority. */
export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const;
export const MAX_UPLOAD_MB = 50;

export interface ExtractInput {
  /** Provide exactly one of file / url / text. */
  file?: File;
  url?: string;
  text?: string;
  /** Drop a trailing references/bibliography section. */
  stripReferences?: boolean;
}

/** Extraction can involve OCR or a slow website, so it gets a longer timeout than normal calls. */
const EXTRACT_TIMEOUT_MS = 120_000;

export function extractDocument(
  input: ExtractInput,
  options: Pick<RequestOptions, 'signal' | 'timeoutMs' | 'baseUrl'> = {},
): Promise<ExtractionResult> {
  const opts = {method: 'POST' as const, timeoutMs: EXTRACT_TIMEOUT_MS, ...options};
  if (input.file) {
    const form = new FormData();
    form.append('file', input.file);
    if (input.stripReferences !== undefined) form.append('stripReferences', String(input.stripReferences));
    return apiRequest<ExtractionResult>('/extract', {...opts, body: form});
  }
  // Text and URLs go as JSON: multipart form fields are capped at 1 MB on the server.
  return apiRequest<ExtractionResult>('/extract', {
    ...opts,
    body: {url: input.url, text: input.text, stripReferences: input.stripReferences},
  });
}

export interface SummarizeInput {
  text: string;
  title?: string;
  category: string;
  courseCode?: string;
  summarizationType: SummaryMode;
  length: SummaryLength;
  language: SummaryLanguage;
  /** Language code reported by /api/extract. */
  sourceLanguage?: DetectedLanguage['code'];
  /** The student's own well-rated summaries, sent as style references. */
  examples?: SummaryExample[];
}

/** A long document on a free-tier rate limit can take several minutes; progress events keep the user informed. */
const SUMMARIZE_TIMEOUT_MS = 10 * 60_000;

/**
 * Summarizes text on the server, reporting progress as it goes. The server streams
 * Server-Sent Events: zero or more `progress` events, then one `result` or `error`.
 */
export async function summarizeDocument(
  input: SummarizeInput,
  options: {signal?: AbortSignal; onProgress?: (p: SummarizeProgress) => void; timeoutMs?: number; baseUrl?: string} = {},
): Promise<SummaryResult> {
  const {signal, onProgress, timeoutMs = SUMMARIZE_TIMEOUT_MS, baseUrl} = options;
  const base = baseUrl ? (normalizeApiBase(baseUrl) ?? DEFAULT_API_BASE) : getApiBase();
  const auth = await authorizationHeader();
  // The caller may have cancelled while we were fetching the token.
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener('abort', onCallerAbort, {once: true});

  try {
    let res: Response;
    try {
      res = await fetch(`${base}/summarize`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Accept: 'text/event-stream', ...auth},
        body: JSON.stringify(input),
        signal: controller.signal,
      });
    } catch {
      if (timedOut) throw new ApiError('The request timed out.', 0, 'timeout');
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new ApiError('Could not reach the server. Is it running?', 0, 'network_error');
    }

    const requestId = res.headers.get('x-request-id') ?? undefined;
    if (!res.ok || !res.body) {
      // Failures before the stream starts (validation, rate limit) are ordinary JSON errors.
      let apiError: Partial<ApiErrorBody['error']> | undefined;
      try {
        apiError = ((await res.json()) as Partial<ApiErrorBody>).error;
      } catch {
        apiError = undefined;
      }
      if (apiError?.code && apiError.message) {
        throw new ApiError(apiError.message, res.status, apiError.code, apiError.requestId ?? requestId, apiError.details);
      }
      throw new ApiError(`Server responded with HTTP ${res.status}.`, res.status, 'http_error', requestId);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: SummaryResult | undefined;

    const handle = (frame: string) => {
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) return;
      let event: SummarizeEvent;
      try {
        event = JSON.parse(data) as SummarizeEvent;
      } catch {
        return;
      }
      if (event.type === 'progress') onProgress?.(event);
      else if (event.type === 'result') result = event.result;
      else if (event.type === 'error') {
        throw new ApiError(event.error.message, res.status, event.error.code, event.error.requestId ?? requestId, event.error.details);
      }
    };

    try {
      for (;;) {
        const {done, value} = await reader.read();
        buffer += decoder.decode(value, {stream: !done});
        let split: number;
        while ((split = buffer.search(/\r?\n\r?\n/)) >= 0) {
          const match = buffer.slice(split).match(/^\r?\n\r?\n/)!;
          handle(buffer.slice(0, split));
          buffer = buffer.slice(split + match[0].length);
        }
        if (done) break;
      }
      if (buffer.trim()) handle(buffer);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (timedOut) throw new ApiError('The request timed out.', 0, 'timeout');
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new ApiError('The connection to the server was interrupted.', 0, 'network_error');
    }

    if (!result) throw new ApiError('The server ended the response without a summary.', res.status, 'invalid_response', requestId);
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}

/** Turns any error from the API into a sentence a student can act on. */
// ---------------------------------------------------------------------------
// Export and translation
// ---------------------------------------------------------------------------

export interface ExportedFile {
  blob: Blob;
  fileName: string;
  /** Something the reader should know about the file (e.g. characters a PDF could not show). */
  warning?: string;
}

/** The name in a Content-Disposition header, or a fallback built from the format. */
export function fileNameFromDisposition(header: string | null, format: ExportFormat): string {
  const star = header && /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = header && /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : `summary.${format}`;
}

/** Asks the server to render a summary as a real PDF, Word, text or Markdown file. */
export async function exportDocument(
  format: ExportFormat,
  document: ExportDocument,
  options: Pick<RequestOptions, 'signal' | 'timeoutMs' | 'baseUrl'> = {},
): Promise<ExportedFile> {
  const res = await request('/export', {method: 'POST', body: {format, document}, timeoutMs: 60_000, ...options}, '*/*');
  const blob = await res.blob();
  const warning = res.headers.get('x-export-warning');
  return {
    blob,
    fileName: fileNameFromDisposition(res.headers.get('content-disposition'), format),
    warning: warning ? decodeURIComponent(warning) : undefined,
  };
}

/** Translating goes through the language model, which can be slow on a free-tier rate limit. */
const TRANSLATE_TIMEOUT_MS = 180_000;

export function translateSummary(
  input: TranslateRequest,
  options: Pick<RequestOptions, 'signal' | 'timeoutMs' | 'baseUrl'> = {},
): Promise<TranslateResponse> {
  return apiRequest<TranslateResponse>('/translate', {method: 'POST', body: input, timeoutMs: TRANSLATE_TIMEOUT_MS, ...options});
}

const QUESTION_TIMEOUT_MS = 90_000;

/** One new revision question for a summary, different from the ones it already has. */
export function generateQuestion(
  input: QuestionRequest,
  options: Pick<RequestOptions, 'signal' | 'timeoutMs' | 'baseUrl'> = {},
): Promise<GeneratedQuestion> {
  return apiRequest<GeneratedQuestion>('/questions', {method: 'POST', body: input, timeoutMs: QUESTION_TIMEOUT_MS, ...options});
}

export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'network_error':
        return 'Could not reach the server. Check that it is running and try again.';
      case 'timeout':
        return 'This is taking too long. Try a smaller file or try again later.';
      case 'rate_limited':
        return 'You are going too fast. Wait a minute and try again.';
      case 'unauthorized':
        return 'Your session has expired. Please sign in again.';
      case 'http_error':
        // A 5xx with no structured body means something in front of the API (proxy, load balancer) failed.
        return err.status >= 500
          ? 'The server is not responding correctly. Make sure it is running, then try again.'
          : err.message;
      default:
        return err.message;
    }
  }
  return 'Something went wrong. Please try again.';
}

