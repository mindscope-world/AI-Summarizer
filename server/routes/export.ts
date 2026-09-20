import {Router} from 'express';
import {renderExport, exportBodySchema} from '../export';
import {asyncHandler} from '../lib/asyncHandler';
import type {Env} from '../lib/env';
import type {Logger} from '../lib/logger';
import {createRateLimiter} from '../middleware/rateLimit';
import {validate} from '../middleware/validate';
import type {ExportRequest} from '../../src/types';

/**
 * POST /api/export: a summary in, a real PDF / DOCX / TXT / MD file out. The client sends the
 * summary (so unsaved edits and translations export exactly as shown); nothing is stored.
 */
export function createExportRouter({env, logger}: {env: Env; logger: Logger}): Router {
  const router = Router();

  router.post(
    '/export',
    // Building a PDF is CPU work, so it gets the same stricter limit as extraction.
    createRateLimiter(env.EXTRACT_RATE_LIMIT_PER_MINUTE),
    validate({body: exportBodySchema}),
    asyncHandler(async (req, res) => {
      const {format, document} = req.body as ExportRequest;
      const started = Date.now();
      const file = await renderExport(format, document);

      // Metadata only: never the summary text or title.
      logger.info('export_completed', {requestId: req.id, userId: req.user?.id, format, bytes: file.body.length, durationMs: Date.now() - started});

      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Length', String(file.body.length));
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
      if (file.warnings.length) res.setHeader('X-Export-Warning', encodeURIComponent(file.warnings.join(' ')));
      res.send(file.body);
    }),
  );

  return router;
}
