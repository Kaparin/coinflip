import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { activityService } from '../services/activity.service.js';
import type { AppEnv } from '../types.js';

export const activityRouter = new Hono<AppEnv>();

const ActivityQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  types: z.string().optional(), // comma-separated: 'bet_win,bet_loss,referral_reward,jackpot_win'
});

// GET /api/v1/activity — unified activity feed (auth required)
activityRouter.get('/', authMiddleware, zValidator('query', ActivityQuerySchema), async (c) => {
  const user = c.get('user');
  const { cursor, limit, types } = c.req.valid('query');

  const typeFilter = types
    ? types.split(',').map((t) => t.trim()).filter(Boolean)
    : undefined;

  const result = await activityService.getUserActivity(user.id, {
    cursor,
    limit,
    types: typeFilter,
  });

  return c.json({
    data: result.items,
    nextCursor: result.nextCursor,
  });
});
