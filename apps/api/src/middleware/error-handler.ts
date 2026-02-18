import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

export const errorHandler: ErrorHandler = (err, c) => {
  // Our structured AppError
  if (err instanceof AppError) {
    logger.warn({ code: err.code, message: err.message, status: err.status, path: c.req.path }, 'App error');
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.status as ContentfulStatusCode,
    );
  }

  // Zod validation error
  if (err.name === 'ZodError') {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: err } },
      422,
    );
  }

  // Error with explicit status (e.g. inflight guard 429)
  const status = (err as { status?: number }).status;
  if (typeof status === 'number' && status >= 400 && status < 600) {
    return c.json(
      { error: { code: 'ACTION_IN_PROGRESS', message: err.message } },
      status as ContentfulStatusCode,
    );
  }

  // Unknown error
  logger.error({ err, path: c.req.path, method: c.req.method }, 'Unhandled error');
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    500,
  );
};
