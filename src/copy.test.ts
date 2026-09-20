import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/**
 * A guard for the truthfulness sweep: things the app used to claim that were never true (models it
 * does not use, compliance it does not have, statistics nobody measured, features that do not exist).
 * If one of these comes back in user-facing code, this fails and says where.
 */
const root = path.resolve(__dirname);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|json)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

const BANNED: [RegExp, string][] = [
  [/\bBERT\b|\bT5-|T5 Transformer|BERT-Academic|GPT-Academic/, 'model names this app does not use'],
  [/\bTesseract\b/, 'Tesseract is not used (scans are read by a vision model)'],
  [/GDPR|FERPA/i, 'a compliance claim nobody has verified'],
  [/fine-?tun(e|ed|ing)/i, 'the model is never fine-tuned on user data'],
  [/10,000\+|40\+ file formats|5M\+|\bTrained on \d/i, 'invented adoption / training statistics'],
  [/Zero hallucination/i, 'no summarizer can promise this'],
  [/Priority GPU|Pro Scholar|50 document syntheses/i, 'pricing tiers that do not exist'],
  [/Ebbinghaus/i, 'the schedule is a fixed 1-3-7-30 day list, not a forgetting-curve model'],
  [/student_courses|supervisor_id/, 'a database table that does not exist'],
  [/0\.892|0\.741|0\.865|0\.88\b/, 'the old hard-coded ROUGE figures'],
  [/Audio transcript captured/i, 'the fake voice dictation'],
  [/Geoffrey Sagwe.*reviewed|indexed in 1\.4s|3 New/i, 'fake notifications'],
];

describe('user-facing copy', () => {
  const files = sourceFiles(root);

  it.each(BANNED)('does not contain %s', (pattern, why) => {
    const hits = files.flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) => (pattern.test(line) ? [`${path.relative(root, file)}:${i + 1}: ${line.trim().slice(0, 100)}`] : [])),
    );
    expect(hits, `${why}\n${hits.join('\n')}`).toEqual([]);
  });

  it('has no leftover reference to the deleted demo documents module', () => {
    const hits = files.filter((f) => fs.readFileSync(f, 'utf8').includes('mockDocuments'));
    expect(hits).toEqual([]);
  });
});
