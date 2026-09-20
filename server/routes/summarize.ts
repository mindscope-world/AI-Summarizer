import {Router, type Response} from 'express';
import {z} from 'zod';
import type {SummarizeEvent} from '../../src/types';
import type {LlmGateway} from '../ai/gateway';
import {summarize} from '../ai/summarize';
import {asyncHandler} from '../lib/asyncHandler';
import type {Env} from '../lib/env';
import {AppError} from '../lib/errors';
import type {Logger} from '../lib/logger';
import {createRateLimiter} from '../middleware/rateLimit';
import {validate} from '../middleware/validate';

export const summarizeBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  text: z.string().trim().min(1, 'text is required').max(2_000_000),
  category: z.string().trim().min(1).max(100),
  courseCode: z.string().trim().max(50).optional(),
  summarizationType: z.enum(['abstractive', 'extractive']).default('abstractive'),
  length: z.enum(['concise', 'balanced', 'detailed']).default('balanced'),
  language: z.enum(['English', 'Swahili']).default('English'),
  /** Language code from /api/extract; lets the grounding check know whether names can be compared. */
  sourceLanguage: z.enum(['en', 'sw', 'fr', 'other', 'und']).optional(),
});

interface Deps {
  env: Env;
  logger: Logger;
  llm: LlmGateway;
}

const wantsEventStream = (accept: string | undefined) => !!accept && accept.includes('text/event-stream');

function send(res: Response, event: SummarizeEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * POST /api/summarize: text + options -> structured summary. With `Accept: text/event-stream`
 * the response is a stream of progress events ending in a `result` (or `error`) event, because a
 * long document can take minutes on a free-tier rate limit. Otherwise it is one JSON response.
 */
export function createSummarizeRouter({env, logger, llm}: Deps): Router {
  const router = Router();
  let active = 0;

  router.post(
    '/summarize',
    createRateLimiter(env.SUMMARIZE_RATE_LIMIT_PER_MINUTE),
    validate({body: summarizeBody}),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof summarizeBody>;

      // Summarizations share one small token budget, so extra ones are told to retry.
      if (active >= env.LLM_MAX_CONCURRENT) {
        throw new AppError(429, 'rate_limited', 'The summarizer is busy with other requests. Try again in a minute.');
      }
      active++;

      const stream = wantsEventStream(req.headers.accept);
      if (stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.flushHeaders();
      }

      // Stop paying for model calls once the client has gone away.
      const controller = new AbortController();
      const onClose = () => {
        if (!res.writableFinished) controller.abort();
      };
      res.on('close', onClose);

      const started = Date.now();
      try {
        const result = await summarize(
          {
            title: body.title,
            text: body.text,
            category: body.category,
            courseCode: body.courseCode,
            mode: body.summarizationType,
            length: body.length,
            language: body.language,
            sourceLanguage: body.sourceLanguage,
          },
          {
            llm,
            chunk: {maxTokens: env.SUMMARY_CHUNK_TOKENS, overlapTokens: Math.round(env.SUMMARY_CHUNK_TOKENS / 15)},
            maxChunks: env.SUMMARY_MAX_CHUNKS,
            signal: controller.signal,
            onProgress: stream ? (p) => send(res, {type: 'progress', ...p}) : undefined,
          },
        );

        // Metadata only: never the document text or title.
        logger.info('summarize_completed', {
          requestId: req.id,
          userId: req.user?.id,
          mode: result.metadata.mode,
          length: result.metadata.length,
          language: result.metadata.language,
          words: result.metadata.originalWordCount,
          sections: result.metadata.sections,
          warnings: result.warnings.length,
          durationMs: Date.now() - started,
        });

        if (stream) {
          send(res, {type: 'result', result});
          res.end();
        } else {
          res.json(result);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          logger.info('summarize_cancelled', {requestId: req.id, durationMs: Date.now() - started});
          if (!res.writableEnded) res.end();
          return;
        }
        if (!stream) throw err;

        const known = err instanceof AppError ? err : null;
        if (!known) {
          logger.error('unhandled_error', {
            requestId: req.id,
            method: req.method,
            path: req.path,
            error: err instanceof Error ? {name: err.name, message: err.message, stack: err.stack} : String(err),
          });
        }
        send(res, {
          type: 'error',
          error: {
            code: known?.code ?? 'internal_error',
            message: known ? known.message : 'An unexpected error occurred.',
            requestId: req.id,
          },
        });
        res.end();
      } finally {
        active--;
        res.off('close', onClose);
      }
    }),
  );

  return router;
}
