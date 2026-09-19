import {Router} from 'express';
import {z} from 'zod';
import type {Env} from '../lib/env';
import {notImplemented, validationFailed} from '../lib/errors';
import {createUpload} from '../middleware/upload';
import {validate} from '../middleware/validate';

const extractBody = z.object({
  url: z.url({protocol: /^https?$/}).optional(),
});

/** POST /api/extract: multipart `file` OR JSON/form `url` -> cleaned text (Phase 2). */
export function createExtractRouter(env: Env): Router {
  const router = Router();

  router.post('/extract', createUpload(env.MAX_UPLOAD_MB), validate({body: extractBody}), (req, _res, next) => {
    if (!req.file && !req.body.url) {
      return next(validationFailed([{path: 'body', message: 'Provide either a `file` upload or a `url`.'}]));
    }
    next(notImplemented('Document extraction', 2));
  });

  return router;
}
