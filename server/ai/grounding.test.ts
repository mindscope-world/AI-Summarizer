import {describe, expect, it} from 'vitest';
import {findUngroundedTerms, groundingWarning} from './grounding';

const SOURCE =
  'Myles reported revenue of $12,450 in July 2026, up 45% on the prior period. Nairobi and Mombasa were the two pilot cities. ' +
  'The detector, built by Kamau Analytics, flagged 1,200 accounts.';

describe('findUngroundedTerms', () => {
  it('passes a summary whose figures and names all come from the source', () => {
    const summary = 'Revenue reached $12,450 in July 2026, a 45% increase. Pilots ran in Nairobi and Mombasa, and 1,200 accounts were flagged.';
    expect(findUngroundedTerms(summary, SOURCE, {checkNames: true})).toEqual([]);
  });

  it('flags an invented number', () => {
    const missing = findUngroundedTerms('Revenue grew 62% to $15,000.', SOURCE, {checkNames: true});
    expect(missing).toEqual(expect.arrayContaining(['62%', '15,000']));
  });

  it('treats 12,450 / 12450 / 12,450. as the same number', () => {
    expect(findUngroundedTerms('Revenue was 12450 dollars.', SOURCE, {checkNames: false})).toEqual([]);
    expect(findUngroundedTerms('It came to 12,450.', SOURCE, {checkNames: false})).toEqual([]);
  });

  it('ignores small counts the model may have produced itself', () => {
    expect(findUngroundedTerms('The report makes 3 main points and 2 recommendations.', SOURCE, {checkNames: false})).toEqual([]);
  });

  it('still checks small percentages', () => {
    expect(findUngroundedTerms('Growth was 7%.', SOURCE, {checkNames: false})).toEqual(['7%']);
  });

  it('flags invented names, but not sentence-initial words or generic capitalised words', () => {
    const summary = 'Overall, the detector by Kamau Analytics worked. However, Zurich Labs disagreed. The pilot ran in Nairobi.';
    expect(findUngroundedTerms(summary, SOURCE, {checkNames: true})).toEqual(['Zurich', 'Labs']);
  });

  it('treats a capitalised word after a newline as a sentence start', () => {
    expect(findUngroundedTerms('First point.\nZurich is far away.', SOURCE, {checkNames: true})).toEqual([]);
  });

  it('skips name checks when the summary is a translation', () => {
    expect(findUngroundedTerms('Mradi ulifanyika Zurich.', SOURCE, {checkNames: false})).toEqual([]);
  });

  it('is case-insensitive when matching names against the source', () => {
    expect(findUngroundedTerms('The team in nairobi and Mombasa.', 'NAIROBI and mombasa', {checkNames: true})).toEqual([]);
  });
});

describe('groundingWarning', () => {
  it('is null when nothing is missing', () => {
    expect(groundingWarning([])).toBeNull();
  });

  it('lists up to eight terms and counts the rest', () => {
    const many = Array.from({length: 11}, (_, i) => `T${i}`);
    const w = groundingWarning(many)!;
    expect(w).toContain('T0');
    expect(w).toContain('T7');
    expect(w).not.toContain('T8,');
    expect(w).toContain('and 3 more');
  });
});
