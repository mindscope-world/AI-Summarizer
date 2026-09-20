import {afterEach, describe, expect, it} from 'vitest';
import {createChatModel} from '../ai/model';
import {AppError} from '../lib/errors';
import {loadEnv} from '../lib/env';
import {makePdf, makeScannedPdf} from '../testing/fixtures';
import {startFakeGroq, type FakeGroq, type FakeReply} from '../testing/fakeGroq';
import {createLlmOcr, describeOcrFailure, extractTranscription} from './ocr';
import {rasterizePdf} from './rasterize';
import {createCanvas} from '@napi-rs/canvas';

const KEY = 'test-key-not-real-12345';
const servers: FakeGroq[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function setup(reply: (call: never, i: number) => FakeReply, envOver: Record<string, string> = {}) {
  const fake = await startFakeGroq(reply as never);
  servers.push(fake);
  const env = loadEnv({GROQ_API_KEY: KEY, GROQ_BASE_URL: fake.url, LLM_MAX_RETRIES: '0', LLM_TIMEOUT_MS: '3000', ...envOver});
  const ocr = createLlmOcr({model: createChatModel(env, {model: env.OCR_MODEL}), name: `groq:${env.OCR_MODEL}`, maxPages: env.OCR_MAX_PAGES});
  return {fake, env, ocr};
}

/** A tiny real JPEG per page, wrapped into an image-only PDF (what a scan looks like). */
function scanned(pageCount: number) {
  const canvas = createCanvas(300, 400);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 300, 400);
  const jpeg = canvas.toBuffer('image/jpeg', 80);
  return makeScannedPdf(Array.from({length: pageCount}, () => ({jpeg, width: 300, height: 400})));
}

const rejection = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as AppError;

