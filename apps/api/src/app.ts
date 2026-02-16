import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { swaggerUI } from '@hono/swagger-ui';
import { betsRouter } from './routes/bets.js';
import { vaultRouter } from './routes/vault.js';
import { usersRouter } from './routes/users.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { referralRouter } from './routes/referral.js';
import { errorHandler } from './middleware/error-handler.js';
import { env } from './config/env.js';
import type { AppEnv } from './types.js';

export const app = new Hono<AppEnv>();

// ---- Global middleware ----
app.use('*', requestId());
app.use(
  '*',
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);
app.onError(errorHandler);

// ---- Health check ----
app.get('/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() }),
);

// ---- Swagger UI ----
app.get('/docs', swaggerUI({ url: '/openapi.json' }));
app.get('/openapi.json', async (c) => {
  // Serve the generated OpenAPI spec
  // In dev, read from file; in prod, could be bundled
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  try {
    const spec = readFileSync(
      resolve(__dirname, '../../../tooling/openapi/openapi.json'),
      'utf-8',
    );
    return c.json(JSON.parse(spec));
  } catch {
    return c.json({ error: 'OpenAPI spec not found. Run: pnpm generate:openapi' }, 404);
  }
});

// ---- API routes ----
app.route('/api/v1/bets', betsRouter);
app.route('/api/v1/vault', vaultRouter);
app.route('/api/v1/users', usersRouter);
app.route('/api/v1/auth', authRouter);
app.route('/api/v1/admin', adminRouter);
app.route('/api/v1/referral', referralRouter);

// ---- 404 fallback ----
app.notFound((c) =>
  c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404),
);
