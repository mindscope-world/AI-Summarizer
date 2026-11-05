import {AppError, upstreamError} from '../lib/errors';

/**
 * Turns a provider/network failure into a message that is safe and useful to show. It never
 * includes API keys or the provider's raw error body.
 */
export function describeLlmFailure(err: unknown, task: string): AppError {
  if (err instanceof AppError) return err;
  const status = typeof err === 'object' && err !== null ? (err as {status?: number}).status : undefined;
  const name = err instanceof Error ? err.name : '';
  if (status === 401 || status === 403) {
    return upstreamError(`${task} failed: the AI service rejected the server’s credentials. Please contact the administrator.`);
  }
  if (status === 429) {
    return upstreamError(`${task} failed: the AI service is busy or its free usage limit was reached. Try again in a minute.`);
  }
  if (status === 400 || status === 413 || status === 422) {
    return upstreamError(`${task} failed: the AI service could not process this request.`);
  }
  if (name.includes('Timeout') || /timed? ?out/i.test(String((err as Error)?.message))) {
    return upstreamError(`${task} failed: the AI service took too long to respond. Try a smaller document.`);
  }
  return upstreamError(`${task} failed: the AI service could not process this document. Try again later.`);
}

/** The model answered, but not in the format we asked for. */
export class UnusableModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnusableModelOutputError';
  }
}
