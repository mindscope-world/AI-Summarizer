import type {ApiErrorBody, ApiErrorCode, ApiErrorDetail, ExtractionResult, HealthResponse} from '../types';

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

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Plain objects are sent as JSON; FormData is sent as multipart. */
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Override the configured base URL (used by "Test connection" before saving). */
  baseUrl?: string;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS, baseUrl} = options;
  const base = baseUrl ? (normalizeApiBase(baseUrl) ?? DEFAULT_API_BASE) : getApiBase();

  const headers: Record<string, string> = {Accept: 'application/json'};
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

  const requestId = res.headers.get('x-request-id') ?? undefined;
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    const apiError = (json as Partial<ApiErrorBody> | undefined)?.error;
    if (apiError?.code && apiError.message) {
      throw new ApiError(apiError.message, res.status, apiError.code, apiError.requestId ?? requestId, apiError.details);
    }
    throw new ApiError(`Server responded with HTTP ${res.status}.`, res.status, 'http_error', requestId);
  }

  if (json === undefined) {
    throw new ApiError('The server returned an empty or non-JSON response.', res.status, 'invalid_response', requestId);
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

/** Turns any error from the API into a sentence a student can act on. */
export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'network_error':
        return 'Could not reach the server. Check that it is running and try again.';
      case 'timeout':
        return 'This is taking too long. Try a smaller file or try again later.';
      case 'rate_limited':
        return 'You are going too fast. Wait a minute and try again.';
      default:
        return err.message;
    }
  }
  return 'Something went wrong. Please try again.';
}

