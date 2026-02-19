import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { adminMiddleware } from '../middleware/admin.js';
import { relayerTxLogService } from '../services/relayer-tx-log.service.js';
import type { AppEnv } from '../types.js';

export const adminTransactionsRouter = new Hono<AppEnv>();

adminTransactionsRouter.use('*', adminMiddleware);

const QuerySchema = z.object({
  action: z.string().optional(),
  success: z.enum(['true', 'false']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /admin/relayer-transactions
adminTransactionsRouter.get('/', zValidator('query', QuerySchema), async (c) => {
  const { action, success, search, limit, offset } = c.req.valid('query');

  const successFilter = success === 'true' ? true : success === 'false' ? false : undefined;

  const result = await relayerTxLogService.query(
    { action, success: successFilter, search },
    limit,
    offset,
  );

  return c.json({ data: result.data, total: result.total });
});
