import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {afterEach, describe, expect, it} from 'vitest';
import type {ApiErrorBody, ExtractionResult, HealthResponse} from '../src/types';
import {createApp} from './app';
import {loadEnv} from './lib/env';
import {createLogger} from './lib/logger';
import type {IngestDeps} from './pipeline/ingest';
import type {OcrProvider} from './pipeline/ocr';
import {makeDocx, makePdf} from './testing/fixtures';
import {startFixtureServer, type FixtureServer} from './testing/httpServer';

const SECRET = 'test-secret-key-do-not-leak';
const servers: Server[] = [];

async function start(overrides: Record<string, string> = {}, ingestion: Partial<IngestDeps> = {}) {
  const env = loadEnv({GEMINI_API_KEY: SECRET, NODE_ENV: 'test', ...overrides});
  const lines: string[] = [];
  const logger = createLogger('debug', (line) => lines.push(line));
  // Never let a test reach the real OCR provider.
  const app = createApp({env, logger, staticDir: false, ingestion: {ocr: undefined, ...ingestion}});
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {base, lines};
}

const fixtures: FixtureServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
  await Promise.all(fixtures.splice(0).map((f) => f.close()));
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

const PROSE = [
  'Distributed consensus protocols allow independent nodes to agree on a single value even when some of them fail.',
  'Paxos and Raft are the two best known examples, and both rely on majority quorums to make progress safely.',
].join(' ');

