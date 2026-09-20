import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  ApiError,
  apiRequest,
  describeApiError,
  extractDocument,
  getApiBase,
  getHealth,
  normalizeApiBase,
  setApiBase,
  summarizeDocument,
} from './api';
import type {SummaryResult} from './../types';

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string, init: RequestInit) => impl(url, init));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {headers: {'content-type': 'application/json'}, ...init});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('normalizeApiBase', () => {
  it.each([
    ['/api', '/api'],
    ['/api/', '/api'],
    ['  /v1/api//  ', '/v1/api'],
    ['https://api.example.edu/api/', 'https://api.example.edu/api'],
    ['http://localhost:3001', 'http://localhost:3001'],
  ])('accepts %s', (input, expected) => {
    expect(normalizeApiBase(input)).toBe(expected);
  });

  it.each(['', '   ', 'api', '//evil.example', 'ftp://x.example', 'javascript:alert(1)', 'https://x.example/a?b=1'])(
    'rejects %j',
    (input) => {
      expect(normalizeApiBase(input)).toBeNull();
    },
  );
});

describe('api base storage', () => {
  it('falls back to /api when localStorage is unavailable', () => {
    expect(getApiBase()).toBe('/api'); // node test env has no localStorage
    expect(setApiBase('https://x.example/api')).toBe('https://x.example/api');
  });

  it('round-trips through localStorage when available', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    setApiBase('https://api.example.edu/api/');
    expect(getApiBase()).toBe('https://api.example.edu/api');
    setApiBase('/api');
    expect(getApiBase()).toBe('/api');
    expect(store.size).toBe(0);
  });
});

