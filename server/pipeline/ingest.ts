import type {ExtractionResult, SourceFormat} from '../../src/types';
import {unprocessable, AppError} from '../lib/errors';
import {cleanDocument, type CleanOptions} from './clean';
import {extractDocx} from './docx';
import {extractHtml} from './html';
import {detectLanguage} from './language';
import type {OcrProvider} from './ocr';
import {extractPdf} from './pdf';
import {safeFetch, type FetchedResource} from './safeFetch';
import {chunkText, countParagraphs, countWords, DEFAULT_CHUNK_OPTIONS, sentenceSpans, type ChunkOptions} from './segment';
import {sniffFormat} from './sniff';
import {decodeText} from './text';

export type IngestStage = 'extract' | 'clean' | 'detect' | 'segment';

export type IngestInput =
  | {kind: 'file'; buffer: Buffer; fileName: string}
  | {kind: 'url'; url: string}
  | {kind: 'text'; text: string};

export interface IngestLimits {
  maxPdfPages: number;
  maxExtractedChars: number;
  urlTimeoutMs: number;
  urlMaxBytes: number;
}

export interface IngestDeps {
  limits: IngestLimits;
  /** Used only for PDFs with no text layer. When absent, such PDFs are rejected with a clear message. */
  ocr?: OcrProvider;
  chunk?: ChunkOptions;
  /** TESTS ONLY: lets the URL fetcher reach a local fixture server. */
  allowPrivateAddresses?: boolean;
  /** Progress hook (Phase 3 turns this into server-sent events). */
  onStage?: (stage: IngestStage) => void;
}

interface RawExtraction {
  pages: string[];
  format: SourceFormat;
  pageCount?: number;
  title?: string;
  author?: string;
  siteName?: string;
  ocrUsed: boolean;
  warnings: string[];
}

/** A PDF is treated as scanned when it averages fewer than this many non-space characters per page. */
const MIN_CHARS_PER_PAGE = 20;

async function extractPdfWithOcrFallback(buffer: Buffer, deps: IngestDeps): Promise<RawExtraction> {
  const pdf = await extractPdf(buffer, {maxPages: deps.limits.maxPdfPages});
  const warnings: string[] = [];
  const chars = pdf.pages.join('').replace(/\s/g, '').length;
  const scanned = chars < MIN_CHARS_PER_PAGE * pdf.pageCount || chars < 40;

  if (!scanned) {
    const empty = pdf.pages.filter((p) => !p.trim()).length;
    if (empty > 0) warnings.push(`${empty} page(s) have no text layer (images or scans) and were skipped.`);
    return {pages: pdf.pages, format: 'pdf', pageCount: pdf.pageCount, title: pdf.title, author: pdf.author, ocrUsed: false, warnings};
  }

  if (!deps.ocr) {
    throw unprocessable('This PDF has no text layer (it looks scanned) and OCR is not available on this server.');
  }
  const pages = await deps.ocr.transcribePdf(buffer);
  warnings.push(`This PDF has no text layer, so its text was recognised with OCR (${deps.ocr.name}). Check it for recognition errors.`);
  return {pages, format: 'pdf', pageCount: pdf.pageCount, title: pdf.title, author: pdf.author, ocrUsed: true, warnings};
}

async function extractFile(buffer: Buffer, fileName: string, deps: IngestDeps): Promise<RawExtraction> {
  const format = sniffFormat(buffer, fileName);
  if (format === 'pdf') return extractPdfWithOcrFallback(buffer, deps);
  if (format === 'docx') {
    const {text, warnings} = await extractDocx(buffer);
    return {pages: [text], format, ocrUsed: false, warnings};
  }
  const {text, warnings} = decodeText(buffer);
  return {pages: [text], format, ocrUsed: false, warnings};
}

