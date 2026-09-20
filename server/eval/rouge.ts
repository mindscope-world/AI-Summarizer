/**
 * ROUGE-1, ROUGE-2 and ROUGE-L (F1) between a generated summary and a human reference.
 *
 * A small, dependency-free implementation: words are lower-cased runs of letters and digits, with no
 * stemming or stop-word removal, and ROUGE-L is the longest common subsequence over the whole text
 * (not summary-level, sentence-by-sentence LCS). Scores are therefore comparable across runs of this
 * project, but they will differ a little from those printed by other ROUGE packages.
 */

export interface RougeScores {
  rouge1: number;
  rouge2: number;
  rougeL: number;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function ngrams(tokens: string[], n: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i + n <= tokens.length; i++) {
    const key = tokens.slice(i, i + n).join(' ');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const f1 = (overlap: number, candidateTotal: number, referenceTotal: number): number => {
  if (!overlap || !candidateTotal || !referenceTotal) return 0;
  const precision = overlap / candidateTotal;
  const recall = overlap / referenceTotal;
  return (2 * precision * recall) / (precision + recall);
};

function rougeN(candidate: string[], reference: string[], n: number): number {
  const c = ngrams(candidate, n);
  const r = ngrams(reference, n);
  let overlap = 0;
  for (const [gram, count] of c) overlap += Math.min(count, r.get(gram) ?? 0);
  return f1(overlap, Math.max(0, candidate.length - n + 1), Math.max(0, reference.length - n + 1));
}

/** Length of the longest common subsequence of two token lists, in O(min(m, n)) memory. */
export function lcsLength(a: string[], b: string[]): number {
  if (a.length < b.length) [a, b] = [b, a];
  let prev = new Array<number>(b.length + 1).fill(0);
  let curr = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

export function rouge(candidateText: string, referenceText: string): RougeScores {
  const candidate = tokenize(candidateText);
  const reference = tokenize(referenceText);
  return {
    rouge1: rougeN(candidate, reference, 1),
    rouge2: rougeN(candidate, reference, 2),
    rougeL: f1(lcsLength(candidate, reference), candidate.length, reference.length),
  };
}

export function meanScores(scores: RougeScores[]): RougeScores {
  const mean = (pick: (s: RougeScores) => number) => (scores.length ? scores.reduce((sum, s) => sum + pick(s), 0) / scores.length : 0);
  return {rouge1: mean((s) => s.rouge1), rouge2: mean((s) => s.rouge2), rougeL: mean((s) => s.rougeL)};
}
