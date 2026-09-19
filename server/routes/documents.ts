import {Router} from 'express';
import {z} from 'zod';
import {notImplemented} from '../lib/errors';
import {validate} from '../middleware/validate';

export const documentIdParams = z.object({
  id: z.string().trim().min(1).max(128),
});

/** Document history CRUD backed by Supabase (Phase 4). */
export function createDocumentsRouter(): Router {
  const router = Router();

  router.get('/documents', (_req, _res, next) => next(notImplemented('Listing documents', 4)));
  router.get('/documents/:id', validate({params: documentIdParams}), (_req, _res, next) =>
    next(notImplemented('Fetching a document', 4)),
  );
  router.delete('/documents/:id', validate({params: documentIdParams}), (_req, _res, next) =>
    next(notImplemented('Deleting a document', 4)),
  );

  return router;
}
