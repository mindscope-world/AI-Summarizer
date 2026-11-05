import path from 'node:path';
import {AppError} from '../lib/errors';

export type FileFormat = 'pdf' | 'docx' | 'txt' | 'md';

const unsupported = (message: string) => new AppError(415, 'unsupported_media_type', message);

/**
 * Decides the real format from the file's bytes, then checks it agrees with the
 * claimed extension. The extension alone is never trusted.
 */
export function sniffFormat(buffer: Buffer, fileName: string): FileFormat {
  const ext = path.extname(fileName).toLowerCase();
  const head = buffer.subarray(0, 1024);

  if (head.includes('%PDF-')) {
    if (ext !== '.pdf') throw unsupported(`File content is a PDF but the name ends in "${ext || '(none)'}".`);
    return 'pdf';
  }

  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    if (ext !== '.docx') throw unsupported('Only .docx archives are supported (found a ZIP-based file with another name).');
    return 'docx';
  }

  // Legacy Word (.doc) and other OLE2 containers.
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    throw unsupported('Legacy .doc files are not supported. Save the document as .docx or PDF and try again.');
  }

  if (ext === '.pdf' || ext === '.docx') {
    throw unsupported(`The file does not look like a real ${ext.slice(1).toUpperCase()} (wrong or corrupted content).`);
  }
  if (ext !== '.txt' && ext !== '.md') throw unsupported('Unsupported file type. Allowed: PDF, DOCX, TXT, MD.');

  // NUL bytes mean binary data (UTF-16 is detected by BOM and handled by the decoder).
  const hasBom16 = (head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff);
  if (!hasBom16 && buffer.subarray(0, 8192).includes(0)) {
    throw unsupported('The file looks like binary data, not text.');
  }
  return ext === '.md' ? 'md' : 'txt';
}
