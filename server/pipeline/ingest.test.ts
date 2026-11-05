import {afterEach, describe, expect, it, vi} from 'vitest';
import type {ExtractionResult} from '../../src/types';
import {AppError} from '../lib/errors';
import {makeDocx, makePdf} from '../testing/fixtures';
import {startFixtureServer, type FixtureServer} from '../testing/httpServer';
import {ingest, type IngestDeps, type IngestStage} from './ingest';
import type {OcrProvider} from './ocr';

const limits = {maxPdfPages: 50, maxExtractedChars: 1_000_000, urlTimeoutMs: 3000, urlMaxBytes: 2 * 1024 * 1024};
const deps = (over: Partial<IngestDeps> = {}): IngestDeps => ({limits, ...over});

const PROSE = [
  'Distributed consensus protocols allow independent nodes to agree on a single value even when some of them fail.',
  'Paxos and Raft are the two best known examples, and both rely on majority quorums to make progress safely.',
  'Leader election and log replication together keep every replica of the state machine identical over time.',
];

const rejection = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as AppError;

const servers: FixtureServer[] = [];
const serve = async (...args: Parameters<typeof startFixtureServer>) => {
  const s = await startFixtureServer(...args);
  servers.push(s);
  return s;
};
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

function checkInvariants(r: ExtractionResult) {
  expect(r.charCount).toBe(r.text.length);
  expect(r.stats.chunks).toBe(r.chunks.length);
  expect(r.chunks.length).toBeGreaterThan(0);
  for (const c of r.chunks) {
    expect(c.start).toBeGreaterThanOrEqual(0);
    expect(c.end).toBeLessThanOrEqual(r.text.length);
    expect(c.end).toBeGreaterThan(c.start);
  }
  expect(r.stats.sentences).toBeGreaterThan(0);
}

describe('ingest: PDF', () => {
  const page = (n: number) => [
    'University Lecture Notes',
    '',
    `Section ${n}. ${PROSE[0]}`,
    PROSE[1],
    '',
    `${PROSE[2]} This is page ${n} of the handout.`,
    '',
    `Page ${n} of 5`,
  ];

  it('extracts text, strips running headers/footers and keeps paragraph structure', async () => {
    const pdf = makePdf([1, 2, 3, 4, 5].map(page));
    const r = await ingest({kind: 'file', buffer: pdf, fileName: 'lecture.pdf'}, {}, deps());

    expect(r.source).toMatchObject({kind: 'file', format: 'pdf', fileName: 'lecture.pdf', pageCount: 5, ocrUsed: false});
    expect(r.text).not.toContain('University Lecture Notes');
    expect(r.text).not.toMatch(/Page \d of 5/);
    for (let n = 1; n <= 5; n++) expect(r.text).toContain(`Section ${n}.`);
    expect(r.stats.paragraphs).toBeGreaterThanOrEqual(10); // 2 paragraphs per page survived
    expect(r.language).toMatchObject({code: 'en', mixed: false});
    expect(r.warnings.join(' ')).toMatch(/Removed \d+ repeated header/);
    expect(r.wordCount).toBeGreaterThan(150);
    checkInvariants(r);
  });

  it('rejoins wrapped lines within a paragraph but not across a blank-line gap', async () => {
    const pdf = makePdf([['First paragraph starts here and', 'continues on a second line.', '', 'Second paragraph is separate.']]);
    const r = await ingest({kind: 'file', buffer: pdf, fileName: 'a.pdf'}, {}, deps());
    expect(r.text).toBe('First paragraph starts here and continues on a second line.\n\nSecond paragraph is separate.');
  });

  it('reports pages without a text layer when the rest of the document has text', async () => {
    const pdf = makePdf([PROSE, [], PROSE]);
    const r = await ingest({kind: 'file', buffer: pdf, fileName: 'mixed.pdf'}, {}, deps());
    expect(r.warnings.join(' ')).toMatch(/1 page\(s\) have no text layer/);
    expect(r.source.ocrUsed).toBe(false);
  });

  it('falls back to OCR for a scanned PDF and says so', async () => {
    const ocr: OcrProvider = {
      name: 'fake-ocr',
      transcribePdf: vi.fn(async () => [PROSE[0] + ' ' + PROSE[1], PROSE[2]]),
    };
    const pdf = makePdf([[], []]);
    const r = await ingest({kind: 'file', buffer: pdf, fileName: 'scan.pdf'}, {}, deps({ocr}));
    expect(ocr.transcribePdf).toHaveBeenCalledTimes(1);
    expect(r.source).toMatchObject({format: 'pdf', pageCount: 2, ocrUsed: true});
    expect(r.text).toContain('Paxos and Raft');
    expect(r.warnings.join(' ')).toMatch(/OCR \(fake-ocr\)/);
    checkInvariants(r);
  });

  it('does not call OCR when the PDF has a text layer', async () => {
    const ocr: OcrProvider = {name: 'fake-ocr', transcribePdf: vi.fn(async () => ['should not be used'])};
    await ingest({kind: 'file', buffer: makePdf([PROSE]), fileName: 'a.pdf'}, {}, deps({ocr}));
    expect(ocr.transcribePdf).not.toHaveBeenCalled();
  });

  it('rejects a scanned PDF clearly when OCR is unavailable', async () => {
    const err = await rejection(ingest({kind: 'file', buffer: makePdf([[]]), fileName: 'scan.pdf'}, {}, deps({ocr: undefined})));
    expect(err).toMatchObject({status: 422, code: 'unprocessable'});
    expect(err.message).toMatch(/no text layer/);
  });

  it('rejects a PDF that OCR also cannot read', async () => {
    const ocr: OcrProvider = {name: 'fake-ocr', transcribePdf: async () => ['   ', '']};
    const err = await rejection(ingest({kind: 'file', buffer: makePdf([[]]), fileName: 's.pdf'}, {}, deps({ocr})));
    expect(err).toMatchObject({status: 422});
    expect(err.message).toMatch(/No readable text/);
  });

  it('enforces the page limit', async () => {
    const pdf = makePdf([PROSE, PROSE, PROSE]);
    const err = await rejection(ingest({kind: 'file', buffer: pdf, fileName: 'a.pdf'}, {}, deps({limits: {...limits, maxPdfPages: 2}})));
    expect(err).toMatchObject({status: 422});
    expect(err.message).toMatch(/3 pages; the limit is 2/);
  });

  it('reports a corrupted PDF as unprocessable, not a server error', async () => {
    const err = await rejection(ingest({kind: 'file', buffer: Buffer.from('%PDF-1.4\nthis is not really a pdf'), fileName: 'bad.pdf'}, {}, deps()));
    expect(err).toMatchObject({status: 422, code: 'unprocessable'});
    expect(err.message).toMatch(/could not be read/);
  });
});

