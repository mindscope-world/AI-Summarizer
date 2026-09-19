import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {afterEach, describe, expect, it} from 'vitest';
import type {ApiErrorBody, HealthResponse} from '../src/types';
import {createApp} from './app';
import {loadEnv} from './lib/env';
import {createLogger} from './lib/logger';

const SECRET = 'test-secret-key-do-not-leak';
const servers: Server[] = [];

async function start(overrides: Record<string, string> = {}) {
  const env = loadEnv({GEMINI_API_KEY: SECRET, NODE_ENV: 'test', ...overrides});
  const lines: string[] = [];
  const logger = createLogger('debug', (line) => lines.push(line));
  const app = createApp({env, logger, staticDir: false});
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {base, lines};
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function errorOf(res: Response): Promise<ApiErrorBody['error']> {
  return ((await res.json()) as ApiErrorBody).error;
}

describe('GET /api/health', () => {
  it('returns service status without leaking configuration', async () => {
    const {base} = await start();
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthResponse;
    expect(body).toMatchObject({status: 'ok', service: 'leaderforge-academic-summarizer', environment: 'test'});
    expect(typeof body.uptimeSeconds).toBe('number');
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});

describe('request ids', () => {
  it('generates one and includes it in error bodies', async () => {
    const {base} = await start();
    const res = await fetch(`${base}/api/nope`);
    const id = res.headers.get('x-request-id');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const err = await errorOf(res);
    expect(err.requestId).toBe(id);
  });

  it('honours a well-formed inbound id and ignores a malformed one', async () => {
    const {base} = await start();
    const ok = await fetch(`${base}/api/health`, {headers: {'x-request-id': 'trace-abc12345'}});
    expect(ok.headers.get('x-request-id')).toBe('trace-abc12345');
    const bad = await fetch(`${base}/api/health`, {headers: {'x-request-id': 'bad id with spaces\t'}});
    expect(bad.headers.get('x-request-id')).not.toContain(' ');
  });
});

describe('errors', () => {
  it('404s unknown API routes with a structured body', async () => {
    const {base} = await start();
    const res = await fetch(`${base}/api/does-not-exist`);
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe('not_found');
  });

  it('rejects malformed JSON with 400', async () => {
    const {base} = await start();
    const res = await fetch(`${base}/api/summarize`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{not json',
    });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('bad_request');
  });

  it('rejects oversized JSON bodies with 413', async () => {
    const {base} = await start({JSON_BODY_LIMIT: '1kb'});
    const res = await fetch(`${base}/api/summarize`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({text: 'x'.repeat(5000), category: 'CS'}),
    });
    expect(res.status).toBe(413);
    expect((await errorOf(res)).code).toBe('payload_too_large');
  });
});

describe('validation', () => {
  it('returns every field problem for a bad summarize request', async () => {
    const {base} = await start();
    const res = await fetch(`${base}/api/summarize`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({text: '', length: 'huge'}),
    });
    expect(res.status).toBe(400);
    const err = await errorOf(res);
    expect(err.code).toBe('validation_failed');
    const paths = err.details?.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['body.text', 'body.length', 'body.category']));
  });

  it('validates query and params on export', async () => {
    const {base} = await start();
    const res = await fetch(`${base}/api/documents/doc-1/export?format=exe`);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).details?.[0].path).toBe('query.format');
  });

  it('accepts a valid request and reports the feature as not implemented', async () => {
    const {base} = await start();
    const res = await fetch(`${base}/api/summarize`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({text: 'Some lecture notes.', category: 'Computer Science'}),
    });
    expect(res.status).toBe(501);
    const err = await errorOf(res);
    expect(err.code).toBe('not_implemented');
    expect(err.message).toMatch(/Phase 3/);
  });

  it('validates feedback', async () => {
    const {base} = await start();
    const res = await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({rating: 9, comment: 'great', role: 'student'}),
    });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).details?.[0].path).toBe('body.rating');
  });
});

describe('uploads', () => {
  const upload = (base: string, name: string, size: number) => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(size)]), name);
    return fetch(`${base}/api/extract`, {method: 'POST', body: form});
  };

  it('requires a file or url', async () => {
    const {base} = await start();
    const res = await fetch(`${base}/api/extract`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{}',
    });
    // JSON body is not multipart, multer skips it, and validation catches the missing input.
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('validation_failed');
  });

  it('rejects unsupported file types with 415', async () => {
    const {base} = await start();
    const res = await upload(base, 'malware.exe', 10);
    expect(res.status).toBe(415);
    expect((await errorOf(res)).code).toBe('unsupported_media_type');
  });

  it('rejects files above MAX_UPLOAD_MB with 413', async () => {
    const {base} = await start({MAX_UPLOAD_MB: '1'});
    const res = await upload(base, 'big.pdf', 2 * 1024 * 1024);
    expect(res.status).toBe(413);
    expect((await errorOf(res)).code).toBe('payload_too_large');
  });

  it('accepts an allowed file within limits (extraction itself lands in Phase 2)', async () => {
    const {base} = await start();
    const res = await upload(base, 'notes.pdf', 1024);
    expect(res.status).toBe(501);
    expect((await errorOf(res)).message).toMatch(/Phase 2/);
  });
});

describe('rate limiting', () => {
  it('returns 429 after the per-minute limit but never throttles /health', async () => {
    const {base} = await start({RATE_LIMIT_PER_MINUTE: '3'});
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await fetch(`${base}/api/documents`)).status);
    expect(statuses).toEqual([501, 501, 501, 429, 429]);

    const limited = await fetch(`${base}/api/documents`);
    expect((await errorOf(limited)).code).toBe('rate_limited');

    for (let i = 0; i < 6; i++) expect((await fetch(`${base}/api/health`)).status).toBe(200);
  });
});

describe('cors', () => {
  it('adds no CORS headers by default and allows only listed origins', async () => {
    const {base} = await start();
    const res = await fetch(`${base}/api/health`, {headers: {origin: 'https://evil.example'}});
    expect(res.headers.get('access-control-allow-origin')).toBeNull();

    const {base: base2} = await start({CORS_ORIGINS: 'https://app.example'});
    const allowed = await fetch(`${base2}/api/health`, {headers: {origin: 'https://app.example'}});
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.example');
    const denied = await fetch(`${base2}/api/health`, {headers: {origin: 'https://evil.example'}});
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('logging', () => {
  it('logs request metadata but never secrets or bodies', async () => {
    const {base, lines} = await start();
    await fetch(`${base}/api/summarize?token=abc`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({text: 'PRIVATE COURSEWORK TEXT', category: 'CS'}),
    });
    await new Promise((r) => setTimeout(r, 20));
    const all = lines.join('\n');
    expect(all).toContain('"path":"/api/summarize"');
    expect(all).not.toContain('PRIVATE COURSEWORK TEXT');
    expect(all).not.toContain('token=abc');
    expect(all).not.toContain(SECRET);
  });
});
