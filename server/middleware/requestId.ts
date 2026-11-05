import {randomUUID} from 'node:crypto';
import type {RequestHandler} from 'express';

const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Assigns `req.id` (honouring a well-formed inbound `x-request-id`) and echoes it back. */
export const requestId: RequestHandler = (req, res, next) => {
  const inbound = req.get('x-request-id');
  req.id = inbound && SAFE_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};
