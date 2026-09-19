import type {ErrorRequestHandler, RequestHandler} from 'express';
import multer from 'multer';
import type {ApiErrorBody, ApiErrorCode, ApiErrorDetail} from '../../src/types';
import type {Logger} from './logger';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: ApiErrorDetail[]) =>
  new AppError(400, 'bad_request', message, details);
export const validationFailed = (details: ApiErrorDetail[]) =>
  new AppError(400, 'validation_failed', 'Request validation failed.', details);
export const unauthorized = (message = 'Authentication required.') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError(403, 'forbidden', message);
export const notFound = (message = 'Resource not found.') => new AppError(404, 'not_found', message);
/** 422: the request was well-formed but the content can't be processed (corrupt, empty, too big to process). */
export const unprocessable = (message: string) => new AppError(422, 'unprocessable', message);
/** 502: a remote resource (a URL the user gave us, or an AI provider) failed. */
export const upstreamError = (message: string) => new AppError(502, 'upstream_error', message);
export const notImplemented = (feature: string, phase: number) =>
  new AppError(501, 'not_implemented', `${feature} is not implemented yet (planned for Phase ${phase}).`);

/** Terminal handler for unknown /api routes. */
export const apiNotFound: RequestHandler = (req, _res, next) => {
  next(notFound(`No API route for ${req.method} ${req.originalUrl.split('?')[0]}.`));
};

function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new AppError(413, 'payload_too_large', 'Uploaded file exceeds the maximum allowed size.');
    }
    return new AppError(400, 'bad_request', `Upload rejected: ${err.message}.`);
  }

  // body-parser errors carry a `type` string.
  const type = typeof err === 'object' && err !== null ? (err as {type?: unknown}).type : undefined;
  if (type === 'entity.too.large') {
    return new AppError(413, 'payload_too_large', 'Request body exceeds the maximum allowed size.');
  }
  if (type === 'entity.parse.failed' || type === 'encoding.unsupported') {
    return new AppError(400, 'bad_request', 'Request body is not valid JSON.');
  }
  return null;
}

/**
 * Converts any thrown error into the structured `ApiErrorBody`. Unknown errors
 * become a generic 500: internals are logged, never sent to the client.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);

    const known = toAppError(err);
    const status = known?.status ?? 500;
    const requestId = req.id;

    if (!known) {
      logger.error('unhandled_error', {
        requestId,
        method: req.method,
        path: req.path,
        error: err instanceof Error ? {name: err.name, message: err.message, stack: err.stack} : String(err),
      });
    }

    const body: ApiErrorBody = {
      error: {
        code: known?.code ?? 'internal_error',
        message: known ? known.message : 'An unexpected error occurred.',
        requestId,
        ...(known?.details ? {details: known.details} : {}),
      },
    };
    res.status(status).json(body);
  };
}
