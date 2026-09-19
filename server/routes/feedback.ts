import {Router} from 'express';
import {z} from 'zod';
import {notImplemented} from '../lib/errors';
import {validate} from '../middleware/validate';

export const feedbackBody = z.object({
  documentId: z.string().trim().min(1).max(128).optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1, 'comment is required').max(2000),
  role: z.enum(['student', 'researcher', 'faculty']),
});

/** POST /api/feedback: rating + comment persisted for the improvement loop (Phase 6). */
export function createFeedbackRouter(): Router {
  const router = Router();

  router.post('/feedback', validate({body: feedbackBody}), (_req, _res, next) => {
    next(notImplemented('Feedback submission', 6));
  });

  return router;
}