describe('rasterizePdf', () => {
  it('renders each page to a PNG sized to the target long side', async () => {
    const pages = await rasterizePdf(makePdf([['Hello world'], ['Page two']]), {maxPages: 10, targetLongSidePx: 800});
    expect(pages).toHaveLength(2);
    for (const p of pages) {
      expect(p.mime).toBe('image/png');
      expect([...p.data.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(Math.max(p.width, p.height)).toBe(800);
      expect(p.height).toBeGreaterThan(p.width); // US Letter is portrait
    }
  });

  it('renders text with real glyphs on a white background (not blank)', async () => {
    const [page] = await rasterizePdf(makePdf([['Consensus protocols']]), {maxPages: 1, targetLongSidePx: 800});
    // A blank white PNG compresses to a few hundred bytes; rendered text is clearly larger.
    expect(page.data.length).toBeGreaterThan(3000);
  });

  it('renders image-only (scanned) PDFs', async () => {
    const pages = await rasterizePdf(scanned(2), {maxPages: 5});
    expect(pages).toHaveLength(2);
  });

  it('falls back to JPEG when an image would exceed the size cap', async () => {
    const [page] = await rasterizePdf(makePdf([['x']]), {maxPages: 1, maxImageBytes: 10});
    expect(page.mime).toBe('image/jpeg');
  });

  it('refuses PDFs above the page limit and unreadable files', async () => {
    const over = await rejection(rasterizePdf(scanned(3), {maxPages: 2}));
    expect(over).toMatchObject({status: 422});
    expect(over.message).toMatch(/3 pages; the OCR limit is 2/);
    const bad = await rejection(rasterizePdf(Buffer.from('%PDF-1.4 nope'), {maxPages: 2}));
    expect(bad).toMatchObject({status: 422});
  });
});

describe('extractTranscription', () => {
  it.each([
    ['plain', 'Hello world', 'Hello world'],
    ['code fence', '```text\nHello\nworld\n```', 'Hello\nworld'],
    ['reasoning block', '<think>let me read it</think>\nHello world', 'Hello world'],
    ['multi-line reasoning', '<think>\nstep 1\nstep 2\n</think>Answer', 'Answer'],
    ['surrounding whitespace', '\n\n  Hello  \n', 'Hello'],
  ])('handles %s', (_name, input, expected) => {
    expect(extractTranscription(input)).toBe(expected);
  });

  it('handles structured content and junk', () => {
    expect(extractTranscription([{type: 'text', text: 'Hi '}, {type: 'text', text: 'there'}])).toBe('Hi there');
    expect(extractTranscription(undefined)).toBe('');
    expect(extractTranscription(42)).toBe('');
  });
});

describe('createLlmOcr (real LangChain client against a fake Groq server)', () => {
  it('sends one vision request per page with the instructions, the page image and the API key', async () => {
    const {fake, ocr, env} = await setup((_c, i) => `Text of page ${i + 1}`);
    const pages = await ocr.transcribePdf(scanned(2));
    expect(pages).toEqual(['Text of page 1', 'Text of page 2']);

    expect(fake.calls).toHaveLength(2);
    for (const call of fake.calls) {
      expect(call.authorization).toBe(`Bearer ${KEY}`);
      expect(call.body.model).toBe(env.OCR_MODEL);
      expect(call.body.temperature).toBe(0);
      const [system, human] = call.body.messages;
      expect(system.role).toBe('system');
      expect(String(system.content)).toMatch(/OCR engine/);
      expect(String(system.content)).toMatch(/untrusted data/);
      expect(human.role).toBe('user');
      const parts = human.content as {type: string; image_url?: {url: string}}[];
      expect(parts.map((p) => p.type)).toEqual(['text', 'image_url']);
      expect(parts[1].image_url!.url).toMatch(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]{100,}$/);
    }
  });

  it('cleans model output (reasoning blocks, code fences)', async () => {
    const {ocr} = await setup(() => '<think>hmm</think>\n```\nClean text\n```');
    expect(await ocr.transcribePdf(scanned(1))).toEqual(['Clean text']);
  });

  it('keeps blank pages as empty strings as long as some page has text', async () => {
    const {ocr} = await setup((_c, i) => (i === 1 ? '' : 'Some text'));
    expect(await ocr.transcribePdf(scanned(3))).toEqual(['Some text', '', 'Some text']);
  });

  it('rejects when no page has any text', async () => {
    const {ocr} = await setup(() => '   ');
    const err = await rejection(ocr.transcribePdf(scanned(2)));
    expect(err).toMatchObject({status: 422});
    expect(err.message).toMatch(/no readable text/);
  });

  it('enforces the OCR page limit before making any API call', async () => {
    const {fake, ocr} = await setup(() => 'x', {OCR_MAX_PAGES: '2'});
    const err = await rejection(ocr.transcribePdf(scanned(3)));
    expect(err.status).toBe(422);
    expect(fake.calls).toHaveLength(0);
  });

  it.each([
    [401, /rejected the server.s credentials/],
    [403, /rejected the server.s credentials/],
    [429, /busy or its free usage limit/],
    [400, /could not process a page image/],
    [413, /could not process a page image/],
    [500, /could not process this document/],
    [503, /could not process this document/],
  ])('maps an upstream %i to a safe, specific message', async (status, expected) => {
    const {ocr} = await setup(() => ({status}));
    const err = await rejection(ocr.transcribePdf(scanned(1)));
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({status: 502, code: 'upstream_error'});
    expect(err.message).toMatch(expected);
    // Neither the upstream error body nor the API key may reach the user.
    expect(err.message).not.toMatch(/sk-secret-body|upstream detail/);
    expect(err.message).not.toContain(KEY);
  });

  it('times out on a provider that never answers', async () => {
    const {ocr} = await setup(() => 'hang', {LLM_TIMEOUT_MS: '1000'});
    const err = await rejection(ocr.transcribePdf(scanned(1)));
    expect(err).toMatchObject({status: 502, code: 'upstream_error'});
    expect(err.message).toMatch(/too long|could not process/);
  });

  it('retries transient failures (429/500) the configured number of times', async () => {
    const {fake, ocr} = await setup((_c, i) => (i === 0 ? {status: 500, headers: {'retry-after': '0'}} : 'Recovered text'), {LLM_MAX_RETRIES: '2'});
    expect(await ocr.transcribePdf(scanned(1))).toEqual(['Recovered text']);
    expect(fake.calls).toHaveLength(2);
  });
});

describe('describeOcrFailure', () => {
  it('passes AppErrors through and hides unknown errors behind a generic message', () => {
    const app = new AppError(422, 'unprocessable', 'kept');
    expect(describeOcrFailure(app)).toBe(app);
    const generic = describeOcrFailure(new Error('ECONNRESET secret-token-abc'));
    expect(generic.message).not.toMatch(/secret-token/);
    expect(generic.status).toBe(502);
  });
});
