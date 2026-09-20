import {countWords, type Span} from '../pipeline/segment';

/**
 * Extractive summarisation without an LLM: TextRank over a sentence-similarity graph.
 * The output is always verbatim sentences from the source, and it costs no API tokens,
 * so it works for documents of any length.
 */

const STOPWORDS = new Set(
  (
    // English
    'the and for are but not you all any can had her was one our out has have his how its may new now old see two way who did get let put say she too use ' +
    'that with this from they will would there their what about which when your said each than them then these those been being into over such only also more most ' +
    'some very just like does doing were where while other after before because between through during under again further once both few own same should could ' +
    // Swahili
    'na ya wa kwa ni la za katika kuwa cha vya hii huo hiyo yake wake yao wao kama pia lakini au ili kwamba baada kabla hadi sana zaidi bado tu ndani nje juu chini ' +
    // French
    'les des une que qui dans pour par sur est sont avec pas plus mais comme aux ces cette elle ils elles nous vous leur leurs ainsi donc alors'
  ).split(/\s+/),
);

const TOKEN = /\p{L}[\p{L}'-]{2,}/gu;

function termCounts(sentence: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const raw of sentence.toLowerCase().match(TOKEN) ?? []) {
    if (STOPWORDS.has(raw)) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return counts;
}

/**
 * PageRank scores (summing to 1) for a group of sentences. Edges are TF-IDF cosine similarities.
 * Meant for groups of up to a few hundred sentences.
 */
export function rankSentences(sentences: string[]): number[] {
  const n = sentences.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  const counts = sentences.map(termCounts);
  const df = new Map<string, number>();
  for (const c of counts) for (const term of c.keys()) df.set(term, (df.get(term) ?? 0) + 1);

  const vectors = counts.map((c) => {
    const v = new Map<string, number>();
    let norm = 0;
    for (const [term, tf] of c) {
      const w = (1 + Math.log(tf)) * Math.log(1 + n / df.get(term)!);
      v.set(term, w);
      norm += w * w;
    }
    return {v, norm: Math.sqrt(norm)};
  });

  // Similarity matrix (upper triangle mirrored). Groups are small, so O(n^2) is fine.
  const sim: number[][] = Array.from({length: n}, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    if (!vectors[i].norm) continue;
    for (let j = i + 1; j < n; j++) {
      if (!vectors[j].norm) continue;
      const [small, large] = vectors[i].v.size <= vectors[j].v.size ? [vectors[i].v, vectors[j].v] : [vectors[j].v, vectors[i].v];
      let dot = 0;
      for (const [term, w] of small) {
        const other = large.get(term);
        if (other) dot += w * other;
      }
      const cos = dot / (vectors[i].norm * vectors[j].norm);
      sim[i][j] = sim[j][i] = cos;
    }
  }
  const outWeight = sim.map((row) => row.reduce((a, b) => a + b, 0));

  const damping = 0.85;
  let rank = new Array<number>(n).fill(1 / n);
  for (let iter = 0; iter < 50; iter++) {
    const next = new Array<number>(n).fill((1 - damping) / n);
    for (let j = 0; j < n; j++) {
      if (!outWeight[j]) {
        // Dangling node: spread its rank evenly.
        for (let i = 0; i < n; i++) next[i] += (damping * rank[j]) / n;
        continue;
      }
      for (let i = 0; i < n; i++) if (sim[j][i]) next[i] += (damping * rank[j] * sim[j][i]) / outWeight[j];
    }
    let delta = 0;
    for (let i = 0; i < n; i++) delta += Math.abs(next[i] - rank[i]);
    rank = next;
    if (delta < 1e-6) break;
  }
  return rank;
}

export interface RankedSentence {
  /** Index into the document's sentence list. */
  index: number;
  start: number;
  end: number;
  text: string;
  /** Rank normalised within its group (0-1), so groups are comparable. */
  score: number;
}

const GROUP_SIZE = 120;
const MIN_WORDS = 6;
const MAX_WORDS = 60;

/** Sentences that read as prose, as opposed to headings, fragments or run-ons from bad extraction. */
function isCandidate(sentence: string): boolean {
  const words = countWords(sentence);
  if (words < MIN_WORDS || words > MAX_WORDS) return false;
  if (!/[.!?]["')\]]?$/.test(sentence.trim())) return false; // headings and list stubs rarely end like a sentence
  const letters = (sentence.match(/\p{L}/gu) ?? []).length;
  return letters / sentence.length > 0.6; // drops tables, code and reference lists
}

/**
 * Picks the `count` most central sentences from the whole document, in document order.
 * The document is ranked in groups (so long documents stay cheap), then sentences are taken
 * round-robin across the groups, best first, so every part of a long document is represented
 * rather than one dense section dominating.
 */
export function extractKeySentences(text: string, spans: Span[], count: number): RankedSentence[] {
  const sentences = spans.map((s) => text.slice(s.start, s.end));
  const perGroup: RankedSentence[][] = [];

  for (let from = 0; from < sentences.length; from += GROUP_SIZE) {
    const group = sentences.slice(from, from + GROUP_SIZE);
    const scores = rankSentences(group);
    const max = Math.max(...scores, 1e-12);
    const candidates = group
      .map((sentence, i) => ({sentence, i, score: scores[i] / max}))
      .filter((c) => isCandidate(c.sentence))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((c) => {
        const index = from + c.i;
        return {index, start: spans[index].start, end: spans[index].end, text: c.sentence, score: c.score};
      });
    if (candidates.length) perGroup.push(candidates);
  }

  const chosen: RankedSentence[] = [];
  const seen = new Set<string>(); // skip exact repeats (boilerplate)
  for (let round = 0; chosen.length < count && perGroup.some((g) => g.length > round); round++) {
    for (const group of perGroup) {
      if (chosen.length >= count) break;
      const candidate = group[round];
      if (!candidate) continue;
      const key = candidate.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (seen.has(key)) continue;
      seen.add(key);
      chosen.push(candidate);
    }
  }
  return chosen.sort((a, b) => a.index - b.index);
}
