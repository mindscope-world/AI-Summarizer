import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import type {SummaryLength, SummaryMode} from '../../src/types';
import {meanScores, rouge, type RougeScores} from './rouge';

/**
 * The offline benchmark: a small set of documents that people have summarised by hand
 * (`scripts/eval/gold/*.json`) is run through the real summarizer and scored against those
 * reference summaries. The published numbers describe that set only, never any one student's summary.
 */

export const goldDocumentSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  category: z.string().trim().min(1).default('General'),
  /** The full text to summarise. */
  source: z.string().trim().min(200, 'source is too short to be a real document'),
  /** A summary of `source` written by a person, not by a model. */
  reference: z.string().trim().min(40, 'reference is too short'),
  /** Who wrote the reference summary (a name or a role), for the record. */
  author: z.string().trim().optional(),
});
export type GoldDocument = z.infer<typeof goldDocumentSchema>;

/** Reads every `*.json` file in `dir`; each holds one gold document or an array of them. */
export function loadGold(dir: string): GoldDocument[] {
  if (!fs.existsSync(dir)) return [];
  const docs: GoldDocument[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const [i, item] of (Array.isArray(parsed) ? parsed : [parsed]).entries()) {
      const result = goldDocumentSchema.safeParse(item);
      if (!result.success) throw new Error(`${file}${Array.isArray(parsed) ? ` [${i}]` : ''}: ${result.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`);
      docs.push(result.data);
    }
  }
  const ids = docs.map((d) => d.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new Error(`Duplicate gold document id "${dup}".`);
  return docs;
}

export interface BenchmarkReport extends RougeScores {
  /** ISO time of the run. */
  generatedAt: string;
  model: string;
  mode: SummaryMode;
  length: SummaryLength;
  /** How many reference documents the scores are averaged over. */
  documents: number;
}

/** The report shown when no benchmark has been run: no numbers, so none can be mistaken for real ones. */
export const EMPTY_REPORT = {documents: 0} as const;

export function scoreRun(
  results: {candidate: string; reference: string}[],
  meta: {model: string; mode: SummaryMode; length: SummaryLength; now?: Date},
): BenchmarkReport {
  const mean = meanScores(results.map((r) => rouge(r.candidate, r.reference)));
  return {
    generatedAt: (meta.now ?? new Date()).toISOString(),
    model: meta.model,
    mode: meta.mode,
    length: meta.length,
    documents: results.length,
    rouge1: round(mean.rouge1),
    rouge2: round(mean.rouge2),
    rougeL: round(mean.rougeL),
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
