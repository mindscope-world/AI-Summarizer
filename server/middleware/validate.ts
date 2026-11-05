import type {RequestHandler} from 'express';
import type {ZodType} from 'zod';
import {validationFailed} from '../lib/errors';
import type {ApiErrorDetail} from '../../src/types';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Validates `req.body` / `req.query` / `req.params` with zod. On success the parsed
 * (coerced, unknown-keys-stripped) values replace the originals; on failure all
 * problems are returned together as a 400 `validation_failed`.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const details: ApiErrorDetail[] = [];

    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) {
        (req as unknown as Record<string, unknown>)[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({path: [part, ...issue.path].join('.'), message: issue.message});
        }
      }
    }

    next(details.length ? validationFailed(details) : undefined);
  };
}
