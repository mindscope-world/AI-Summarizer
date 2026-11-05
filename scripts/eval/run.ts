/**
 * Offline benchmark: runs the real summarizer over the gold set in scripts/eval/gold and scores it
 * with ROUGE against the human reference summaries. Usage:
 *
 *   npm run eval -- [--mode abstractive|extractive] [--length concise|balanced|detailed] [--limit N]
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadGold, scoreRun} from '../../server/eval/benchmark';
import {rouge, type RougeScores} from '../../server/eval/rouge';
import {createLlmGateway} from '../../server/ai/gateway';
import {summarize} from '../../server/ai/summarize';
import {loadEnv} from '../../server/lib/env';
import type {SummaryLength, SummaryMode} from '../../src/types';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T, name: string): T {
  if (value === undefined) return fallback;
  if (!(allowed as readonly string[]).includes(value)) throw new Error(`--${name} must be one of: ${allowed.join(', ')}`);
  return value as T;
}

async function main() {
  const mode = oneOf<SummaryMode>(arg('mode'), ['abstractive', 'extractive'], 'abstractive', 'mode');
  const length = oneOf<SummaryLength>(arg('length'), ['concise', 'balanced', 'detailed'], 'balanced', 'length');
  const limit = arg('limit') ? Number(arg('limit')) : Infinity;

  const gold = loadGold(path.join(here, 'gold')).slice(0, limit);
  if (!gold.length) {
    console.error('No gold documents found in scripts/eval/gold. See scripts/eval/gold/README.md for the format.');
    process.exit(1);
  }
  if (gold.length < 10) console.warn(`Only ${gold.length} reference documents: the scores are a rough indication, not a benchmark. The plan is 10 to 20.`);

  const env = loadEnv();
  const llm = createLlmGateway(env);
  const results: {id: string; candidate: string; reference: string; scores: RougeScores}[] = [];

  for (const [i, doc] of gold.entries()) {
    process.stdout.write(`[${i + 1}/${gold.length}] ${doc.id} ... `);
    const summary = await summarize(
      {title: doc.title, text: doc.source, category: doc.category, mode, length, language: 'English', sourceLanguage: 'en'},
      {llm, chunk: {maxTokens: env.SUMMARY_CHUNK_TOKENS, overlapTokens: Math.round(env.SUMMARY_CHUNK_TOKENS / 15)}, maxChunks: env.SUMMARY_MAX_CHUNKS},
    );
    const candidate = [...summary.contentParagraphs, ...summary.bulletPoints.map((b) => `${b.title} ${b.text}`)].join('\n');
    const scores = rouge(candidate, doc.reference);
    results.push({id: doc.id, candidate, reference: doc.reference, scores});
    console.log(`R1 ${scores.rouge1.toFixed(3)}  R2 ${scores.rouge2.toFixed(3)}  RL ${scores.rougeL.toFixed(3)}`);
  }

  const report = scoreRun(results, {model: llm.modelName, mode, length});

  fs.mkdirSync(path.join(here, 'results'), {recursive: true});
  fs.writeFileSync(path.join(here, 'results/latest.json'), JSON.stringify({report, perDocument: results.map(({id, scores}) => ({id, ...scores}))}, null, 2));
  fs.writeFileSync(path.join(root, 'src/data/benchmark.json'), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\nBenchmark on ${report.documents} reference documents (${mode}, ${length}, ${report.model})`);
  console.log(`ROUGE-1 ${report.rouge1}  ROUGE-2 ${report.rouge2}  ROUGE-L ${report.rougeL}`);
  console.log('Wrote src/data/benchmark.json (commit it to publish) and scripts/eval/results/latest.json.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