describe('ingest: DOCX, TXT and Markdown', () => {
  it('extracts DOCX paragraphs', async () => {
    const docx = await makeDocx([PROSE[0], PROSE[1], PROSE[2]]);
    const r = await ingest({kind: 'file', buffer: docx, fileName: 'notes.docx'}, {}, deps());
    expect(r.source.format).toBe('docx');
    expect(r.stats.paragraphs).toBe(3);
    expect(r.text).toContain('Leader election');
    checkInvariants(r);
  });

  it('reports a corrupted DOCX as unprocessable', async () => {
    const zipHeaderOnly = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0]);
    const err = await rejection(ingest({kind: 'file', buffer: zipHeaderOnly, fileName: 'bad.docx'}, {}, deps()));
    expect(err).toMatchObject({status: 422});
    expect(err.message).toMatch(/DOCX/);
  });

  it('reads UTF-8 text, stripping a BOM', async () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(PROSE.join('\n\n'), 'utf8')]);
    const r = await ingest({kind: 'file', buffer: buf, fileName: 'a.txt'}, {}, deps());
    expect(r.text.startsWith('Distributed')).toBe(true);
    expect(r.source.format).toBe('txt');
  });

  it('falls back to Windows-1252 for non-UTF-8 files, with a warning', async () => {
    const buf = Buffer.concat([Buffer.from('The caf'), Buffer.from([0xe9]), Buffer.from(' near the university serves good coffee daily.')]);
    const r = await ingest({kind: 'file', buffer: buf, fileName: 'old.txt'}, {}, deps());
    expect(r.text).toContain('café'.normalize());
    expect(r.warnings.join(' ')).toMatch(/Windows-1252/);
  });

  it('decodes UTF-16 with a byte-order mark', async () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(PROSE[0], 'utf16le')]);
    const r = await ingest({kind: 'file', buffer: buf, fileName: 'u16.txt'}, {}, deps());
    expect(r.text).toBe(PROSE[0]);
  });

  it('reads Markdown as text', async () => {
    const r = await ingest({kind: 'file', buffer: Buffer.from(`# Title\n\n${PROSE[0]}`), fileName: 'a.md'}, {}, deps());
    expect(r.source.format).toBe('md');
    expect(r.text).toContain('# Title');
  });
});

