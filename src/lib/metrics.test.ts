import {describe, expect, it} from 'vitest';
import type {DocumentSummary, FeedbackEntry} from '../types';
import {averageBy, parseSeconds, ratingSummary, usageMetrics} from './metrics';

const entry = (over: Partial<FeedbackEntry> & {rating: number}): FeedbackEntry => ({
  id: Math.random().toString(36),
  documentId: 'd',
  comment: '',
  consent: false,
  params: {},
  createdAt: '2026-09-01T00:00:00Z',
  ...over,
});

const doc = (meta: DocumentSummary['sourceMetadata']): DocumentSummary =>
  ({id: 'x', title: 't', category: '', tags: [], comments: [], sourceMetadata: meta}) as unknown as DocumentSummary;

describe('ratingSummary', () => {
  it('has no average when nothing was rated (rather than a made-up one)', () => {
    expect(ratingSummary([])).toEqual({count: 0, average: null, distribution: [0, 0, 0, 0, 0], consentedCount: 0});
  });

  it('counts, averages and buckets the ratings', () => {
    const s = ratingSummary([entry({rating: 5, consent: true}), entry({rating: 4}), entry({rating: 4}), entry({rating: 1})]);
    expect(s.count).toBe(4);
    expect(s.average).toBe(3.5);
    expect(s.distribution).toEqual([1, 0, 0, 2, 1]);
    expect(s.consentedCount).toBe(1);
  });
});

describe('averageBy', () => {
  const entries = [
    entry({rating: 5, model: 'a', params: {length: 'concise', usedExamples: true}}),
    entry({rating: 3, model: 'a', params: {length: 'concise'}}),
    entry({rating: 2, model: 'b', params: {length: 'detailed'}}),
    entry({rating: 4, params: {}}),
  ];

  it('averages per model, most-rated first, and names a missing model "unknown"', () => {
    expect(averageBy(entries, 'model')).toEqual([
      {value: 'a', responses: 2, average: 4},
      {value: 'b', responses: 1, average: 2},
      {value: 'unknown', responses: 1, average: 4},
    ]);
  });

  it('compares ratings with and without examples (the before/after)', () => {
    expect(averageBy(entries, 'examples')).toEqual([
      {value: 'without examples', responses: 3, average: 3},
      {value: 'with examples', responses: 1, average: 5},
    ]);
  });

  it('groups by the parameters stored with each rating', () => {
    expect(averageBy(entries, 'length').map((g) => g.value)).toEqual(['concise', 'detailed', 'unknown']);
  });
});

describe('parseSeconds', () => {
  it.each([
    ['3.2s', 3.2],
    ['12s', 12],
    [' 0.5 s ', 0.5],
    ['1.4 seconds', null],
    ['', null],
    [undefined, null],
  ])('%s -> %s', (input, expected) => expect(parseSeconds(input)).toBe(expected));
});

describe('usageMetrics', () => {
  it('reports only what the summaries recorded', () => {
    const m = usageMetrics([
      doc({originalWordCount: 1000, summaryWordCount: 100, modelUsed: 'm1', processingTime: '2s', examplesUsed: 1}),
      doc({originalWordCount: 1000, summaryWordCount: 300, modelUsed: 'm1', processingTime: '4s'}),
      doc({modelUsed: 'm2'}),
      doc(undefined),
    ]);
    expect(m.documentCount).toBe(4);
    expect(m.measuredCount).toBe(2);
    expect(m.compressionPercent).toBe(80);
    expect(m.averageSeconds).toBe(3);
    expect(m.slowestSeconds).toBe(4);
    expect(m.timedCount).toBe(2);
    expect(m.byModel).toEqual([{model: 'm1', count: 2}, {model: 'm2', count: 1}]);
    expect(m.withExamples).toBe(1);
  });

  it('has no timing figures when nothing was timed', () => {
    const m = usageMetrics([doc(undefined)]);
    expect(m.averageSeconds).toBeNull();
    expect(m.slowestSeconds).toBeNull();
    expect(m.compressionPercent).toBeNull();
  });
});
