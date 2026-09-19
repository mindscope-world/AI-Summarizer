import path from 'node:path';
import multer from 'multer';
import {AppError} from '../lib/errors';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);

/**
 * Multipart handler for a single document in the `file` field. Files are held in
 * memory (bounded by MAX_UPLOAD_MB) and never written to disk by the server.
 *
 * The extension check here is a cheap first gate only; content sniffing and
 * page/size limits belong to the extraction pipeline (Phase 2 / Phase 7).
 */
export function createUpload(maxUploadMb: number) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: maxUploadMb * 1024 * 1024, files: 1, fields: 20},
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ALLOWED_EXTENSIONS.has(ext)) return cb(null, true);
      cb(new AppError(415, 'unsupported_media_type', 'Unsupported file type. Allowed: PDF, DOCX, TXT, MD.'));
    },
  }).single('file');
}
