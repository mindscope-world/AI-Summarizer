import JSZip from 'jszip';
import {describe, expect, it} from 'vitest';
import type {ExportDocument} from '../../src/types';
import {extractDocx} from '../pipeline/docx';
import {extractPdf} from '../pipeline/pdf';
import {fileNameFor} from './content';
import {exportBodySchema, renderExport} from './index';
import {pdfSafe} from './pdf';
import {buildMarkdown, buildPlainText} from './text';

const DOC: ExportDocument = {
  title: 'Consensus Protocols in Distributed Systems',
  category: 'Computer Science',
  tags: ['Consensus', 'Paxos'],
  createdDate: 'September 20, 2026 05:41 PM',
  author: 'Amina Yusuf',
  institution: 'The East Africa University',
  sourceName: 'lecture-7.pdf',
  language: 'English',
  model: 'openai/gpt-oss-120b',
  originalWordCount: 4200,
  summaryWordCount: 310,
  reductionRate: '93%',
  contentParagraphs: [
    'Consensus protocols let independent nodes agree on one value even when some of them fail.',
    'Paxos and Raft reach agreement with quorum voting, and Raft elects a leader to order the log.',
  ],
  bulletPoints: [
    {title: 'Quorums', text: 'A majority vote keeps replicas consistent.'},
    {title: 'Fault tolerance', text: 'A minority of nodes can fail safely.'},
  ],
  discussionQuestions: [{question: 'Why does a majority quorum matter?', context: 'Think about network partitions.'}],
  userNotes: 'Revise Raft leader election before the exam.\nCompare with Paxos.',
  warnings: ['Figure "4200" could not be found in the source.'],
};

const SPACED = (s: string) => s.replace(/\s+/g, ' ');

