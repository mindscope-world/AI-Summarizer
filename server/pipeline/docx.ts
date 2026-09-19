import mammoth from 'mammoth';
import {unprocessable} from '../lib/errors';

export async function extractDocx(buffer: Buffer): Promise<{text: string; warnings: string[]}> {
  try {
    const result = await mammoth.extractRawText({buffer});
    const messages = [...new Set(result.messages.map((m) => m.message))].slice(0, 5);
    return {text: result.value, warnings: messages.map((m) => `DOCX: ${m}`)};
  } catch {
    throw unprocessable('The DOCX file could not be read. It may be corrupted or not a real Word document.');
  }
}
