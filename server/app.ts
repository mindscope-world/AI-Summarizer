import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, {type Express, type RequestHandler} from 'express';
import type {Env} from './lib/env';
import {apiNotFound, errorHandler} from './lib/errors';
import type {Logger} from './lib/logger';
import {accessLog} from './middleware/accessLog';
import {createRateLimiter} from './middleware/rateLimit';
import {requestId} from './middleware/requestId';
import {createDocumentsRouter} from './routes/documents';
import {createExportRouter} from './routes/export';
import {createExtractRouter} from './routes/extract';
import {createFeedbackRouter} from './routes/feedback';
import {createHealthRouter} from './routes/health';
import {createChatModel} from './ai/model';
import {createLlmOcr} from './pipeline/ocr';
import type {IngestDeps} from './pipeline/ingest';
import {createSummarizeRouter} from './routes/summarize';

export interface AppOptions {
  env: Env;
  logger: Logger;
  /** Built Vite app to serve. Defaults to ./dist in production only. */
  staticDir?: string | false;
  /** Overrides for the ingestion pipeline (tests inject a fake OCR provider, etc.). */
  ingestion?: Partial<IngestDeps>;
}

const baseHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
};

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export function createApp({env, logger, staticDir, ingestion}: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId, accessLog(logger), baseHeaders);

  const ingestDeps: IngestDeps = {
    limits: {
      maxPdfPages: env.MAX_PDF_PAGES,
      maxExtractedChars: env.MAX_EXTRACTED_CHARS,
      urlTimeoutMs: env.URL_FETCH_TIMEOUT_MS,
      urlMaxBytes: Math.round(env.URL_FETCH_MAX_MB * 1024 * 1024),
    },
    ocr: createLlmOcr({
      model: createChatModel(env, {model: env.OCR_MODEL}),
      name: `groq:${env.OCR_MODEL}`,
      maxPages: env.OCR_MAX_PAGES,
    }),
    ...ingestion,
  };

  const api = express.Router();
  api.use(noStore);
  // Same-origin only unless CORS_ORIGINS lists allowed origins (`origin: false` adds no CORS headers).
  api.use(
    cors({
      origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : false,
      exposedHeaders: ['x-request-id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
    }),
  );
  // Phase 4: the Supabase JWT auth middleware goes here so the limiter can key on req.user.
  api.use(createRateLimiter(env.RATE_LIMIT_PER_MINUTE));
  api.use(express.json({limit: env.JSON_BODY_LIMIT}));

  api.use(createHealthRouter(env));
  api.use(createExtractRouter({env, logger, ingestion: ingestDeps}));
  api.use(createSummarizeRouter());
  api.use(createExportRouter());
  api.use(createDocumentsRouter());
  api.use(createFeedbackRouter());
  api.use(apiNotFound);
  app.use('/api', api);

  const dir = staticDir === undefined ? (env.NODE_ENV === 'production' ? path.resolve(process.cwd(), 'dist') : false) : staticDir;
  if (dir) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      app.use(express.static(dir, {index: false, maxAge: '1h'}));
      // SPA fallback for everything that is not an API route.
      app.get(/^(?!\/api(\/|$)).*/, (_req, res) => res.sendFile(path.join(dir, 'index.html')));
    } else {
      logger.warn('static_dir_missing', {dir, hint: 'Run `npm run build` before `npm start`.'});
    }
  }

  app.use(errorHandler(logger));
  return app;
}