describe('POST /api/extract', () => {
  const upload = (base: string, name: string, data: Buffer | number, fields: Record<string, string> = {}) => {
    const form = new FormData();
    const bytes = typeof data === 'number' ? new Uint8Array(data) : new Uint8Array(data);
    form.append('file', new Blob([bytes]), name);
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return fetch(`${base}/api/extract`, {method: 'POST', body: form});
  };
  const postJson = (base: string, body: unknown) =>
    fetch(`${base}/api/extract`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});

  it('extracts an uploaded PDF', async () => {
    const {base} = await start();
    const res = await upload(base, 'lecture.pdf', makePdf([[PROSE], [PROSE]]));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ExtractionResult;
    expect(body.source).toMatchObject({kind: 'file', format: 'pdf', fileName: 'lecture.pdf', pageCount: 2, ocrUsed: false});
    expect(body.text).toContain('Paxos and Raft');
    expect(body.language.code).toBe('en');
    expect(body.wordCount).toBeGreaterThan(30);
    expect(body.chunks.length).toBe(body.stats.chunks);
  });

  it('extracts an uploaded DOCX and a TXT', async () => {
    const {base} = await start();
    const docx = await upload(base, 'notes.docx', await makeDocx([PROSE, PROSE]));
    expect(docx.status).toBe(200);
    expect(((await docx.json()) as ExtractionResult).source.format).toBe('docx');

    const txt = await upload(base, 'notes.txt', Buffer.from(PROSE));
    expect(txt.status).toBe(200);
    expect(((await txt.json()) as ExtractionResult).source.format).toBe('txt');
  });

  it('extracts pasted text sent as JSON and honours stripReferences', async () => {
    const {base} = await start();
    const text = ['Intro paragraph.', 'Body paragraph.', 'More body.', 'References', 'Smith (2020).'].join('\n\n');
    const res = await postJson(base, {text, stripReferences: true});
    expect(res.status).toBe(200);
    const body = (await res.json()) as ExtractionResult;
    expect(body.source.kind).toBe('text');
    expect(body.text).not.toContain('Smith');
  });

  it('accepts stripReferences as a multipart string field', async () => {
    const {base} = await start();
    const text = ['Intro paragraph.', 'Body paragraph.', 'More body.', 'References', 'Smith (2020).'].join('\n\n');
    const res = await upload(base, 'a.txt', Buffer.from(text), {stripReferences: 'true'});
    expect(((await res.json()) as ExtractionResult).text).not.toContain('Smith');
  });

  it('uses OCR for a scanned PDF and reports it', async () => {
    const ocr: OcrProvider = {name: 'fake', transcribePdf: async () => [PROSE]};
    const {base} = await start({}, {ocr});
    const res = await upload(base, 'scan.pdf', makePdf([[]]));
    expect(res.status).toBe(200);
    expect(((await res.json()) as ExtractionResult).source.ocrUsed).toBe(true);
  });

  it('returns 422 for a scanned PDF when OCR is unavailable', async () => {
    const {base} = await start();
    const res = await upload(base, 'scan.pdf', makePdf([[]]));
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe('unprocessable');
  });

  it('requires exactly one of file, url or text', async () => {
    const {base} = await start();
    const none = await postJson(base, {});
    expect(none.status).toBe(400);
    expect((await errorOf(none)).code).toBe('validation_failed');

    const two = await postJson(base, {text: PROSE, url: 'https://example.com/a'});
    expect(two.status).toBe(400);
    expect((await errorOf(two)).details?.[0].message).toMatch(/exactly one/i);

    const form = new FormData();
    form.append('file', new Blob([Buffer.from(PROSE)]), 'a.txt');
    form.append('text', PROSE);
    const fileAndText = await fetch(`${base}/api/extract`, {method: 'POST', body: form});
    expect(fileAndText.status).toBe(400);
  });

  it('validates the url field', async () => {
    const {base} = await start();
    for (const url of ['not a url', 'ftp://example.com/x', 'file:///etc/passwd']) {
      const res = await postJson(base, {url});
      expect(res.status, url).toBe(400);
      expect((await errorOf(res)).details?.[0].path).toBe('body.url');
    }
  });

  it('blocks URLs that point at private addresses (SSRF)', async () => {
    let hit = false;
    const internal = await startFixtureServer((_req, res) => {
      hit = true;
      res.end('internal secret');
    });
    fixtures.push(internal);
    const {base} = await start();
    for (const url of [internal.url, `http://localhost:${internal.port}/`, 'http://169.254.169.254/latest/meta-data/']) {
      const res = await postJson(base, {url});
      expect(res.status, url).toBe(400);
      expect((await errorOf(res)).message).toMatch(/private or disallowed/);
    }
    expect(hit).toBe(false);
  });

  it('fetches and extracts a URL when the address guard is relaxed (test only)', async () => {
    const site = await startFixtureServer((_req, res) => {
      res.setHeader('Content-Type', 'text/plain');
      res.end(PROSE);
    });
    fixtures.push(site);
    const {base} = await start({}, {allowPrivateAddresses: true});
    const res = await postJson(base, {url: `${site.url}/notes.txt`});
    expect(res.status).toBe(200);
    const body = (await res.json()) as ExtractionResult;
    expect(body.source).toMatchObject({kind: 'url', format: 'txt', url: `${site.url}/notes.txt`});
  });

  it('rejects unsupported and mislabelled files with 415', async () => {
    const {base} = await start();
    expect((await upload(base, 'malware.exe', 10)).status).toBe(415);
    expect((await upload(base, 'evil.pdf', 2048)).status).toBe(415); // zeros, not a PDF
    expect((await upload(base, 'notes.txt', makePdf([[PROSE]]))).status).toBe(415); // PDF named .txt
  });

  it('rejects files above MAX_UPLOAD_MB with 413', async () => {
    const {base} = await start({MAX_UPLOAD_MB: '1'});
    const res = await upload(base, 'big.pdf', 2 * 1024 * 1024);
    expect(res.status).toBe(413);
    expect((await errorOf(res)).code).toBe('payload_too_large');
  });

  it('returns 422 for a corrupted PDF and for text with nothing readable', async () => {
    const {base} = await start();
    const bad = await upload(base, 'bad.pdf', Buffer.from('%PDF-1.4\nnot really a pdf'));
    expect(bad.status).toBe(422);
    const empty = await postJson(base, {text: '.......  5'});
    expect(empty.status).toBe(422);
  });

  it('has its own, stricter rate limit', async () => {
    const {base} = await start({EXTRACT_RATE_LIMIT_PER_MINUTE: '2', RATE_LIMIT_PER_MINUTE: '100'});
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await postJson(base, {text: PROSE})).status);
    expect(statuses).toEqual([200, 200, 429, 429]);
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
  });

  it('logs only metadata, never document text, file names or URLs', async () => {
    const {base, lines} = await start();
    await upload(base, 'confidential-thesis-draft.txt', Buffer.from('PRIVATE COURSEWORK SENTENCE about consensus protocols and quorum voting in detail.'));
    await new Promise((r) => setTimeout(r, 20));
    const all = lines.join('\n');
    expect(all).toContain('extract_completed');
    expect(all).not.toContain('PRIVATE COURSEWORK');
    expect(all).not.toContain('confidential-thesis-draft');
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