function resourceFormat(res: FetchedResource): 'pdf' | 'docx' | 'html' | 'txt' {
  const type = res.contentType.split(';')[0].trim();
  const head = res.body.subarray(0, 1024);
  if (head.includes('%PDF-') || type === 'application/pdf') return 'pdf';
  if (type.includes('wordprocessingml.document')) return 'docx';
  if (type === 'text/html' || type === 'application/xhtml+xml') return 'html';
  if (type === 'text/plain' || type === 'text/markdown') return 'txt';
  if (!type || type === 'application/octet-stream') {
    if (head.toString('utf8').trimStart().startsWith('<')) return 'html';
    if (!res.body.subarray(0, 8192).includes(0)) return 'txt';
  }
  throw new AppError(415, 'unsupported_media_type', `The URL serves an unsupported content type (${type || 'unknown'}).`);
}

async function extractUrl(url: string, deps: IngestDeps): Promise<RawExtraction & {finalUrl: string}> {
  const res = await safeFetch(url, {
    timeoutMs: deps.limits.urlTimeoutMs,
    maxBytes: deps.limits.urlMaxBytes,
    allowPrivateAddresses: deps.allowPrivateAddresses,
  });
  const format = resourceFormat(res);

  if (format === 'pdf') return {...(await extractPdfWithOcrFallback(res.body, deps)), finalUrl: res.url};
  if (format === 'docx') {
    const {text, warnings} = await extractDocx(res.body);
    return {pages: [text], format, ocrUsed: false, warnings, finalUrl: res.url};
  }
  if (format === 'html') {
    const html = extractHtml(decodeText(res.body).text);
    return {
      pages: [html.text],
      format: 'html',
      title: html.title,
      author: html.author,
      siteName: html.siteName,
      ocrUsed: false,
      warnings: html.warnings,
      finalUrl: res.url,
    };
  }
  const {text, warnings} = decodeText(res.body);
  return {pages: [text], format: 'txt', ocrUsed: false, warnings, finalUrl: res.url};
}

/**
 * Pipeline stages 1-2 from the project workflow: extract -> clean -> detect language
 * -> segment. Never logs or retains document text.
 */
export async function ingest(input: IngestInput, options: CleanOptions, deps: IngestDeps): Promise<ExtractionResult> {
  deps.onStage?.('extract');

  let raw: RawExtraction;
  let sourceUrl: string | undefined;
  let fileName: string | undefined;
  if (input.kind === 'file') {
    raw = await extractFile(input.buffer, input.fileName, deps);
    fileName = input.fileName;
  } else if (input.kind === 'url') {
    const fetched = await extractUrl(input.url, deps);
    raw = fetched;
    sourceUrl = fetched.finalUrl;
  } else {
    raw = {pages: [input.text], format: 'text', ocrUsed: false, warnings: []};
  }

  const rawChars = raw.pages.reduce((n, p) => n + p.length, 0);
  if (rawChars > deps.limits.maxExtractedChars) {
    throw unprocessable(`The document contains more than ${deps.limits.maxExtractedChars.toLocaleString('en-US')} characters, which is above the limit.`);
  }

  deps.onStage?.('clean');
  const cleaned = cleanDocument(raw.pages, options);
  const wordCount = countWords(cleaned.text);
  if (wordCount === 0) {
    throw unprocessable('No readable text was found in this document.');
  }

  deps.onStage?.('detect');
  const language = detectLanguage(cleaned.text);

  deps.onStage?.('segment');
  const spans = sentenceSpans(cleaned.text, language.code);
  const chunks = chunkText(cleaned.text, spans, deps.chunk ?? DEFAULT_CHUNK_OPTIONS);

  const warnings = [...raw.warnings, ...cleaned.warnings];
  if (language.mixed) warnings.push('The text appears to mix more than one language.');

  return {
    text: cleaned.text,
    wordCount,
    charCount: cleaned.text.length,
    source: {
      kind: input.kind,
      format: raw.format,
      fileName,
      url: sourceUrl,
      title: raw.title,
      author: raw.author,
      siteName: raw.siteName,
      pageCount: raw.pageCount,
      ocrUsed: raw.ocrUsed,
    },
    language,
    stats: {paragraphs: countParagraphs(cleaned.text), sentences: spans.length, chunks: chunks.length},
    chunks,
    warnings,
  };
}
