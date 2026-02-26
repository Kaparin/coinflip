import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';
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

// PATCH /api/v1/users/me — Update current user profile (nickname)
const UpdateProfileSchema = z.object({
  nickname: z
    .string()
    .min(2, 'Nickname must be at least 2 characters')
    .max(20, 'Nickname must be at most 20 characters')
    .regex(/^[a-zA-Z0-9а-яА-ЯёЁ _\-\.]+$/, 'Nickname can only contain letters, numbers, spaces, underscores, hyphens, and dots'),
});

usersRouter.patch('/me', authMiddleware, zValidator('json', UpdateProfileSchema), async (c) => {
  const user = c.get('user');
  const { nickname } = c.req.valid('json');

  const updated = await userService.updateNickname(user.id, nickname);
  if (!updated) throw Errors.userNotFound();

  return c.json({
    data: {
      address: updated.address,
      nickname: updated.profileNickname,
    },
  });
});

// GET /api/v1/users/top-winner — Biggest single win ever (public, cached)
usersRouter.get('/top-winner', async (c) => {
  const topWinner = await userService.getTopWinner();
  return c.json({ data: topWinner });
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

// POST /api/v1/users/:address/reaction — Set reaction on a profile
const ReactionSchema = z.object({
  emoji: z.string().min(1).max(4),
});

usersRouter.post('/:address/reaction', authMiddleware, zValidator('json', ReactionSchema), async (c) => {
  const address = c.req.param('address');
  const { emoji } = c.req.valid('json');
  const viewer = c.get('user');

  const targetUser = await userService.getUserByAddress(address);
  if (!targetUser) throw Errors.userNotFound();

  try {
    await userService.setProfileReaction(viewer.id, targetUser.id, emoji);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'VALIDATION_ERROR', message: msg } }, 400);
  }

  return c.json({ data: { emoji } });
});

// DELETE /api/v1/users/:address/reaction — Remove reaction from a profile
usersRouter.delete('/:address/reaction', authMiddleware, async (c) => {
  const address = c.req.param('address');
  const viewer = c.get('user');

  const targetUser = await userService.getUserByAddress(address);
  if (!targetUser) throw Errors.userNotFound();

  await userService.removeProfileReaction(viewer.id, targetUser.id);
  return c.json({ data: { removed: true } });
});

// GET /api/v1/users/:address — Public profile with stats, recent bets, and optional H2H
usersRouter.get('/:address', optionalAuthMiddleware, async (c) => {
  const address = c.req.param('address');
  const user = await userService.getUserByAddress(address);

  if (!user) throw Errors.userNotFound();

  const [stats, recentBets, achievements, reactions] = await Promise.all([
    userService.getUserStats(user.id),
    userService.getPlayerRecentBets(user.id, 20),
    userService.getUserAchievements(user.id),
    userService.getProfileReactions(user.id),
  ]);

  // H2H stats + viewer's own reaction if authenticated
  let h2h: { total_games: number; your_wins: number; their_wins: number } | null = null;
  let myReaction: string | null = null;
  const viewer = c.get('user');
  if (viewer && viewer.id !== user.id) {
    [h2h, myReaction] = await Promise.all([
      userService.getHeadToHead(viewer.id, user.id),
      userService.getMyReaction(viewer.id, user.id),
    ]);
  }

  return c.json({
    data: {
      address: user.address,
      nickname: user.profileNickname,
      avatar_url: user.avatarUrl,
      created_at: user.createdAt.toISOString(),
      stats,
      recent_bets: recentBets,
      h2h,
      achievements,
      reactions,
      my_reaction: myReaction,
    },
  });
});
