import {Router} from 'express';
import {z} from 'zod';
import type {QuestionRequest} from '../../src/types';
import type {LlmGateway} from '../ai/gateway';
import {generateQuestion} from '../ai/questions';
import {asyncHandler} from '../lib/asyncHandler';
import type {Env} from '../lib/env';
import type {Logger} from '../lib/logger';
import {createRateLimiter} from '../middleware/rateLimit';
import {validate} from '../middleware/validate';

export const questionsBody = z.object({
  title: z.string().trim().min(1).max(300),
  language: z.enum(['English', 'Swahili']).default('English'),
  contentParagraphs: z.array(z.string().max(5_000)).max(12),
  bulletPoints: z.array(z.object({title: z.string().max(300), text: z.string().max(2_000)})).max(20),
  existingQuestions: z.array(z.string().max(1_000)).max(30).default([]),
}).refine((b) => b.contentParagraphs.length + b.bulletPoints.length > 0, {message: 'The summary is empty.'});

interface Deps {
  env: Env;
  logger: Logger;
  llm: LlmGateway;
}

/** POST /api/questions: a summary in, one new revision question (different from its existing ones) out. */
export function createQuestionsRouter({env, logger, llm}: Deps): Router {
  const router = Router();

  router.post(
    '/questions',
    createRateLimiter(env.SUMMARIZE_RATE_LIMIT_PER_MINUTE),
    validate({body: questionsBody}),
    asyncHandler(async (req, res) => {
      const body = req.body as QuestionRequest;

      // Stop paying for the model call once the client has gone away.
      const controller = new AbortController();
      const onClose = () => {
        if (!res.writableFinished) controller.abort();
      };
      res.on('close', onClose);

      const started = Date.now();
      try {
        const result = await generateQuestion(body, {llm, signal: controller.signal});
        // Metadata only: never the summary or the question.
        logger.info('question_generated', {requestId: req.id, userId: req.user?.id, language: body.language, durationMs: Date.now() - started});
        res.json(result);
      } catch (err) {
        if (controller.signal.aborted) {
          logger.info('question_cancelled', {requestId: req.id});
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
