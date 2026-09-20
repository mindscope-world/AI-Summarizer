import {AlignmentType, Document, Footer, HeadingLevel, LevelFormat, Packer, PageNumber, Paragraph, TextRun} from 'docx';
import type {ExportDocument} from '../../src/types';
import {labelsFor, metaLines, paragraphsOf} from './content';

const FONT = 'Calibri';
const MUTED = '64748B';

const body = (text: string) =>
  new Paragraph({children: [new TextRun({text})], spacing: {after: 140, line: 300}});

const heading = (text: string) =>
  new Paragraph({heading: HeadingLevel.HEADING_1, children: [new TextRun({text})], spacing: {before: 320, after: 120}});

/** A real Word document: styled headings, true bullet and numbered lists, page numbers, document properties. */
export async function buildDocx(doc: ExportDocument): Promise<Buffer> {
  const t = labelsFor(doc.language);
  const children: Paragraph[] = [
    new Paragraph({heading: HeadingLevel.TITLE, children: [new TextRun({text: doc.title})], spacing: {after: 160}}),
  ];

  for (const [label, value] of metaLines(doc)) {
    children.push(
      new Paragraph({
        children: [new TextRun({text: `${label}: `, bold: true, color: MUTED, size: 20}), new TextRun({text: value, color: MUTED, size: 20})],
        spacing: {after: 40},
      }),
    );
  }

  if (doc.contentParagraphs.length) {
    children.push(heading(t.summary), ...doc.contentParagraphs.map(body));
  }

  if (doc.bulletPoints.length) {
    children.push(
      heading(t.takeaways),
      ...doc.bulletPoints.map(
        (b) =>
          new Paragraph({
            bullet: {level: 0},
            children: [new TextRun({text: b.title, bold: true}), new TextRun({text: ` ${b.text}`})],
            spacing: {after: 100, line: 300},
          }),
      ),
    );
  }

  if (doc.discussionQuestions.length) {
    children.push(
      heading(t.questions),
      ...doc.discussionQuestions.map(
        (q) =>
          new Paragraph({
            numbering: {reference: 'questions', level: 0},
            children: [new TextRun({text: q.question}), ...(q.context ? [new TextRun({text: ` (${q.context})`, italics: true, color: MUTED})] : [])],
            spacing: {after: 100, line: 300},
          }),
      ),
    );
  }

  const notes = paragraphsOf(doc.userNotes);
  if (notes.length) children.push(heading(t.notes), ...notes.map(body));

  if (doc.warnings?.length) {
    children.push(
      heading(t.warnings),
      ...doc.warnings.map((w) => new Paragraph({bullet: {level: 0}, children: [new TextRun({text: w})], spacing: {after: 80}})),
    );
  }

  const file = new Document({
    creator: doc.author || 'LeaderForge Academic Summarizer',
    title: doc.title,
    subject: doc.category,
    keywords: doc.tags?.join(', '),
    description: t.generatedBy,
    styles: {
      default: {document: {run: {font: FONT, size: 22}}},
      paragraphStyles: [
        {id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: {font: FONT, size: 44, bold: true, color: '0F172A'}},
        {id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: {font: FONT, size: 28, bold: true, color: '047857'}},
      ],
    },
    numbering: {
      config: [
        {
          reference: 'questions',
          levels: [{level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: {paragraph: {indent: {left: 720, hanging: 360}}}}],
        },
      ],
    },
    sections: [
      {
        properties: {page: {margin: {top: 1134, bottom: 1134, left: 1247, right: 1247}}},
        footers: {
          default: new Footer({
            children: [new Paragraph({alignment: AlignmentType.CENTER, children: [new TextRun({children: [PageNumber.CURRENT], color: MUTED, size: 18})]})],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(file);
}
