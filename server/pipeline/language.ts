import {franc, francAll} from 'franc-min';
import type {DetectedLanguage} from '../../src/types';

const KNOWN: Record<string, {code: 'en' | 'sw' | 'fr'; name: string}> = {
  eng: {code: 'en', name: 'English'},
  swh: {code: 'sw', name: 'Swahili'},
  swa: {code: 'sw', name: 'Swahili'},
  fra: {code: 'fr', name: 'French'},
};

const MIN_SAMPLE_CHARS = 60;
const MAX_SAMPLES = 40;
/** A paragraph counts as running prose (worth a vote) when it has at least this many plain words. */
const MIN_PROSE_WORDS = 12;

/**
 * Without real prose (forms, slide fragments, label lists) the detector's top two guesses are often
 * nearly tied. Below this margin between them, a sample is not trusted.
 */
const MIN_UNPROSE_MARGIN = 0.05;
const UNRELIABLE_CONFIDENCE_CAP = 0.6;

/** Plain alphabetic words of 3+ letters: commands, paths, numbers and symbol soup don't count. */
const plainWords = (s: string) => s.split(/\s+/).filter((w) => /^\p{L}{3,}[.,;:!?]?$/u.test(w)).length;

/** Words that sit in running sentences: lines with fewer than 5 plain words (labels, list items) add nothing. */
const proseWords = (paragraph: string) =>
  paragraph.split('\n').reduce((n, line) => {
    const words = plainWords(line);
    return words >= 5 ? n + words : n;
  }, 0);

function displayName(iso3: string): string {
  try {
    return new Intl.DisplayNames(['en'], {type: 'language'}).of(iso3) ?? iso3;
  } catch {
    return iso3;
  }
}

/**
 * Detects the dominant language by voting over evenly spaced paragraphs (weighted by
 * length), and flags "mixed" when a second language holds a substantial share.
 */
export function detectLanguage(text: string): DetectedLanguage {
  const undetermined: DetectedLanguage = {code: 'und', name: 'Undetermined', confidence: 0, mixed: false};
  if (text.trim().length < 30) return undetermined;

  // Only real prose votes: on technical documents the detector otherwise labels command
  // lines, paths and reference lists as French, Spanish, etc. and reports a false "mixed".
  const long = text.split(/\n{2,}/).filter((p) => p.length >= MIN_SAMPLE_CHARS);
  const prose = long.filter((p) => proseWords(p) >= MIN_PROSE_WORDS);
  const reliable = prose.length > 0;
  const pool = reliable ? prose : long;
  const step = Math.max(1, Math.floor(pool.length / MAX_SAMPLES));
  const samples = pool.length ? pool.filter((_, i) => i % step === 0).slice(0, MAX_SAMPLES) : [text.slice(0, 2000)];

  const weights = new Map<string, number>();
  const sampleCounts = new Map<string, number>();
  let total = 0;
  for (const sample of samples) {
    let iso3: string;
    if (reliable) {
      iso3 = franc(sample.slice(0, 2000));
    } else {
      const [best, next] = francAll(sample.slice(0, 2000));
      if (!best || best[0] === 'und' || best[1] - (next?.[1] ?? 0) < MIN_UNPROSE_MARGIN) continue;
      iso3 = best[0];
    }
    if (iso3 === 'und') continue;
    weights.set(iso3, (weights.get(iso3) ?? 0) + sample.length);
    sampleCounts.set(iso3, (sampleCounts.get(iso3) ?? 0) + 1);
    total += sample.length;
  }
  if (total < 40) return undetermined;

  const ranked = [...weights.entries()].sort((a, b) => b[1] - a[1]);
  const [topIso, topWeight] = ranked[0];
  const share = topWeight / total;
  const secondShare = ranked[1] ? ranked[1][1] / total : 0;

  const known = KNOWN[topIso];
  const second = ranked[1];
  // "Mixed" is only claimed between languages we support, with real evidence, and never when
  // the text had no prose to judge by.
  const mixed = reliable && total >= 400 && secondShare >= 0.25 && !!second && second[0] in KNOWN && sampleCounts.get(second[0])! >= 2;
  return {
    code: known?.code ?? 'other',
    iso3: topIso,
    name: known?.name ?? displayName(topIso),
    confidence: Math.round((reliable ? share : Math.min(share, UNRELIABLE_CONFIDENCE_CAP)) * 100) / 100,
    mixed,
  };
}
