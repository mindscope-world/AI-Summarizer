import {Router} from 'express';
import {z} from 'zod';
import {notImplemented} from '../lib/errors';
import {validate} from '../middleware/validate';

export const summarizeBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  text: z.string().trim().min(1, 'text is required').max(2_000_000),
  category: z.string().trim().min(1).max(100),
  courseCode: z.string().trim().max(50).optional(),
  summarizationType: z.enum(['abstractive', 'extractive']).default('abstractive'),
  length: z.enum(['concise', 'balanced', 'detailed']).default('balanced'),
  language: z.enum(['English', 'Swahili']).default('English'),
});

/** POST /api/summarize: text + options -> structured summary (Phase 3). */
export function createSummarizeRouter(): Router {
  const router = Router();

  router.post('/summarize', validate({body: summarizeBody}), (_req, _res, next) => {
    next(notImplemented('Summarization', 3));
  });

  return router;
}
