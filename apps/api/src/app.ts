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
import { eventsRouter } from './routes/events.js';
import { jackpotRouter } from './routes/jackpot.js';
import { notificationsRouter } from './routes/notifications.js';
import { activityRouter } from './routes/activity.js';
import { vipRouter } from './routes/vip.js';
import { newsRouter } from './routes/news.js';
import { announcementsRouter } from './routes/announcements.js';
import { adminEventsRouter } from './routes/admin-events.js';
import { adminTransactionsRouter } from './routes/admin-transactions.js';
import { errorHandler } from './middleware/error-handler.js';
import { ipRateLimit } from './middleware/rate-limit.js';
import { maintenanceMiddleware } from './middleware/maintenance.js';
import { configService } from './services/config.service.js';
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

// ---- Maintenance mode middleware ----
app.use('/api/v1/*', maintenanceMiddleware);

// ---- Public config endpoint ----
app.get('/api/v1/config/public', async (c) => {
  const [betPresets, minBetAmount, maintenance, maintenanceMessage] = await Promise.all([
    configService.getJson<number[]>('BET_PRESETS', [1, 5, 10, 50, 100, 500]),
    configService.getString('MIN_BET_AMOUNT', '1000000'),
    configService.isMaintenanceMode(),
    configService.getMaintenanceMessage(),
  ]);
  return c.json({
    data: {
      betPresets,
      minBetAmount,
      maintenance,
      maintenanceMessage: maintenance ? maintenanceMessage : '',
    },
  });
});

// ---- API routes ----
app.route('/api/v1/bets', betsRouter);
app.route('/api/v1/vault', vaultRouter);
app.route('/api/v1/users', usersRouter);
app.route('/api/v1/auth', authRouter);
app.route('/api/v1/admin/events', adminEventsRouter);
app.route('/api/v1/admin/relayer-transactions', adminTransactionsRouter);
app.route('/api/v1/admin', adminRouter);
app.route('/api/v1/referral', referralRouter);
app.route('/api/v1/events', eventsRouter);
app.route('/api/v1/jackpot', jackpotRouter);
app.route('/api/v1/notifications', notificationsRouter);
app.route('/api/v1/activity', activityRouter);
app.route('/api/v1/vip', vipRouter);
app.route('/api/v1/news', newsRouter);
app.route('/api/v1/announcements', announcementsRouter);

// ---- 404 fallback ----
app.notFound((c) =>
  c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404),
);
