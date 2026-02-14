import type { ErrorHandler } from 'hono';
import { logger } from '../lib/logger.js';

export const errorHandler: ErrorHandler = (err, c) => {
  logger.error({ err, path: c.req.path, method: c.req.method }, 'Unhandled error');

  // Structured error from our app
  if ('code' in err && typeof (err as Record<string, unknown>).code === 'string') {
    const appErr = err as { code: string; message: string; status?: number };
    return c.json(
      { error: { code: appErr.code, message: appErr.message } },
      (appErr.status as 400) ?? 500,
    );
  }

  // Zod validation error
  if (err.name === 'ZodError') {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err } },
      422,
    );
  }

  // Unknown error
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    500,
  );
};
