import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { JackpotHistoryQuerySchema } from '@coinflip/shared/schemas';
import { authMiddleware } from '../middleware/auth.js';
import { jackpotService } from '../services/jackpot.service.js';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

export const jackpotRouter = new Hono<AppEnv>();

// GET /jackpot/active — Active pools (public)
jackpotRouter.get('/active', async (c) => {
  const data = await jackpotService.getActivePools();
  return c.json({ data });
});

// GET /jackpot/history — Completed pools with pagination
jackpotRouter.get('/history', zValidator('query', JackpotHistoryQuerySchema), async (c) => {
  const { limit, offset } = c.req.valid('query');
  const data = await jackpotService.getHistory(limit, offset);
  return c.json({ data });
});

// GET /jackpot/eligibility — User's tier eligibility (auth required)
// Must be before /:poolId to avoid path param capture
jackpotRouter.get('/eligibility', authMiddleware, async (c) => {
  const user = c.get('user');
  const data = await jackpotService.getUserEligibility(user.id);
  return c.json({ data });
});

// GET /jackpot/:poolId — Pool details
jackpotRouter.get('/:poolId', async (c) => {
  const poolId = c.req.param('poolId');
  const data = await jackpotService.getPoolById(poolId);
  if (!data) throw new AppError('POOL_NOT_FOUND', 'Jackpot pool not found', 404);
  return c.json({ data });
});
