import {Router} from 'express';
import {z} from 'zod';
import type {ExtractionResult} from '../../src/types';
import type {Env} from '../lib/env';
import {asyncHandler} from '../lib/asyncHandler';
import {validationFailed} from '../lib/errors';
import type {Logger} from '../lib/logger';
import {createRateLimiter} from '../middleware/rateLimit';
import {createUpload} from '../middleware/upload';
import {validate} from '../middleware/validate';
import {ingest, type IngestDeps, type IngestInput} from '../pipeline/ingest';

// Multipart form fields arrive as strings, JSON bodies as real booleans: accept both.
const flag = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean().optional());

export const extractBody = z.object({
  url: z.url({protocol: /^https?$/}).optional(),
  text: z.string().trim().min(1, 'text must not be empty').max(2_000_000).optional(),
  stripReferences: flag,
});

interface Deps {
  env: Env;
  logger: Logger;
  ingestion: IngestDeps;
}

/**
 * POST /api/extract: exactly one of a multipart `file`, a `url`, or pasted `text`
 * -> cleaned text, detected language, sentence/paragraph counts and chunk offsets.
 */
export function createExtractRouter({env, logger, ingestion}: Deps): Router {
  const router = Router();

  router.post(
    '/extract',
    createRateLimiter(env.EXTRACT_RATE_LIMIT_PER_MINUTE),
    createUpload(env.MAX_UPLOAD_MB),
    validate({body: extractBody}),
    asyncHandler(async (req, res) => {
      const {url, text, stripReferences} = req.body as z.infer<typeof extractBody>;
      const provided = [req.file ? 'file' : null, url ? 'url' : null, text ? 'text' : null].filter(Boolean);
      if (provided.length !== 1) {
        throw validationFailed([{path: 'body', message: 'Provide exactly one of: a `file` upload, a `url`, or pasted `text`.'}]);
      }

      const input: IngestInput = req.file
        ? {kind: 'file', buffer: req.file.buffer, fileName: req.file.originalname}
        : url
          ? {kind: 'url', url}
          : {kind: 'text', text: text as string};

      const started = Date.now();
      const result: ExtractionResult = await ingest(input, {stripReferences}, ingestion);

      // Metadata only: never the document text, file name or URL.
      logger.info('extract_completed', {
        requestId: req.id,
        userId: req.user?.id,
        kind: result.source.kind,
        format: result.source.format,
        pages: result.source.pageCount,
        ocrUsed: result.source.ocrUsed,
        words: result.wordCount,
        chunks: result.stats.chunks,
        language: result.language.code,
        durationMs: Date.now() - started,
      });
      res.json(result);
    }),
  );

  return router;
}