describe('markdown and plain text', () => {
  it('include every section with the right content', () => {
    const md = buildMarkdown(DOC);
    expect(md).toContain('# Consensus Protocols in Distributed Systems');
    expect(md).toContain('## Summary');
    expect(md).toContain('- **Quorums** A majority vote keeps replicas consistent.');
    expect(md).toContain('1. Why does a majority quorum matter? _(Think about network partitions.)_');
    expect(md).toContain('## My Notes');
    expect(md).toContain('4200 → 310 words (93% shorter)');
    expect(md).toContain('Please double-check');

    const txt = buildPlainText(DOC);
    expect(txt).toContain('Summary\n-------');
    expect(txt).toContain('* Quorums A majority vote keeps replicas consistent.');
    expect(txt).not.toMatch(/\*\*|^#/m);
  });

  it('leaves out sections that have no content and uses Swahili headings for Swahili summaries', () => {
    const md = buildMarkdown({title: 'T', contentParagraphs: ['Habari.'], bulletPoints: [], discussionQuestions: [], language: 'Swahili'});
    expect(md).toContain('## Muhtasari');
    expect(md).not.toContain('Key Takeaways');
    expect(md).not.toContain('Mambo Muhimu');
    expect(md).not.toContain('Notes');
  });
});

describe('DOCX', () => {
  it('is a valid Word file that our own reader can open, with real lists and properties', async () => {
    const out = await renderExport('docx', DOC);
    expect(out.contentType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(out.body.subarray(0, 2).toString()).toBe('PK'); // a zip container

    const zip = await JSZip.loadAsync(out.body);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml', 'docProps/core.xml']));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('<w:numPr>'); // real bullets / numbering, not typed characters
    expect(await zip.file('docProps/core.xml')!.async('string')).toContain('Consensus Protocols in Distributed Systems');

    const {text} = await extractDocx(out.body);
    const flat = SPACED(text);
    expect(flat).toContain('Consensus Protocols in Distributed Systems');
    expect(flat).toContain('Paxos and Raft reach agreement with quorum voting');
    expect(flat).toContain('Quorums A majority vote keeps replicas consistent.');
    expect(flat).toContain('Why does a majority quorum matter?');
    expect(flat).toContain('Revise Raft leader election before the exam.');
  });
});

describe('PDF', () => {
  it('is a well-formed PDF with real, extractable text on A4 pages', async () => {
    const out = await renderExport('pdf', DOC);
    expect(out.contentType).toBe('application/pdf');
    expect(out.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(out.body.subarray(-8).toString()).toContain('%%EOF');
    expect(out.warnings).toEqual([]);

    const pdf = await extractPdf(out.body, {maxPages: 10});
    expect(pdf.pageCount).toBe(1);
    expect(pdf.title).toBe('Consensus Protocols in Distributed Systems');
    const flat = SPACED(pdf.pages.join(' '));
    expect(flat).toContain('Consensus Protocols in Distributed Systems');
    expect(flat).toContain('Paxos and Raft reach agreement with quorum voting');
    expect(flat).toContain('Quorums A majority vote keeps replicas consistent.');
    expect(flat).toContain('1. Why does a majority quorum matter?');
    expect(flat).toContain('1 / 1');
  });

  it('paginates long summaries and numbers every page', async () => {
    const long: ExportDocument = {
      ...DOC,
      contentParagraphs: Array.from({length: 40}, (_, i) => `Paragraph ${i + 1}. ` + 'Nodes agree on a value using quorum voting. '.repeat(12)),
    };
    const out = await renderExport('pdf', long);
    const pdf = await extractPdf(out.body, {maxPages: 50});
    expect(pdf.pageCount).toBeGreaterThan(3);
    expect(SPACED(pdf.pages[pdf.pageCount - 1])).toContain(`${pdf.pageCount} / ${pdf.pageCount}`);
    expect(SPACED(pdf.pages.join(' '))).toContain('Paragraph 40.');
  });

  it('keeps accented and Swahili text, and says so when characters cannot be drawn', async () => {
    const out = await renderExport('pdf', {...DOC, title: 'Café “Uchumi” – résumé', contentParagraphs: ['Elimu ni ufunguo wa maisha. 日本語 text.']});
    expect(out.warnings[0]).toMatch(/3 characters could not be shown/);
    const pdf = await extractPdf(out.body, {maxPages: 5});
    const flat = SPACED(pdf.pages.join(' '));
    expect(flat).toContain('Café “Uchumi” – résumé');
    expect(flat).toContain('Elimu ni ufunguo wa maisha. ??? text.');
  });

  it('pdfSafe swaps look-alikes, drops control characters and counts what it cannot draw', () => {
    expect(pdfSafe('a‑b − 5 x​z')).toEqual({text: 'a-b - 5 xz', replaced: 0});
    expect(pdfSafe('ok\u0007\u0000')).toEqual({text: 'ok', replaced: 0});
    expect(pdfSafe('😀 ok')).toEqual({text: '? ok', replaced: 1});
  });
});

describe('request schema and file names', () => {
  it('accepts a full document and rejects bad formats, missing titles and oversized lists', () => {
    expect(exportBodySchema.safeParse({format: 'pdf', document: DOC}).success).toBe(true);
    expect(exportBodySchema.safeParse({format: 'exe', document: DOC}).success).toBe(false);
    expect(exportBodySchema.safeParse({format: 'pdf', document: {...DOC, title: '  '}}).success).toBe(false);
    expect(exportBodySchema.safeParse({format: 'pdf', document: {...DOC, bulletPoints: Array(61).fill({title: 'a', text: 'b'})}}).success).toBe(false);
  });

  it('makes safe ASCII file names from any title', () => {
    expect(fileNameFor('Consensus Protocols: Paxos & Raft!', 'pdf')).toBe('consensus_protocols_paxos_raft_summary.pdf');
    expect(fileNameFor('Café Économie', 'docx')).toBe('cafe_economie_summary.docx');
    expect(fileNameFor('日本語', 'txt')).toBe('summary_summary.txt');
    expect(fileNameFor('../../etc/passwd', 'md')).toBe('etc_passwd_summary.md');
  });
});
