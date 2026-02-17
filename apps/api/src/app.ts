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
import { ipRateLimit } from './middleware/rate-limit.js';
import { env } from './config/env.js';
import { getDb } from './lib/db.js';
import { sql } from 'drizzle-orm';
import { logger } from './lib/logger.js';
import type { AppEnv } from './types.js';

export const app = new Hono<AppEnv>();

// ---- Global middleware ----
app.use('*', requestId());

// Support multiple origins via comma-separated CORS_ORIGIN env var
const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
app.use(
  '*',
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

// IP-based rate limit on all API routes (60 req/min per IP)
app.use('/api/*', ipRateLimit);

app.onError(errorHandler);

// ---- Health check (with dependency probes) ----
app.get('/health', async (c) => {
  const checks: Record<string, 'ok' | 'error'> = {};

  // DB check
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    checks.db = 'ok';
  } catch {
    checks.db = 'error';
  }

  // Chain RPC check
  try {
    const res = await fetch(`${env.AXIOME_REST_URL}/cosmos/base/tendermint/v1beta1/syncing`, {
      signal: AbortSignal.timeout(3000),
    });
    checks.chain = res.ok ? 'ok' : 'error';
  } catch {
    checks.chain = 'error';
  }

  const allHealthy = Object.values(checks).every(v => v === 'ok');
  const status = allHealthy ? 'ok' : 'degraded';

  if (!allHealthy) {
    logger.warn({ checks }, 'Health check: some dependencies unhealthy');
  }

  return c.json(
    { status, timestamp: new Date().toISOString(), checks },
    allHealthy ? 200 : 503,
  );
});

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
