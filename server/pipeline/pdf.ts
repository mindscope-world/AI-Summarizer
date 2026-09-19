import {unprocessable} from '../lib/errors';

export interface PdfExtraction {
  /** One string per page; lines joined with "\n", paragraph gaps as blank lines. */
  pages: string[];
  pageCount: number;
  title?: string;
  author?: string;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  hasEOL?: boolean;
}

interface PdfLine {
  text: string;
  y: number;
}

/** Groups positioned text items into visual lines (top to bottom, in reading order). */
function itemsToLines(items: PdfTextItem[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let current: PdfLine | null = null;

  for (const item of items) {
    if (typeof item.str !== 'string') continue; // marked-content entries carry no text
    const y = item.transform[5];
    if (!current || Math.abs(y - current.y) > 2) {
      if (current) lines.push(current);
      current = {text: '', y};
    }
    current.text += item.str;
    if (item.hasEOL) {
      lines.push(current);
      current = null;
    }
  }
  if (current) lines.push(current);
  return lines.filter((l) => l.text.trim() !== '');
}

/**
 * The usual distance between consecutive lines, measured over the whole document.
 * A lower quartile is used (not the median) so paragraph gaps, which are the larger
 * values, never define "normal" spacing on pages with only a few lines.
 */
function typicalLineGap(pages: PdfLine[][]): number {
  const gaps: number[] = [];
  for (const lines of pages) {
    for (let i = 1; i < lines.length; i++) {
      const gap = Math.abs(lines[i - 1].y - lines[i].y);
      if (gap > 0) gaps.push(gap);
    }
  }
  if (!gaps.length) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor((gaps.length - 1) * 0.25)];
}

/** Joins lines with a blank line wherever the vertical gap is clearly larger than normal (a paragraph break). */
function linesToText(lines: PdfLine[], typicalGap: number): string {
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (i > 0 && typicalGap > 0 && Math.abs(lines[i - 1].y - line.y) > typicalGap * 1.5) out.push('');
    out.push(line.text.replace(/\s+$/, ''));
  });
  return out.join('\n');
}

/** PDF metadata is often junk ("()", "untitled", "Microsoft Word - x.doc"); keep only something title-like. */
export function usableMetadataText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (v.length < 3 || !/[\p{L}\p{N}]{2,}/u.test(v)) return undefined;
  if (/^(untitled|unknown|microsoft word\b.*)$/i.test(v)) return undefined;
  return v;
}

export async function extractPdf(buffer: Buffer, opts: {maxPages: number}): Promise<PdfExtraction> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // pdf.js takes ownership of the array it is given, so hand it a copy.
  const task = pdfjs.getDocument({data: new Uint8Array(buffer), verbosity: 0});
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    await task.destroy().catch(() => undefined);
    const name = err instanceof Error ? err.name : '';
    if (name === 'PasswordException') throw unprocessable('The PDF is password-protected. Remove the password and try again.');
    throw unprocessable('The PDF could not be read. It may be corrupted.');
  }

  try {
    if (doc.numPages > opts.maxPages) {
      throw unprocessable(`The PDF has ${doc.numPages} pages; the limit is ${opts.maxPages}.`);
    }

    const pageLines: PdfLine[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pageLines.push(itemsToLines(content.items as unknown as PdfTextItem[]));
      page.cleanup();
    }
    const gap = typicalLineGap(pageLines);
    const pages = pageLines.map((lines) => linesToText(lines, gap));

    let title: string | undefined;
    let author: string | undefined;
    try {
      const info = (await doc.getMetadata()).info as {Title?: unknown; Author?: unknown};
      title = usableMetadataText(info?.Title);
      author = usableMetadataText(info?.Author);
    } catch {
      // metadata is optional
    }
    return {pages, pageCount: doc.numPages, title, author};
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
