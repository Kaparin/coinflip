import type { ErrorHandler } from 'hono';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

export const errorHandler: ErrorHandler = (err, c) => {
  // Our structured AppError
  if (err instanceof AppError) {
    logger.warn({ code: err.code, message: err.message, path: c.req.path }, 'App error');
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.status as 400,
    );
  }

  // Zod validation error
  if (err.name === 'ZodError') {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: err } },
      422,
    );
  }

  // Unknown error
  logger.error({ err, path: c.req.path, method: c.req.method }, 'Unhandled error');
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    500,
  );
};
