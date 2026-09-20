import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadGold, scoreRun} from './benchmark';
import {lcsLength, meanScores, rouge, tokenize} from './rouge';

describe('rouge', () => {
  it('scores an identical text as 1 and an unrelated one as 0', () => {
    const same = rouge('The quick brown fox jumps.', 'the quick brown fox jumps');
    expect(same).toEqual({rouge1: 1, rouge2: 1, rougeL: 1});
    expect(rouge('alpha beta gamma', 'one two three')).toEqual({rouge1: 0, rouge2: 0, rougeL: 0});
  });

  it('matches hand-computed values', () => {
    // candidate: the cat sat on the mat (6)   reference: the cat lay on the mat (6)
    const s = rouge('the cat sat on the mat', 'the cat lay on the mat');
    // unigram overlap: the x2, cat, on, mat = 5 of 6 on both sides
    expect(s.rouge1).toBeCloseTo(5 / 6, 10);
    // bigrams (5 each): "the cat", "on the", "the mat" match = 3 of 5
    expect(s.rouge2).toBeCloseTo(3 / 5, 10);
    // LCS: the cat on the mat = 5 of 6
    expect(s.rougeL).toBeCloseTo(5 / 6, 10);
  });

  it('clips repeated words so padding a summary with one word does not raise the score', () => {
    const padded = rouge('data data data data data data', 'data is useful');
    expect(padded.rouge1).toBeCloseTo((2 * (1 / 6) * (1 / 3)) / (1 / 6 + 1 / 3), 10);
  });

  it('is empty-safe', () => {
    expect(rouge('', 'anything here')).toEqual({rouge1: 0, rouge2: 0, rougeL: 0});
    expect(rouge('anything', '')).toEqual({rouge1: 0, rouge2: 0, rougeL: 0});
    expect(meanScores([])).toEqual({rouge1: 0, rouge2: 0, rougeL: 0});
  });

  it('tokenizes letters and digits in any script and ignores punctuation', () => {
    expect(tokenize('Mfumuko wa bei: 12.5% — Ñandú!')).toEqual(['mfumuko', 'wa', 'bei', '12', '5', 'ñandú']);
  });

  it('finds the longest common subsequence', () => {
    expect(lcsLength(['a', 'b', 'c', 'd'], ['b', 'd', 'x'])).toBe(2);
    expect(lcsLength([], ['a'])).toBe(0);
  });
});

describe('gold set and benchmark report', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gold-'));
  const doc = (id: string) => ({id, title: `T ${id}`, category: 'CS', source: 'word '.repeat(60), reference: 'A person wrote this reference summary of the text.'});

  it('loads single documents and arrays, in file order', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(doc('one')));
    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify([doc('two'), doc('three')]));
    fs.writeFileSync(path.join(dir, 'README.md'), 'ignored');
    expect(loadGold(dir).map((d) => d.id)).toEqual(['one', 'two', 'three']);
  });

  it('returns nothing (not an error) when the folder is missing', () => {
    expect(loadGold(path.join(tmp(), 'nope'))).toEqual([]);
  });

  it('names the file and field of a bad document, and rejects duplicate ids', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify({...doc('x'), reference: 'short'}));
    expect(() => loadGold(dir)).toThrow(/bad\.json.*reference/);
    const dup = tmp();
    fs.writeFileSync(path.join(dup, 'd.json'), JSON.stringify([doc('same'), doc('same')]));
    expect(() => loadGold(dup)).toThrow(/Duplicate gold document id "same"/);
  });

  it('averages the scores and says how many documents they cover', () => {
    const r = scoreRun(
      [
        {candidate: 'the cat sat', reference: 'the cat sat'},
        {candidate: 'alpha', reference: 'omega'},
      ],
      {model: 'm', mode: 'abstractive', length: 'balanced', now: new Date('2026-09-21T10:00:00Z')},
    );
    expect(r).toEqual({generatedAt: '2026-09-21T10:00:00.000Z', model: 'm', mode: 'abstractive', length: 'balanced', documents: 2, rouge1: 0.5, rouge2: 0.5, rougeL: 0.5});
  });
});
