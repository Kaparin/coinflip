import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { jackpotPools, jackpotTiers } from '@coinflip/db/schema';
import { authMiddleware, optionalAuthMiddleware, evictUserCache } from '../middleware/auth.js';
import { userService } from '../services/user.service.js';
import { vaultService } from '../services/vault.service.js';
import { announcementService } from '../services/announcement.service.js';
import { getDb } from '../lib/db.js';
import { Errors } from '../lib/errors.js';
import { verifyTelegramLogin } from '../lib/telegram-auth.js';
import { logger } from '../lib/logger.js';
import type { AppEnv } from '../types.js';

export const usersRouter = new Hono<AppEnv>();

// GET /api/v1/users/me — Current user profile with real stats (auth required)
usersRouter.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  const [session, balance, stats, vipTier] = await Promise.all([
    userService.getActiveSession(user.id),
    vaultService.getBalance(user.id),
    userService.getUserStats(user.id),
    userService.getVipTier(user.id),
  ]);

  return c.json({
    data: {
      address: user.address,
      nickname: user.profileNickname,
      avatar_url: user.avatarUrl,
      vip_tier: vipTier,
      stats,
      vault: balance,
      authz_enabled: session?.authzEnabled ?? false,
      authz_expires_at: session?.authzExpirationTime?.toISOString() ?? null,
      fee_sponsored: session?.feeSponsored ?? false,
      telegram: user.telegramId ? {
        id: user.telegramId,
        username: user.telegramUsername,
        first_name: user.telegramFirstName,
        photo_url: user.telegramPhotoUrl,
      } : null,
    },
  });
});

// PATCH /api/v1/users/me — Update current user profile (nickname)
const UpdateProfileSchema = z.object({
  nickname: z
    .string()
    .min(2, 'Nickname must be at least 2 characters')
    .max(30, 'Nickname must be at most 30 characters')
    .regex(/^[\p{L}\p{N}\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F _\-\.]+$/u, 'Nickname can only contain letters, numbers, emoji, spaces, underscores, hyphens, and dots'),
});

usersRouter.patch('/me', authMiddleware, zValidator('json', UpdateProfileSchema), async (c) => {
  const user = c.get('user');
  const { nickname } = c.req.valid('json');

  const updated = await userService.updateNickname(user.id, nickname);
  if (!updated) throw Errors.userNotFound();

  evictUserCache(user.address);

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

// POST /api/v1/users/me/telegram — Link Telegram account
const TelegramLinkSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number(),
  hash: z.string(),
});

usersRouter.post('/me/telegram', authMiddleware, zValidator('json', TelegramLinkSchema), async (c) => {
  const user = c.get('user');
  const telegramData = c.req.valid('json');

  const now = Math.floor(Date.now() / 1000);
  logger.info({ userId: user.id, address: user.address, tgId: telegramData.id, tgUsername: telegramData.username, authDate: telegramData.auth_date, authAge: now - telegramData.auth_date }, 'Telegram link attempt');

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.error('TELEGRAM_BOT_TOKEN is not configured');
    return c.json({ error: { code: 'SERVER_ERROR', message: 'Telegram integration not configured' } }, 500);
  }

  const result = verifyTelegramLogin(telegramData, botToken);
  if (!result.valid) {
    logger.warn({ userId: user.id, tgId: telegramData.id, reason: result.reason, authAge: now - telegramData.auth_date }, 'Telegram link verification failed');
    return c.json({ error: { code: 'VALIDATION_ERROR', message: result.reason } }, 400);
  }

  try {
    const updated = await userService.linkTelegram(user.id, {
      telegramId: telegramData.id,
      username: telegramData.username ?? null,
      firstName: telegramData.first_name,
      photoUrl: telegramData.photo_url ?? null,
    });

    // Evict cached user so next GET /me returns fresh telegram data
    evictUserCache(user.address);

    return c.json({
      data: {
        telegram: {
          id: updated!.telegramId,
          username: updated!.telegramUsername,
          first_name: updated!.telegramFirstName,
          photo_url: updated!.telegramPhotoUrl,
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: { code: 'CONFLICT', message: msg } }, 409);
  }
});

// DELETE /api/v1/users/me/telegram — Unlink Telegram account
usersRouter.delete('/me/telegram', authMiddleware, async (c) => {
  const user = c.get('user');
  await userService.unlinkTelegram(user.id);
  // Evict cached user so next GET /me returns fresh data without telegram
  evictUserCache(user.address);
  return c.json({ data: { removed: true } });
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

// GET /api/v1/users/:address/announcements — Published announcements by this user
usersRouter.get('/:address/announcements', async (c) => {
  const address = c.req.param('address');
  const items = await announcementService.getByUserAddress(address);
  return c.json({ data: items });
});

// GET /api/v1/users/:address — Public profile with stats, recent bets, and optional H2H
const PlayerProfileQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

usersRouter.get('/:address', optionalAuthMiddleware, zValidator('query', PlayerProfileQuerySchema), async (c) => {
  const address = c.req.param('address');
  const { limit, offset } = c.req.valid('query');
  const user = await userService.getUserByAddress(address);

  if (!user) throw Errors.userNotFound();

  const db = getDb();
  const [stats, recentBetsResult, achievements, reactions, vipTier, jackpotWins] = await Promise.all([
    userService.getUserStats(user.id),
    userService.getPlayerRecentBets(user.id, limit, offset),
    userService.getUserAchievements(user.id),
    userService.getProfileReactions(user.id),
    userService.getVipTier(user.id),
    db
      .select({
        tierName: jackpotTiers.name,
        amount: jackpotPools.currentAmount,
        wonAt: jackpotPools.completedAt,
        cycle: jackpotPools.cycle,
      })
      .from(jackpotPools)
      .innerJoin(jackpotTiers, eq(jackpotTiers.id, jackpotPools.tierId))
      .where(eq(jackpotPools.winnerUserId, user.id))
      .orderBy(sql`${jackpotPools.completedAt} DESC NULLS LAST`)
      .limit(10),
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
      vip_tier: vipTier,
      created_at: user.createdAt.toISOString(),
      stats,
      recent_bets: recentBetsResult.bets,
      recent_bets_total: recentBetsResult.total,
      h2h,
      achievements,
      reactions,
      my_reaction: myReaction,
      jackpot_wins: jackpotWins.map((jw) => ({
        tierName: jw.tierName,
        amount: jw.amount,
        wonAt: jw.wonAt instanceof Date ? jw.wonAt.toISOString() : jw.wonAt ?? null,
        cycle: jw.cycle,
      })),
      telegram: user.telegramUsername ? {
        username: user.telegramUsername,
        photo_url: user.telegramPhotoUrl ?? null,
      } : null,
    },
  });
});