describe('apiRequest', () => {
  it('returns parsed JSON and hits base + path', async () => {
    const fetchMock = mockFetch(() => json({status: 'ok'}));
    await expect(apiRequest('/health')).resolves.toEqual({status: 'ok'});
    expect(fetchMock.mock.calls[0][0]).toBe('/api/health');
  });

  it('uses a baseUrl override', async () => {
    const fetchMock = mockFetch(() => json({}));
    await apiRequest('/health', {baseUrl: 'https://remote.example/api/'});
    expect(fetchMock.mock.calls[0][0]).toBe('https://remote.example/api/health');
  });

  it('sends objects as JSON and FormData untouched', async () => {
    const fetchMock = mockFetch(() => json({}));
    await apiRequest('/summarize', {method: 'POST', body: {text: 'hi'}});
    const jsonInit = fetchMock.mock.calls[0][1];
    expect(jsonInit.body).toBe('{"text":"hi"}');
    expect((jsonInit.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    const form = new FormData();
    form.append('url', 'https://x.example');
    await apiRequest('/extract', {method: 'POST', body: form});
    const formInit = fetchMock.mock.calls[1][1];
    expect(formInit.body).toBe(form);
    expect((formInit.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('turns structured server errors into ApiError', async () => {
    mockFetch(() =>
      json(
        {error: {code: 'validation_failed', message: 'Bad.', requestId: 'rid-1', details: [{path: 'body.text', message: 'x'}]}},
        {status: 400},
      ),
    );
    const err = (await apiRequest('/summarize', {method: 'POST', body: {}}).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({status: 400, code: 'validation_failed', requestId: 'rid-1', message: 'Bad.'});
    expect(err.details).toEqual([{path: 'body.text', message: 'x'}]);
  });

  it('handles non-JSON error responses such as a proxy 502', async () => {
    mockFetch(() => new Response('<html>Bad Gateway</html>', {status: 502}));
    const err = await apiRequest('/health').catch((e) => e);
    expect(err).toMatchObject({status: 502, code: 'http_error'});
  });

  it('flags a 200 with a non-JSON body (e.g. SPA index.html) as invalid_response', async () => {
    mockFetch(() => new Response('<!doctype html>', {status: 200}));
    const err = await apiRequest('/health').catch((e) => e);
    expect(err).toMatchObject({code: 'invalid_response'});
  });

  it('maps network failures to network_error', async () => {
    mockFetch(() => {
      throw new TypeError('fetch failed');
    });
    await expect(apiRequest('/health')).rejects.toMatchObject({code: 'network_error', status: 0});
  });

  it('times out', async () => {
    vi.useFakeTimers();
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const pending = apiRequest('/health', {timeoutMs: 1000}).catch((e) => e);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await pending).toMatchObject({code: 'timeout'});
  });

  it('propagates caller cancellation as an AbortError, not an ApiError', async () => {
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const controller = new AbortController();
    const pending = apiRequest('/health', {signal: controller.signal}).catch((e) => e);
    controller.abort();
    const err = (await pending) as Error;
    expect(err).not.toBeInstanceOf(ApiError);
    expect(err.name).toBe('AbortError');
  });
});

describe('getHealth', () => {
  it('calls /health', async () => {
    const fetchMock = mockFetch(() => json({status: 'ok', version: '0.1.0'}));
    await expect(getHealth()).resolves.toMatchObject({version: '0.1.0'});
    expect(fetchMock.mock.calls[0][0]).toBe('/api/health');
  });
});

describe('extractDocument', () => {
  it('sends a file as multipart with stripReferences as a string field', async () => {
    const fetchMock = mockFetch(() => json({text: 'x'}));
    const file = new File(['hello'], 'notes.txt', {type: 'text/plain'});
    await extractDocument({file, stripReferences: true});
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/extract');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect((form.get('file') as File).name).toBe('notes.txt');
    expect(form.get('stripReferences')).toBe('true');
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('sends pasted text and URLs as JSON (multipart fields are size-capped)', async () => {
    const fetchMock = mockFetch(() => json({text: 'x'}));
    await extractDocument({text: 'a'.repeat(10)});
    await extractDocument({url: 'https://example.com/a', stripReferences: false});
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({text: 'aaaaaaaaaa'});
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({url: 'https://example.com/a', stripReferences: false});
  });

  it('surfaces server errors as ApiError', async () => {
    mockFetch(() => json({error: {code: 'unprocessable', message: 'The PDF is password-protected.', requestId: 'r1'}}, {status: 422}));
    const err = (await extractDocument({text: 'x'}).catch((e) => e)) as ApiError;
    expect(err).toMatchObject({status: 422, code: 'unprocessable', message: 'The PDF is password-protected.'});
  });
});

describe('describeApiError', () => {
  it('uses the server message for content problems and friendly text for transport problems', () => {
    expect(describeApiError(new ApiError('The PDF is password-protected.', 422, 'unprocessable'))).toBe('The PDF is password-protected.');
    expect(describeApiError(new ApiError('x', 0, 'network_error'))).toMatch(/Could not reach the server/);
    expect(describeApiError(new ApiError('x', 0, 'timeout'))).toMatch(/too long/);
    expect(describeApiError(new ApiError('x', 429, 'rate_limited'))).toMatch(/Wait a minute/);
    expect(describeApiError(new Error('boom'))).toMatch(/Something went wrong/);
    expect(describeApiError(new ApiError('Server responded with HTTP 500.', 500, 'http_error'))).toMatch(/not responding correctly/);
    expect(describeApiError(new ApiError('Server responded with HTTP 502.', 502, 'http_error'))).toMatch(/not responding correctly/);
    expect(describeApiError(new ApiError('Server responded with HTTP 404.', 404, 'http_error'))).toBe('Server responded with HTTP 404.');
  });
});


describe('summarizeDocument', () => {
  const input = {text: 'Some notes.', category: 'CS', summarizationType: 'abstractive', length: 'balanced', language: 'English'} as const;
  const result = {title: 'T', contentParagraphs: ['p'], warnings: []} as unknown as SummaryResult;
  const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;
  /** An event-stream response whose body arrives in the given pieces (which may split frames anywhere). */
  const sse = (...pieces: string[]) =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (const piece of pieces) controller.enqueue(new TextEncoder().encode(piece));
          controller.close();
        },
      }),
      {headers: {'content-type': 'text/event-stream'}},
    );

  it('asks for an event stream and returns the result, reporting progress along the way', async () => {
    const fetchMock = mockFetch(() =>
      sse(
        frame({type: 'progress', stage: 'prepare', message: 'Preparing', percent: 2}),
        frame({type: 'progress', stage: 'sections', message: 'Reading section 1 of 2', percent: 30}),
        frame({type: 'result', result}),
      ),
    );
    const seen: number[] = [];
    const out = await summarizeDocument(input, {onProgress: (p) => seen.push(p.percent)});
    expect(out).toEqual(result);
    expect(seen).toEqual([2, 30]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/summarize');
    expect((init.headers as Record<string, string>).Accept).toBe('text/event-stream');
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it('reassembles events split across network chunks', async () => {
    const whole = frame({type: 'progress', stage: 'prepare', message: 'Preparing', percent: 5}) + frame({type: 'result', result});
    const cut = 17;
    mockFetch(() => sse(whole.slice(0, cut), whole.slice(cut, cut + 40), whole.slice(cut + 40)));
    const seen: number[] = [];
    expect(await summarizeDocument(input, {onProgress: (p) => seen.push(p.percent)})).toEqual(result);
    expect(seen).toEqual([5]);
  });

  it('throws the server message when the stream ends with an error event', async () => {
    mockFetch(() => sse(frame({type: 'error', error: {code: 'upstream_error', message: 'Summarization failed: busy.', requestId: 'r1'}})));
    await expect(summarizeDocument(input)).rejects.toMatchObject({message: 'Summarization failed: busy.', code: 'upstream_error'});
  });

  it('throws the JSON error for failures before the stream starts (validation, rate limit)', async () => {
    mockFetch(() => json({error: {code: 'rate_limited', message: 'Too many requests.', requestId: 'r2'}}, {status: 429}));
    const err = await summarizeDocument(input).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({status: 429, code: 'rate_limited'});
  });

  it('fails clearly when the stream ends without a result', async () => {
    mockFetch(() => sse(frame({type: 'progress', stage: 'prepare', message: 'Preparing', percent: 2})));
    await expect(summarizeDocument(input)).rejects.toMatchObject({code: 'invalid_response'});
  });

  it('maps an unreachable server to a network_error, and a caller abort to AbortError', async () => {
    mockFetch(() => {
      throw new TypeError('fetch failed');
    });
    await expect(summarizeDocument(input)).rejects.toMatchObject({code: 'network_error'});

    const controller = new AbortController();
    mockFetch((_url, init) => new Promise<Response>((_res, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))));
    const pending = summarizeDocument(input, {signal: controller.signal});
    controller.abort();
    await expect(pending).rejects.toMatchObject({name: 'AbortError'});
  });
});
