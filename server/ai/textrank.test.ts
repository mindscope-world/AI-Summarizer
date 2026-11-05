import {describe, expect, it} from 'vitest';
import {sentenceSpans} from '../pipeline/segment';
import {extractKeySentences, rankSentences} from './textrank';

const CORE = [
  'Consensus protocols allow distributed nodes to agree on a single value despite failures.',
  'Paxos is the classic consensus protocol and Raft is a more understandable consensus protocol.',
  'Both consensus protocols rely on majority quorums so that nodes agree on one value safely.',
  'Leader election in consensus protocols lets nodes agree on which node coordinates the value.',
];
const OFF_TOPIC = [
  'The cafeteria opens at eight and serves tea, bread and fruit every single morning.',
  'Parking permits for the north campus must be renewed before the end of the month.',
];

describe('rankSentences', () => {
  it('returns scores that sum to about 1 and rank topically central sentences higher', () => {
    const scores = rankSentences([...CORE, ...OFF_TOPIC]);
    expect(scores).toHaveLength(6);
    expect(scores.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    const coreMin = Math.min(...scores.slice(0, 4));
    const offMax = Math.max(...scores.slice(4));
    expect(coreMin).toBeGreaterThan(offMax);
  });

  it('handles empty, single and stopword-only input', () => {
    expect(rankSentences([])).toEqual([]);
    expect(rankSentences(['Only one sentence here.'])).toEqual([1]);
    const scores = rankSentences(['the and for', 'with this that']);
    expect(scores).toHaveLength(2);
    expect(scores.every(Number.isFinite)).toBe(true);
  });
});

describe('extractKeySentences', () => {
  const text = [...CORE, ...OFF_TOPIC].join(' ');
  const spans = sentenceSpans(text, 'en');

  it('returns verbatim source sentences in document order', () => {
    const picked = extractKeySentences(text, spans, 3);
    expect(picked).toHaveLength(3);
    for (const p of picked) expect(text.slice(p.start, p.end)).toBe(p.text);
    expect(picked.map((p) => p.index)).toEqual([...picked.map((p) => p.index)].sort((a, b) => a - b));
  });

  it('prefers on-topic sentences over off-topic ones', () => {
    const picked = extractKeySentences(text, spans, 3);
    expect(picked.every((p) => /consensus|Paxos|quorum/i.test(p.text))).toBe(true);
  });

  it('skips headings, fragments and non-prose lines', () => {
    const messy = ['CHAPTER 3', 'Table 4.1 12 45 78 99 102 5', ...CORE].join('\n\n');
    const picked = extractKeySentences(messy, sentenceSpans(messy, 'en'), 10);
    expect(picked.length).toBe(4);
    expect(picked.some((p) => /CHAPTER|Table/.test(p.text))).toBe(false);
  });

  it('drops exact repeats of a sentence', () => {
    const dup = 'Consensus protocols allow distributed nodes to agree on a single value despite failures.';
    const t = [dup, dup, dup, CORE[1]].join(' ');
    const picked = extractKeySentences(t, sentenceSpans(t, 'en'), 4);
    expect(picked.map((p) => p.text).filter((x) => x === dup)).toHaveLength(1);
  });

  it('represents every part of a long document (grouped ranking)', () => {
    const topics = ['tea farming', 'railway building', 'university funding'];
    const parts = topics.map((topic, i) =>
      Array.from({length: 130}, (_, k) => `Section ${i} discusses ${topic} and how ${topic} affects the region in period ${k} of the study.`).join(' '),
    );
    const t = parts.join(' ');
    const picked = extractKeySentences(t, sentenceSpans(t, 'en'), 9);
    expect(picked).toHaveLength(9);
    for (const topic of topics) expect(picked.some((p) => p.text.includes(topic))).toBe(true);
  });

  it('returns fewer sentences when the document has fewer candidates', () => {
    const t = 'Short. Tiny one. Also small.';
    expect(extractKeySentences(t, sentenceSpans(t, 'en'), 5)).toEqual([]);
  });

  it('is fast on a large document', () => {
    const t = Array.from({length: 3000}, (_, i) => `Sentence ${i} explains a distinct idea number ${i} about topic ${i % 40} in some detail.`).join(' ');
    const start = Date.now();
    extractKeySentences(t, sentenceSpans(t, 'en'), 10);
    expect(Date.now() - start).toBeLessThan(5000);
  });
});