describe('ingest: pasted text', () => {
  it('cleans, detects language and chunks pasted text', async () => {
    const r = await ingest({kind: 'text', text: PROSE.join('\n\n')}, {}, deps());
    expect(r.source).toMatchObject({kind: 'text', format: 'text', ocrUsed: false});
    expect(r.language.code).toBe('en');
    expect(r.wordCount).toBe(PROSE.join(' ').split(/\s+/).length);
    expect(r.stats.paragraphs).toBe(3);
    checkInvariants(r);
  });

  it('honours stripReferences', async () => {
    const text = ['Intro one.', 'Body two.', 'Body three.', 'References', 'Smith (2020).'].join('\n\n');
    const r = await ingest({kind: 'text', text}, {stripReferences: true}, deps());
    expect(r.text).not.toContain('Smith');
  });

  it('rejects text that is empty after cleaning', async () => {
    for (const text of ['   \n\n  ', '\u200B\u200B', '....... 5']) {
      const err = await rejection(ingest({kind: 'text', text}, {}, deps()));
      expect(err, JSON.stringify(text)).toMatchObject({status: 422});
    }
  });

  it('enforces the extracted-character limit', async () => {
    const err = await rejection(ingest({kind: 'text', text: 'word '.repeat(100)}, {}, deps({limits: {...limits, maxExtractedChars: 100}})));
    expect(err).toMatchObject({status: 422});
    expect(err.message).toMatch(/above the limit/);
  });

  it('splits long documents into overlapping chunks', async () => {
    const text = Array.from({length: 400}, (_, i) => `Sentence ${i} explains one more idea about distributed systems in detail.`).join(' ');
    const r = await ingest({kind: 'text', text}, {}, deps({chunk: {maxTokens: 300, overlapTokens: 50}}));
    expect(r.chunks.length).toBeGreaterThan(5);
    for (const c of r.chunks) expect(c.tokenEstimate).toBeLessThanOrEqual(300);
    expect(r.chunks.at(-1)!.end).toBe(r.text.length);
  });

  it('reports progress through each stage in order', async () => {
    const stages: IngestStage[] = [];
    await ingest({kind: 'text', text: PROSE.join(' ')}, {}, deps({onStage: (s) => stages.push(s)}));
    expect(stages).toEqual(['extract', 'clean', 'detect', 'segment']);
  });
});

describe('ingest: file sniffing', () => {
  const kind = (buffer: Buffer, fileName: string) => ingest({kind: 'file', buffer, fileName}, {}, deps());

  it.each([
    ['zeros pretending to be a PDF', Buffer.alloc(2048), 'evil.pdf'],
    ['a PDF named .txt', makePdf([PROSE]), 'notes.txt'],
    ['an unknown extension', Buffer.from('hello world'), 'a.exe'],
    ['a legacy .doc (OLE2)', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), 'old.doc'],
    ['binary data named .txt', Buffer.concat([Buffer.from('text'), Buffer.alloc(16), Buffer.from('more')]), 'blob.txt'],
  ])('rejects %s with 415', async (_name, buffer, fileName) => {
    const err = await rejection(kind(buffer, fileName));
    expect(err).toMatchObject({status: 415, code: 'unsupported_media_type'});
  });

  it('rejects a DOCX/ZIP archive that is not named .docx, and a .docx that is not a ZIP', async () => {
    const docx = await makeDocx([PROSE[0]]);
    expect((await rejection(kind(docx, 'archive.zip'))).status).toBe(415);
    expect((await rejection(kind(docx, 'renamed.txt'))).status).toBe(415);
    expect((await rejection(kind(Buffer.from('plain text'), 'fake.docx'))).status).toBe(415);
  });
});

