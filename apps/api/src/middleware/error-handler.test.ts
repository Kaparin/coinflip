import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { AppError } from '../lib/errors.js';

// Mock logger to avoid pino-pretty issues in tests
vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const { errorHandler } = await import('./error-handler.js');

function createTestApp() {
  const app = new Hono();
  app.onError(errorHandler);
  return app;
}

describe('Error Handler Middleware', () => {
  it('handles AppError with correct status and body', async () => {
    const app = createTestApp();
    app.get('/test', () => {
      throw new AppError('TEST_ERROR', 'Something went wrong', 400, { field: 'name' });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(400);

    const body = await res.json() as { error: { code: string; message: string; details: { field: string } } };
    expect(body.error.code).toBe('TEST_ERROR');
    expect(body.error.message).toBe('Something went wrong');
    expect(body.error.details).toEqual({ field: 'name' });
  });

  it('handles AppError 404', async () => {
    const app = createTestApp();
    app.get('/test', () => {
      throw new AppError('NOT_FOUND', 'Item not found', 404);
    });

    const res = await app.request('/test');
    expect(res.status).toBe(404);

    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('handles ZodError as 422', async () => {
    const app = createTestApp();
    app.get('/test', () => {
      const err = new Error('Zod validation') as Error & { name: string };
      err.name = 'ZodError';
      throw err;
    });

    const res = await app.request('/test');
    expect(res.status).toBe(422);

    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('handles unknown errors as 500', async () => {
    const app = createTestApp();
    app.get('/test', () => {
      throw new Error('unexpected crash');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(500);

    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
  });
});
