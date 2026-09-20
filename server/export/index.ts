import {z} from 'zod';
import {EXPORT_FORMATS, type ExportDocument, type ExportFormat} from '../../src/types';
import {contentTypeFor, fileNameFor} from './content';
import {buildDocx} from './docx';
import {buildPdf} from './pdf';
import {buildMarkdown, buildPlainText} from './text';

const short = (max: number) => z.string().trim().max(max);

/** What a client may send to be exported. Bounded so one request cannot ask for an enormous file. */
export const exportDocumentSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(300),
  category: short(100).optional(),
  tags: z.array(short(60)).max(30).optional(),
  createdDate: short(100).optional(),
  author: short(160).optional(),
  institution: short(200).optional(),
  sourceName: short(500).optional(),
  language: short(40).optional(),
  model: short(200).optional(),
  originalWordCount: z.number().int().min(0).max(100_000_000).optional(),
  summaryWordCount: z.number().int().min(0).max(100_000_000).optional(),
  reductionRate: short(20).optional(),
  contentParagraphs: z.array(z.string().max(20_000)).max(60),
  bulletPoints: z.array(z.object({title: z.string().max(500), text: z.string().max(10_000)})).max(60),
  discussionQuestions: z.array(z.object({question: z.string().max(2_000), context: z.string().max(2_000)})).max(60),
  userNotes: z.string().max(100_000).optional(),
  warnings: z.array(z.string().max(1_000)).max(20).optional(),
}) satisfies z.ZodType<ExportDocument>;

export const exportBodySchema = z.object({
  format: z.enum(EXPORT_FORMATS),
  document: exportDocumentSchema,
});

export interface RenderedExport {
  body: Buffer;
  contentType: string;
  fileName: string;
  /** Things the reader should know about the file (e.g. characters a PDF cannot show). */
  warnings: string[];
}

/** Renders a summary as a real file in the requested format. */
export async function renderExport(format: ExportFormat, doc: ExportDocument): Promise<RenderedExport> {
  const base = {contentType: contentTypeFor(format), fileName: fileNameFor(doc.title, format)};
  switch (format) {
    case 'md':
      return {...base, body: Buffer.from(buildMarkdown(doc), 'utf8'), warnings: []};
    case 'txt':
      return {...base, body: Buffer.from(buildPlainText(doc), 'utf8'), warnings: []};
    case 'docx':
      return {...base, body: await buildDocx(doc), warnings: []};
    case 'pdf': {
      const {buffer, warnings} = await buildPdf(doc);
      return {...base, body: buffer, warnings};
    }
  }
}