describe('ingest: URLs (fixture server on localhost, address guard relaxed for tests only)', () => {
  const urlDeps = () => deps({allowPrivateAddresses: true});
  const article = (body: string) => `<!doctype html><html><head>
    <title>Consensus in Practice - University Blog</title>
    <meta name="author" content="Dr. A. Writer"><meta property="og:site_name" content="EAU Engineering Blog">
    </head><body>
      <nav><a href="/">Home</a> <a href="/about">About us</a> <a href="/login">Log in</a></nav>
      <article><h1>Consensus in Practice</h1>${body}</article>
      <footer>Copyright 2026 Cookie settings Subscribe to our newsletter</footer>
    </body></html>`;
  const paras = PROSE.map((p) => `<p>${p} ${p}</p>`).join('');

  it('extracts the main article from HTML and leaves boilerplate out', async () => {
    const server = await serve((_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(article(paras + '<ul><li>Quorum voting</li><li>Leader election</li></ul>'));
    });
    const r = await ingest({kind: 'url', url: `${server.url}/post`}, {}, urlDeps());
    expect(r.source).toMatchObject({kind: 'url', format: 'html', url: `${server.url}/post`, ocrUsed: false});
    expect(r.source.title).toMatch(/Consensus in Practice/);
    expect(r.source.author).toBe('Dr. A. Writer');
    expect(r.source.siteName).toBe('EAU Engineering Blog');
    expect(r.text).toContain('Paxos and Raft');
    expect(r.text).toContain('- Quorum voting');
    expect(r.text).not.toMatch(/Cookie settings|Log in|newsletter/);
    expect(r.language.code).toBe('en');
    checkInvariants(r);
  });

  it('still extracts a very short page', async () => {
    const server = await serve((_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end('<html><body><p>Short page with a tiny amount of body text only.</p></body></html>');
    });
    const r = await ingest({kind: 'url', url: server.url}, {}, urlDeps());
    expect(r.text).toContain('Short page');
  });

  it('rejects a page that has no readable text (scripts only)', async () => {
    const server = await serve((_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end('<html><head><script>var a = 1;</script></head><body><script>render()</script></body></html>');
    });
    const err = await rejection(ingest({kind: 'url', url: server.url}, {}, urlDeps()));
    expect(err).toMatchObject({status: 422});
    expect(err.message).toMatch(/No readable text/);
  });

  it('follows redirects and reports the final URL', async () => {
    const server = await serve((req, res) => {
      if (req.url === '/old') return void res.writeHead(301, {Location: '/new'}).end();
      res.setHeader('Content-Type', 'text/plain');
      res.end(PROSE.join('\n\n'));
    });
    const r = await ingest({kind: 'url', url: `${server.url}/old`}, {}, urlDeps());
    expect(r.source.url).toBe(`${server.url}/new`);
    expect(r.source.format).toBe('txt');
  });

  it('reads a PDF served from a URL', async () => {
    const pdf = makePdf([PROSE]);
    const server = await serve((_req, res) => {
      res.setHeader('Content-Type', 'application/pdf');
      res.end(pdf);
    });
    const r = await ingest({kind: 'url', url: `${server.url}/paper.pdf`}, {}, urlDeps());
    expect(r.source).toMatchObject({format: 'pdf', pageCount: 1});
    expect(r.text).toContain('Paxos and Raft');
  });

  it('sniffs HTML when the server sends no useful content type', async () => {
    const server = await serve((_req, res) => {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.end(article(paras));
    });
    const r = await ingest({kind: 'url', url: server.url}, {}, urlDeps());
    expect(r.source.format).toBe('html');
  });

  it('refuses unsupported content types with 415', async () => {
    const server = await serve((_req, res) => {
      res.setHeader('Content-Type', 'image/png');
      res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
    const err = await rejection(ingest({kind: 'url', url: server.url}, {}, urlDeps()));
    expect(err).toMatchObject({status: 415});
    expect(err.message).toMatch(/image\/png/);
  });

  it('maps a 404 to a 502 upstream error', async () => {
    const server = await serve((_req, res) => void res.writeHead(404).end());
    const err = await rejection(ingest({kind: 'url', url: server.url}, {}, urlDeps()));
    expect(err).toMatchObject({status: 502, code: 'upstream_error'});
  });

  it('blocks private addresses by default (no relaxed guard)', async () => {
    const server = await serve((_req, res) => res.end('internal'));
    const err = await rejection(ingest({kind: 'url', url: server.url}, {}, deps()));
    expect(err).toMatchObject({status: 400});
  });
});
