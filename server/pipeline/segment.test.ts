import {describe, expect, it} from 'vitest';
import {chunkText, countParagraphs, countWords, estimateTokens, sentenceSpans} from './segment';

const sentence = (n: number) => `This is sentence number ${n} in the test document.`;
const doc = (count: number) => Array.from({length: count}, (_, i) => sentence(i + 1)).join(' ');

describe('counting', () => {
  it('counts words across scripts, apostrophes and numbers', () => {
    expect(countWords("It's a well-known 3.14 result")).toBe(5);
    expect(countWords('Habari za asubuhi, wanafunzi')).toBe(4);
    expect(countWords('   ')).toBe(0);
  });

  it('counts paragraphs', () => {
    expect(countParagraphs('a\n\nb\n\n\nc')).toBe(3);
    expect(countParagraphs('')).toBe(0);
  });
});

describe('sentenceSpans', () => {
  it('returns trimmed spans that slice back to whole sentences', () => {
    const text = 'First sentence. Second one!\n\nThird here? Yes.';
    const sentences = sentenceSpans(text, 'en').map((s) => text.slice(s.start, s.end));
    expect(sentences).toEqual(['First sentence.', 'Second one!', 'Third here?', 'Yes.']);
  });

  it('does not split on common abbreviations in English', () => {
    const text = 'Dr. Smith presented the results, e.g. the latency numbers. Everyone agreed.';
    expect(sentenceSpans(text, 'en')).toHaveLength(2);
  });

  it('handles Swahili and unknown language codes', () => {
    const text = 'Mwanafunzi alisoma kitabu. Alifurahi sana.';
    expect(sentenceSpans(text, 'sw')).toHaveLength(2);
    expect(sentenceSpans(text, 'other')).toHaveLength(2);
  });
});

describe('chunkText', () => {
  it('returns one chunk covering everything when the text fits', () => {
    const text = doc(5);
    const chunks = chunkText(text, sentenceSpans(text, 'en'), {maxTokens: 1000, overlapTokens: 50});
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({index: 0, start: 0, end: text.length});
  });

  it('returns no chunks for empty input', () => {
    expect(chunkText('', [], {maxTokens: 100, overlapTokens: 10})).toEqual([]);
  });

  it('respects the token budget, covers the whole text, overlaps, and always progresses', () => {
    const text = doc(200);
    const spans = sentenceSpans(text, 'en');
    const opts = {maxTokens: 120, overlapTokens: 30};
    const chunks = chunkText(text, spans, opts);

    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks[0].start).toBe(0);
    expect(chunks.at(-1)!.end).toBe(text.length);
    for (const [i, c] of chunks.entries()) {
      expect(c.index).toBe(i);
      expect(c.tokenEstimate).toBeLessThanOrEqual(opts.maxTokens);
      expect(estimateTokens(c.end - c.start)).toBe(c.tokenEstimate);
      if (i > 0) {
        const prev = chunks[i - 1];
        expect(c.start).toBeGreaterThan(prev.start); // progress
        expect(c.start).toBeLessThan(prev.end); // overlap, so no gaps either
      }
    }
    // Chunks start and end on sentence boundaries.
    for (const c of chunks) {
      expect(text.slice(c.start, c.end).startsWith('This is sentence')).toBe(true);
      expect(text.slice(c.start, c.end).endsWith('document.')).toBe(true);
    }
  });

  it('works with zero overlap', () => {
    const text = doc(60);
    const chunks = chunkText(text, sentenceSpans(text, 'en'), {maxTokens: 100, overlapTokens: 0});
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].start).toBeGreaterThanOrEqual(chunks[i - 1].end);
  });

  it('splits a single sentence larger than the budget instead of exceeding it', () => {
    const giant = Array.from({length: 400}, (_, i) => `word${i}`).join(' ') + '.';
    const chunks = chunkText(giant, sentenceSpans(giant, 'en'), {maxTokens: 100, overlapTokens: 0});
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.tokenEstimate).toBeLessThanOrEqual(100);
    expect(chunks.at(-1)!.end).toBe(giant.length);
  });

  it('hard-cuts text with no whitespace at all', () => {
    const blob = 'x'.repeat(5000);
    const chunks = chunkText(blob, [{start: 0, end: blob.length}], {maxTokens: 250, overlapTokens: 0});
    expect(chunks.length).toBeGreaterThanOrEqual(5);
    for (const c of chunks) expect(c.tokenEstimate).toBeLessThanOrEqual(250);
  });
});
