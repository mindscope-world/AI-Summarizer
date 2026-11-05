/**
 * Text cleaning: turns raw extractor output (PDF pages, DOCX/HTML/TXT text) into
 * normalised paragraphs. Pure functions, no I/O.
 */

export interface CleanOptions {
  /** Drop a trailing "References"/"Bibliography" section. */
  stripReferences?: boolean;
}

export interface CleanResult {
  text: string;
  warnings: string[];
}

const LIGATURES: Record<string, string> = {
  '\uFB00': 'ff',
  '\uFB01': 'fi',
  '\uFB02': 'fl',
  '\uFB03': 'ffi',
  '\uFB04': 'ffl',
  '\uFB05': 'st',
  '\uFB06': 'st',
};

const PAGE_NUMBER_LINE = [
  /^(?:page\s+)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i,
  /^[-–—]\s*\d{1,4}\s*[-–—]$/,
  /^[ivx]{1,5}$/i,
];
const LIST_MARKER = /^(?:[•·▪◦‣\-–—*]|\d{1,3}[.)]|\(?[a-z][.)])\s+/i;
const MD_HEADING = /^#{1,6}\s/;
const DOT_LEADER = /^.{0,120}(?:\.\s?){4,}\s*\d{1,4}$/;
const REFERENCES_HEADING = /^(?:\d{1,2}[.)]?\s+)?(?:references|reference list|bibliography|works cited)$/i;

const endsSentence = (line: string) => /[.!?:;"”'’)\]]$/.test(line);

/** Character-level normalisation shared by every source. */
function normalizeChars(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n\n')
    .normalize('NFC')
    .replace(/[\uFB00-\uFB06]/g, (c) => LIGATURES[c] ?? c)
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '') // soft hyphen, zero-width chars, BOM
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ') // exotic spaces
    .replace(/[\u0000-\u0008\u000B\u000E-\u001F\u007F]/g, '') // control chars (keeps \t and \n)
    .replace(/[ \t]+/g, ' ');
}

/**
 * Comparison key for spotting running headers/footers. Only genuine page-number
 * patterns are normalised ("Page 3 of 9", "3 | Title", "Title - 3"), so body lines
 * that merely contain different numbers are never mistaken for repeats.
 */
const keyOf = (line: string) =>
  line
    .toLowerCase()
    .replace(/\bpage\s+\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?/g, 'page #')
    .replace(/^\d{1,4}\s*[|\u2022\-\u2013\u2014]\s+/, '# | ')
    .replace(/\s+[|\u2022\-\u2013\u2014]\s*\d{1,4}$/, ' | #')
    .replace(/\s+/g, ' ');
const nonEmptyIndexes = (lines: string[]) => lines.flatMap((l, i) => (l !== '' ? [i] : []));

/**
 * Removes running headers/footers (short lines repeated at the top/bottom of many
 * pages) and bare page numbers. Only looks at the first/last few lines of a page so
 * genuine body text that happens to repeat is left alone.
 */
function stripPageFurniture(pages: string[][]): {pages: string[][]; removed: number} {
  const threshold = Math.max(3, Math.ceil(pages.length * 0.5));
  // Edge window scales with page length so it can never reach into the body of a short page.
  const edge = (lines: string[]) => {
    const idx = nonEmptyIndexes(lines);
    const k = idx.length >= 8 ? 3 : idx.length >= 5 ? 2 : 1;
    return {top: idx.slice(0, k), bottom: idx.slice(-k)};
  };

  const seen = new Map<string, number>();
  for (const lines of pages) {
    const {top, bottom} = edge(lines);
    const keys = new Set([...top, ...bottom].map((i) => keyOf(lines[i])));
    for (const k of keys) seen.set(k, (seen.get(k) ?? 0) + 1);
  }

  let removed = 0;
  const out = pages.map((lines) => {
    const {top, bottom} = edge(lines);
    const drop = new Set<number>();
    for (const i of new Set([...top, ...bottom])) {
      const line = lines[i];
      const repeated = line.length <= 120 && (seen.get(keyOf(line)) ?? 0) >= threshold;
      const isNumber = PAGE_NUMBER_LINE.some((re) => re.test(line));
      const nearEdge = top.slice(0, 2).includes(i) || bottom.slice(-2).includes(i);
      if (repeated || (isNumber && nearEdge)) drop.add(i);
    }
    removed += drop.size;
    return lines.filter((_, i) => !drop.has(i));
  });
  return {pages: out, removed};
}

