import {Router} from 'express';
import {z} from 'zod';
import {notImplemented} from '../lib/errors';
import {validate} from '../middleware/validate';

export const documentIdParams = z.object({
  id: z.string().trim().min(1).max(128),
});

export const exportQuery = z.object({
  format: z.enum(['pdf', 'docx', 'txt', 'md']),
});

/** GET /api/documents/:id/export?format=: real PDF/DOCX/TXT/MD files (Phase 5). */
export function createExportRouter(): Router {
  const router = Router();

  router.get('/documents/:id/export', validate({params: documentIdParams, query: exportQuery}), (_req, _res, next) => {
    next(notImplemented('Document export', 5));
  });

  return router;
}
