import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { TreasuryWithdrawRequestSchema, TreasuryLedgerQuerySchema } from '@coinflip/shared/schemas';
import { adminMiddleware } from '../middleware/admin.js';
import { treasuryService } from '../services/treasury.service.js';
import type { AppEnv } from '../types.js';

export const adminRouter = new Hono<AppEnv>();

// All admin routes require admin access
adminRouter.use('*', adminMiddleware);

// ---------- Treasury ----------

// GET /api/v1/admin/treasury/balance
adminRouter.get('/treasury/balance', async (c) => {
  const balance = await treasuryService.getBalance();

  return c.json({
    data: {
      vault: {
        available: balance.vaultAvailable,
        locked: balance.vaultLocked,
      },
      wallet: {
        balance: balance.walletBalance,
      },
    },
  });
});

// GET /api/v1/admin/treasury/stats
adminRouter.get('/treasury/stats', async (c) => {
  const stats = await treasuryService.getLedgerStats();

  return c.json({
    data: {
      totalCommissions: stats.totalAmount,
      totalEntries: stats.entryCount,
      last24h: stats.last24hAmount,
      last7d: stats.last7dAmount,
    },
  });
});

// GET /api/v1/admin/treasury/ledger
adminRouter.get('/treasury/ledger', zValidator('query', TreasuryLedgerQuerySchema), async (c) => {
  const { limit, offset } = c.req.valid('query');
  const { rows, total } = await treasuryService.getLedger(limit, offset);

  return c.json({
    data: rows,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  });
});

// POST /api/v1/admin/treasury/withdraw
adminRouter.post('/treasury/withdraw', zValidator('json', TreasuryWithdrawRequestSchema), async (c) => {
  const { amount } = c.req.valid('json');
  const result = await treasuryService.withdrawFromVault(amount);

  return c.json({
    data: {
      status: 'confirmed',
      txHash: result.txHash,
      amount: result.amount,
      message: 'Treasury withdrawal confirmed on chain.',
    },
  });
});

// ---------- Platform Stats ----------

// GET /api/v1/admin/platform/stats
adminRouter.get('/platform/stats', async (c) => {
  const stats = await treasuryService.getPlatformStats();

  return c.json({
    data: stats,
  });
});