/** Joins page texts, healing a paragraph that continues across a page break. */
function joinPages(pages: string[][]): string {
  let out = '';
  for (const lines of pages) {
    const page = lines.join('\n').replace(/^\n+|\n+$/g, '');
    if (!page) continue;
    if (!out) {
      out = page;
      continue;
    }
    const prevLast = out.split('\n').pop() ?? '';
    const continues = !endsSentence(prevLast) && /^\p{Ll}/u.test(page);
    out += (continues ? '\n' : '\n\n') + page;
  }
  return out;
}

/** Width (in characters) at which the document appears to be hard-wrapped, or 0 if it doesn't. */
function detectWrapWidth(paragraphs: string[][]): number {
  const lengths = paragraphs.filter((p) => p.length > 1).flatMap((p) => p.map((l) => l.length));
  if (lengths.length < 6) return 0;
  const sorted = [...lengths].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return p95 >= 40 ? p95 : 0;
}

/** Rejoins hard-wrapped lines into paragraphs; keeps line breaks for lists, headings and short note-style lines. */
function reflow(text: string): string {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean));
  const width = detectWrapWidth(paragraphs);

  const joined = paragraphs
    .filter((lines) => lines.length)
    .map((lines) => {
      let out = lines[0];
      for (let i = 1; i < lines.length; i++) {
        const prev = lines[i - 1];
        const next = lines[i];
        const protectedBreak = LIST_MARKER.test(next) || MD_HEADING.test(next) || MD_HEADING.test(prev);
        const clearContinuation = !endsSentence(prev) && /^\p{Ll}/u.test(next);
        const fullWidthLine = width > 0 && prev.length >= width * 0.8;
        const wrap = !protectedBreak && (clearContinuation || fullWidthLine);
        out += (wrap ? ' ' : '\n') + next;
      }
      return out;
    });
  return joined.join('\n\n');
}

function dropReferences(text: string): {text: string; dropped: boolean} {
  const paragraphs = text.split('\n\n');
  for (let i = paragraphs.length - 1; i >= Math.floor(paragraphs.length * 0.4); i--) {
    if (REFERENCES_HEADING.test(paragraphs[i].trim())) {
      return {text: paragraphs.slice(0, i).join('\n\n'), dropped: true};
    }
  }
  return {text, dropped: false};
}

/**
 * @param pages One string per page for paged sources (PDF), or a single element for everything else.
 */
export function cleanDocument(pages: string[], options: CleanOptions = {}): CleanResult {
  const warnings: string[] = [];

  let pageLines = pages.map((p) =>
    normalizeChars(p)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => !DOT_LEADER.test(l)),
  );

  if (pageLines.length >= 4) {
    const {pages: stripped, removed} = stripPageFurniture(pageLines);
    pageLines = stripped;
    if (removed > 0) warnings.push(`Removed ${removed} repeated header/footer or page-number lines.`);
  }

  let text = joinPages(pageLines);
  // Repair words split across lines by hyphenation ("infor-\nmation").
  text = text.replace(/(\p{L}{2})-\n(\p{Ll})/gu, '$1$2');
  text = reflow(text);

  if (options.stripReferences) {
    const result = dropReferences(text);
    text = result.text;
    if (result.dropped) warnings.push('Dropped the trailing references/bibliography section.');
  }

  return {text: text.replace(/\n{3,}/g, '\n\n').trim(), warnings};
}
