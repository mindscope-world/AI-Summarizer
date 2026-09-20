import PDFDocument from 'pdfkit';
import type {ExportDocument} from '../../src/types';
import {labelsFor, metaLines, paragraphsOf} from './content';

/** Characters the standard PDF fonts (Windows-1252) can show beyond Latin-1. */
const CP1252_EXTRA = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ']);

const SUBSTITUTES: Record<string, string> = {
  '‑': '-', // non-breaking hyphen
  '−': '-', // minus sign
  '→': '->',
  '←': '<-',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '​': '',
  '‌': '',
  '‍': '',
  '﻿': '',
};

/**
 * Text the built-in PDF fonts can draw. English, Swahili and French all fit; anything else
 * (other scripts, emoji) becomes "?" and is counted so the reader can be told.
 */
export function pdfSafe(text: string): {text: string; replaced: number} {
  let replaced = 0;
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const sub = SUBSTITUTES[ch];
    if (sub !== undefined) {
      out += sub;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '\n' || ch === '\t' || (code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRA.has(ch)) {
      out += ch;
    } else if (code < 0x20 || (code >= 0x7f && code < 0xa0)) {
      // control characters are dropped silently
    } else {
      out += '?';
      replaced++;
    }
  }
  return {text: out, replaced};
}

const INK = '#0F172A';
const BODY = '#1E293B';
const MUTED = '#64748B';
const ACCENT = '#047857';

/** A4 PDF with real text (selectable, searchable), headings, bullets, numbering and page numbers. */
export async function buildPdf(doc: ExportDocument): Promise<{buffer: Buffer; warnings: string[]}> {
  let replaced = 0;
  const safe = (s: string) => {
    const r = pdfSafe(s);
    replaced += r.replaced;
    return r.text;
  };
  const t = labelsFor(doc.language);
  const title = safe(doc.title);

  const pdf = new PDFDocument({
    size: 'A4',
    margins: {top: 56, bottom: 64, left: 60, right: 60},
    bufferPages: true,
    info: {
      Title: title,
      Author: safe(doc.author || 'LeaderForge Academic Summarizer'),
      Subject: safe(doc.category || ''),
      Keywords: safe(doc.tags?.join(', ') || ''),
      Creator: 'LeaderForge Academic Summarizer',
    },
  });
  const chunks: Buffer[] = [];
  pdf.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<void>((resolve, reject) => {
    pdf.on('end', resolve);
    pdf.on('error', reject);
  });

  const left = pdf.page.margins.left;
  const width = pdf.page.width - left - pdf.page.margins.right;
  const bottom = () => pdf.page.height - pdf.page.margins.bottom;
  /** Starts a new page when fewer than `needed` points remain, so a heading is never stranded. */
  const ensureRoom = (needed: number) => {
    if (pdf.y + needed > bottom()) pdf.addPage();
  };

  const heading = (text: string) => {
    ensureRoom(60);
    pdf.moveDown(0.9);
    pdf.font('Helvetica-Bold').fontSize(14).fillColor(ACCENT).text(safe(text), left, pdf.y, {width});
    pdf.moveDown(0.4);
  };
  const paragraph = (text: string) => {
    pdf.font('Helvetica').fontSize(11).fillColor(BODY).text(safe(text), left, pdf.y, {width, lineGap: 3, align: 'left'});
    pdf.moveDown(0.6);
  };

  // Title and the small facts under it
  pdf.font('Helvetica-Bold').fontSize(22).fillColor(INK).text(title, left, pdf.y, {width, lineGap: 2});
  pdf.moveDown(0.5);
  for (const [label, value] of metaLines(doc)) {
    pdf.font('Helvetica-Bold').fontSize(9.5).fillColor(MUTED).text(`${safe(label)}: `, left, pdf.y, {width, continued: true});
    pdf.font('Helvetica').text(safe(value), {continued: false});
  }

  if (doc.contentParagraphs.length) {
    heading(t.summary);
    doc.contentParagraphs.forEach(paragraph);
  }

  if (doc.bulletPoints.length) {
    heading(t.takeaways);
    for (const b of doc.bulletPoints) {
      ensureRoom(48);
      const y = pdf.y;
      pdf.circle(left + 5, y + 6, 2).fill(ACCENT);
      pdf.font('Helvetica-Bold').fontSize(11).fillColor(BODY).text(safe(b.title), left + 18, y, {width: width - 18, continued: true, lineGap: 3});
      pdf.font('Helvetica').text(` ${safe(b.text)}`, {continued: false});
      pdf.moveDown(0.45);
    }
  }

  if (doc.discussionQuestions.length) {
    heading(t.questions);
    doc.discussionQuestions.forEach((q, i) => {
      ensureRoom(48);
      const y = pdf.y;
      pdf.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text(`${i + 1}.`, left, y, {width: 18, lineBreak: false});
      pdf.font('Helvetica').fillColor(BODY).text(safe(q.question), left + 22, y, {width: width - 22, continued: !!q.context, lineGap: 3});
      if (q.context) pdf.font('Helvetica-Oblique').fillColor(MUTED).text(` (${safe(q.context)})`, {continued: false});
      pdf.moveDown(0.45);
    });
  }

  const notes = paragraphsOf(doc.userNotes);
  if (notes.length) {
    heading(t.notes);
    notes.forEach(paragraph);
  }

  if (doc.warnings?.length) {
    heading(t.warnings);
    for (const w of doc.warnings) {
      ensureRoom(36);
      const y = pdf.y;
      pdf.circle(left + 5, y + 6, 2).fill(MUTED);
      pdf.font('Helvetica').fontSize(10).fillColor(MUTED).text(safe(w), left + 18, y, {width: width - 18, lineGap: 2});
      pdf.moveDown(0.3);
    }
  }

  // Page numbers, drawn last so the total is known. The footer sits inside the bottom margin, so
  // that margin is lifted while drawing to stop PDFKit from adding a page for it.
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    pdf.page.margins.bottom = 0;
    pdf.font('Helvetica').fontSize(9).fillColor(MUTED);
    pdf.text(`${i + 1} / ${range.count}`, left, pdf.page.height - 40, {width, align: 'right', lineBreak: false});
    pdf.text(t.generatedBy, left, pdf.page.height - 40, {width, align: 'left', lineBreak: false});
  }

  pdf.end();
  await finished;

  const warnings = replaced
    ? [`${replaced} character${replaced === 1 ? '' : 's'} could not be shown in the PDF and appear as "?". Export as Word or text to keep them.`]
    : [];
  return {buffer: Buffer.concat(chunks), warnings};
}
