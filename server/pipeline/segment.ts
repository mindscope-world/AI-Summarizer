import type {ExtractionChunk} from '../../src/types';

export interface Span {
  start: number;
  end: number;
}

export interface ChunkOptions {
  /** Approximate token budget per chunk. */
  maxTokens: number;
  /** Approximate tokens repeated at the start of the next chunk for continuity. */
  overlapTokens: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {maxTokens: 6000, overlapTokens: 200};

/** Rough token estimate (about 4 characters per token); good enough for budgeting. */
export const estimateTokens = (charCount: number) => Math.ceil(charCount / 4);

const LOCALES: Record<string, string> = {en: 'en', sw: 'sw', fr: 'fr'};

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-.]*/gu);
  return matches ? matches.length : 0;
}

export function countParagraphs(text: string): number {
  return text ? text.split(/\n{2,}/).filter((p) => p.trim()).length : 0;
}

/** Abbreviations after which a full stop does not end a sentence (ICU splits after some of these). */
const ABBREVIATIONS = new Set(['dr', 'mr', 'mrs', 'ms', 'prof', 'fig', 'figs', 'eq', 'eqs', 'vs', 'cf', 'jr', 'sr', 'st', 'inc', 'ltd', 'dept', 'univ', 'approx']);

/** Merges a span into the next one when it ends with an abbreviation such as "Dr." or "Fig.". */
function mergeAbbreviationSplits(text: string, spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    const prev = out.at(-1);
    if (prev) {
      const lastWord = text.slice(prev.start, prev.end).match(/([A-Za-z]+)\.$/)?.[1]?.toLowerCase();
      if (lastWord && ABBREVIATIONS.has(lastWord)) {
        prev.end = span.end;
        continue;
      }
    }
    out.push({...span});
  }
  return out;
}

/** Sentence boundaries as character spans (whitespace trimmed) into `text`. */
export function sentenceSpans(text: string, languageCode: string): Span[] {
  const segmenter = new Intl.Segmenter(LOCALES[languageCode] ?? 'en', {granularity: 'sentence'});
  const spans: Span[] = [];
  for (const {segment, index} of segmenter.segment(text)) {
    const trimmedStart = segment.length - segment.trimStart().length;
    const trimmed = segment.trim();
    if (!trimmed) continue;
    spans.push({start: index + trimmedStart, end: index + trimmedStart + trimmed.length});
  }
  return mergeAbbreviationSplits(text, spans);
}

/** Splits any span longer than `maxChars` at whitespace so no single unit can blow the budget. */
function capSpanLength(text: string, spans: Span[], maxChars: number): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    let {start} = span;
    while (span.end - start > maxChars) {
      let cut = text.lastIndexOf(' ', start + maxChars);
      if (cut <= start) cut = start + maxChars; // no whitespace: hard cut
      out.push({start, end: cut});
      start = cut;
      while (start < span.end && /\s/.test(text[start])) start++;
    }
    if (start < span.end) out.push({start, end: span.end});
  }
  return out;
}

/**
 * Packs consecutive sentences into chunks of at most `maxTokens`, repeating roughly
 * `overlapTokens` of trailing context at the start of the next chunk. Chunks are
 * returned as offsets into `text`, so nothing is duplicated in memory or on the wire.
 */
export function chunkText(text: string, spans: Span[], options: ChunkOptions = DEFAULT_CHUNK_OPTIONS): ExtractionChunk[] {
  if (!spans.length) return [];
  const maxChars = options.maxTokens * 4;
  const units = capSpanLength(text, spans, maxChars);
  const tokens = (from: number, to: number) => estimateTokens(units[to].end - units[from].start);

  const chunks: ExtractionChunk[] = [];
  let first = 0;
  while (first < units.length) {
    let last = first;
    while (last + 1 < units.length && tokens(first, last + 1) <= options.maxTokens) last++;

    chunks.push({
      index: chunks.length,
      start: units[first].start,
      end: units[last].end,
      tokenEstimate: tokens(first, last),
    });
    if (last === units.length - 1) break;

    // Step back from the end to carry over about `overlapTokens`, always making progress.
    let next = last + 1;
    while (next - 1 > first && tokens(next - 1, last) <= options.overlapTokens) next--;
    first = Math.max(next, first + 1);
  }
  return chunks;
}
