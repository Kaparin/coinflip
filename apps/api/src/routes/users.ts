import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { userService } from '../services/user.service.js';
import { vaultService } from '../services/vault.service.js';
import { betService } from '../services/bet.service.js';
import { Errors } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

export const usersRouter = new Hono<AppEnv>();

// GET /api/v1/users/me — Current user profile (auth required)
usersRouter.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  const session = await userService.getActiveSession(user.id);
  const balance = await vaultService.getBalance(user.id);

  return c.json({
    data: {
      address: user.address,
      nickname: user.profileNickname,
      avatar_url: user.avatarUrl,
      stats: {
        total_bets: 0, // TODO: compute from bet history
        wins: 0,
        losses: 0,
        total_wagered: '0',
        total_won: '0',
      },
      vault: balance,
      authz_enabled: session?.authzEnabled ?? false,
      authz_expires_at: session?.authzExpirationTime?.toISOString() ?? null,
      fee_sponsored: session?.feeSponsored ?? false,
    },
  });
});

// GET /api/v1/users/:address — Public profile
usersRouter.get('/:address', async (c) => {
  const address = c.req.param('address');
  const user = await userService.getUserByAddress(address);

  if (!user) throw Errors.userNotFound();

  return c.json({
    data: {
      address: user.address,
      nickname: user.profileNickname,
      avatar_url: user.avatarUrl,
      stats: {
        total_bets: 0,
        wins: 0,
        losses: 0,
        total_wagered: '0',
        total_won: '0',
      },
      authz_enabled: false,
      authz_expires_at: null,
      fee_sponsored: false,
    },
  });
});
