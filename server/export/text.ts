import type {ExportDocument} from '../../src/types';
import {labelsFor, metaLines, paragraphsOf} from './content';

/** Markdown: headings, bold key-point titles, numbered questions. */
export function buildMarkdown(doc: ExportDocument): string {
  const t = labelsFor(doc.language);
  const out: string[] = [`# ${doc.title}`, ''];

  const meta = metaLines(doc);
  if (meta.length) {
    out.push(...meta.map(([k, v]) => `- **${k}:** ${v}`), '');
  }

  if (doc.contentParagraphs.length) out.push(`## ${t.summary}`, '', doc.contentParagraphs.join('\n\n'), '');

  if (doc.bulletPoints.length) {
    out.push(`## ${t.takeaways}`, '', ...doc.bulletPoints.map((b) => `- **${b.title}** ${b.text}`), '');
  }

  if (doc.discussionQuestions.length) {
    out.push(
      `## ${t.questions}`,
      '',
      ...doc.discussionQuestions.map((q, i) => `${i + 1}. ${q.question}${q.context ? ` _(${q.context})_` : ''}`),
      '',
    );
  }

  const notes = paragraphsOf(doc.userNotes);
  if (notes.length) out.push(`## ${t.notes}`, '', notes.join('\n\n'), '');

  if (doc.warnings?.length) out.push(`## ${t.warnings}`, '', ...doc.warnings.map((w) => `- ${w}`), '');

  out.push('---', `_${t.generatedBy}_`, '');
  return out.join('\n');
}

const underline = (text: string, char: string) => `${text}\n${char.repeat(Math.min(text.length, 72))}`;

/** Plain text: no markup, headings underlined. */
export function buildPlainText(doc: ExportDocument): string {
  const t = labelsFor(doc.language);
  const out: string[] = [underline(doc.title, '='), ''];

  const meta = metaLines(doc);
  if (meta.length) out.push(...meta.map(([k, v]) => `${k}: ${v}`), '');

  if (doc.contentParagraphs.length) out.push(underline(t.summary, '-'), '', doc.contentParagraphs.join('\n\n'), '');

  if (doc.bulletPoints.length) {
    out.push(underline(t.takeaways, '-'), '', ...doc.bulletPoints.map((b) => `* ${b.title} ${b.text}`), '');
  }

  if (doc.discussionQuestions.length) {
    out.push(
      underline(t.questions, '-'),
      '',
      ...doc.discussionQuestions.map((q, i) => `${i + 1}. ${q.question}${q.context ? ` (${q.context})` : ''}`),
      '',
    );
  }

  const notes = paragraphsOf(doc.userNotes);
  if (notes.length) out.push(underline(t.notes, '-'), '', notes.join('\n\n'), '');

  if (doc.warnings?.length) out.push(underline(t.warnings, '-'), '', ...doc.warnings.map((w) => `* ${w}`), '');

  out.push(t.generatedBy, '');
  return out.join('\n');
}
