import {Router} from 'express';
import {z} from 'zod';
import type {TranslateRequest} from '../../src/types';
import {TRANSLATION_LANGUAGES} from '../../src/types';
import type {LlmGateway} from '../ai/gateway';
import {translateSummary} from '../ai/translate';
import {asyncHandler} from '../lib/asyncHandler';
import type {Env} from '../lib/env';
import {AppError} from '../lib/errors';
import type {Logger} from '../lib/logger';
import {createRateLimiter} from '../middleware/rateLimit';
import {validate} from '../middleware/validate';

/** A summary is a few hundred words; this leaves room for a detailed one and stays inside a free-tier token budget. */
const MAX_TOTAL_CHARS = 20_000;

export const translateBody = z
  .object({
    targetLanguage: z.enum(TRANSLATION_LANGUAGES),
    sourceLanguage: z.enum(TRANSLATION_LANGUAGES).optional(),
    contentParagraphs: z.array(z.string().max(5_000)).max(12),
    bulletPoints: z.array(z.object({title: z.string().max(300), text: z.string().max(2_000)})).max(20),
    discussionQuestions: z.array(z.object({question: z.string().max(1_000), context: z.string().max(1_000)})).max(20),
    promptQuestion: z.string().max(1_000).optional(),
  })
  .refine((b) => b.contentParagraphs.length + b.bulletPoints.length + b.discussionQuestions.length > 0, {message: 'There is nothing to translate.'})
  .refine((b) => b.sourceLanguage !== b.targetLanguage, {message: 'The summary is already in that language.', path: ['targetLanguage']});

interface Deps {
  env: Env;
  logger: Logger;
  llm: LlmGateway;
}

/** POST /api/translate: a structured summary in, the same summary in English or Swahili out. */
export function createTranslateRouter({env, logger, llm}: Deps): Router {
  const router = Router();

  router.post(
    '/translate',
    createRateLimiter(env.SUMMARIZE_RATE_LIMIT_PER_MINUTE),
    validate({body: translateBody}),
    asyncHandler(async (req, res) => {
      const body = req.body as TranslateRequest;
      if (JSON.stringify(body).length > MAX_TOTAL_CHARS) {
        throw new AppError(413, 'payload_too_large', 'This summary is too long to translate in one go.');
      }

      // Stop paying for the model call once the client has gone away.
      const controller = new AbortController();
      const onClose = () => {
        if (!res.writableFinished) controller.abort();
      };
      res.on('close', onClose);

      const started = Date.now();
      try {
        const result = await translateSummary(body, {llm, signal: controller.signal});
        // Metadata only: never the text.
        logger.info('translate_completed', {requestId: req.id, userId: req.user?.id, target: result.language, warnings: result.warnings.length, durationMs: Date.now() - started});
        res.json(result);
      } catch (err) {
        if (controller.signal.aborted) {
          logger.info('translate_cancelled', {requestId: req.id});
          return;
        }
        throw err;
      } finally {
        res.off('close', onClose);
      }
    }),
  );

  return router;
}
