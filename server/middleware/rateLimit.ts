import rateLimit, {ipKeyGenerator} from 'express-rate-limit';
import type {RequestHandler} from 'express';
import {AppError} from '../lib/errors';

/**
 * Per-user rate limit (falls back to per-IP while signed out). Mount it AFTER the
 * auth middleware so `req.user` is populated. `/health` is exempt for uptime probes.
 */
export function createRateLimiter(limitPerMinute: number): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: limitPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
    keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`),
    handler: (_req, _res, next) => next(new AppError(429, 'rate_limited', 'Too many requests. Please slow down.')),
  });
}
