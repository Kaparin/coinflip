import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { userService } from '../services/user.service.js';
import { vaultService } from '../services/vault.service.js';
import { Errors } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

export const usersRouter = new Hono<AppEnv>();

// GET /api/v1/users/me — Current user profile with real stats (auth required)
usersRouter.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  const [session, balance, stats] = await Promise.all([
    userService.getActiveSession(user.id),
    vaultService.getBalance(user.id),
    userService.getUserStats(user.id),
  ]);

  return c.json({
    data: {
      address: user.address,
      nickname: user.profileNickname,
      avatar_url: user.avatarUrl,
      stats,
      vault: balance,
      authz_enabled: session?.authzEnabled ?? false,
      authz_expires_at: session?.authzExpirationTime?.toISOString() ?? null,
      fee_sponsored: session?.feeSponsored ?? false,
    },
  });
});

// GET /api/v1/users/leaderboard — Public leaderboard
const LeaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['wins', 'wagered', 'win_rate']).default('wins'),
});

usersRouter.get('/leaderboard', zValidator('query', LeaderboardQuerySchema), async (c) => {
  const { limit, sort } = c.req.valid('query');
  const leaderboard = await userService.getLeaderboard(limit, sort);

  return c.json({
    data: leaderboard,
  });
});

// GET /api/v1/users/:address — Public profile with real stats
usersRouter.get('/:address', async (c) => {
  const address = c.req.param('address');
  const user = await userService.getUserByAddress(address);

  if (!user) throw Errors.userNotFound();

  const stats = await userService.getUserStats(user.id);

  return c.json({
    data: {
      address: user.address,
      nickname: user.profileNickname,
      avatar_url: user.avatarUrl,
      stats,
    },
  });
});
