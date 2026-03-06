import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { userService } from '../services/user.service.js';
import { chatService } from '../services/chat.service.js';
import { wsService } from '../services/ws.service.js';
import { getDb } from '../lib/db.js';
import type { AppEnv } from '../types.js';

export const socialRouter = new Hono<AppEnv>();

// GET /api/v1/social/online — Online users with profiles
socialRouter.get('/online', async (c) => {
  const onlineAddresses = wsService.getOnlineAddresses();
  if (onlineAddresses.length === 0) {
    return c.json({ data: [], count: 0 });
  }

  const db = getDb();
  // Build address list for IN clause
  const addressList = onlineAddresses.map(a => `'${a.replace(/'/g, "''")}'`).join(',');
  const rows = await db.execute(sql.raw(`
    SELECT u.address, u.profile_nickname as nickname,
      (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = u.id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1) AS vip_tier,
      vc.name_gradient, vc.frame_style, vc.badge_icon,
      (SELECT count(*)::int FROM bets b WHERE (b.maker_user_id = u.id OR b.acceptor_user_id = u.id) AND b.status IN ('revealed','timeout_claimed')) as total_bets
    FROM users u
    LEFT JOIN vip_customization vc ON vc.user_id = u.id
    WHERE u.address IN (${addressList})
    ORDER BY total_bets DESC
  `));
  const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;

  const users = rawRows.map((r) => ({
    address: String(r.address),
    nickname: r.nickname ? String(r.nickname) : null,
    vip_tier: r.vip_tier ? String(r.vip_tier) : null,
    vip_customization: r.vip_tier === 'diamond' && (r.name_gradient || r.frame_style || r.badge_icon) ? {
      nameGradient: String(r.name_gradient ?? 'default'),
      frameStyle: String(r.frame_style ?? 'default'),
      badgeIcon: String(r.badge_icon ?? 'default'),
    } : null,
    total_bets: Number(r.total_bets ?? 0),
    is_online: true,
  }));

  return c.json({ data: users, count: onlineAddresses.length });
});

// GET /api/v1/social/users — All users with search + pagination
const UsersQuerySchema = z.object({
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

socialRouter.get('/users', zValidator('query', UsersQuerySchema), async (c) => {
  const { q, cursor, limit } = c.req.valid('query');
  const db = getDb();
  const onlineAddresses = new Set(wsService.getOnlineAddresses());

  let whereClause = "WHERE u.address NOT LIKE 'tg_%'";
  if (q && q.trim().length >= 2) {
    const searchTerm = q.trim().replace(/'/g, "''");
    whereClause += ` AND (u.profile_nickname ILIKE '%${searchTerm}%' OR u.address ILIKE '%${searchTerm}%')`;
  }
  if (cursor) {
    const cursorEscaped = cursor.replace(/'/g, "''");
    whereClause += ` AND u.created_at < '${cursorEscaped}'`;
  }

  const rows = await db.execute(sql.raw(`
    SELECT u.id::text, u.address, u.profile_nickname as nickname, u.created_at,
      (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = u.id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1) AS vip_tier,
      vc.name_gradient, vc.frame_style, vc.badge_icon,
      (SELECT count(*)::int FROM bets b WHERE (b.maker_user_id = u.id OR b.acceptor_user_id = u.id) AND b.status IN ('revealed','timeout_claimed')) as total_bets
    FROM users u
    LEFT JOIN vip_customization vc ON vc.user_id = u.id
    ${whereClause}
    ORDER BY
      CASE WHEN u.address IN (${onlineAddresses.size > 0 ? [...onlineAddresses].map(a => `'${a.replace(/'/g, "''")}'`).join(',') : "'__none__'"}) THEN 0 ELSE 1 END,
      total_bets DESC,
      u.created_at DESC
    LIMIT ${limit + 1}
  `));
  const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;

  const hasMore = rawRows.length > limit;
  const items = rawRows.slice(0, limit);
  const nextCursor = hasMore && items.length > 0 ? String(items[items.length - 1]!.created_at) : null;

  const users = items.map((r) => ({
    address: String(r.address),
    nickname: r.nickname ? String(r.nickname) : null,
    vip_tier: r.vip_tier ? String(r.vip_tier) : null,
    vip_customization: r.vip_tier === 'diamond' && (r.name_gradient || r.frame_style || r.badge_icon) ? {
      nameGradient: String(r.name_gradient ?? 'default'),
      frameStyle: String(r.frame_style ?? 'default'),
      badgeIcon: String(r.badge_icon ?? 'default'),
    } : null,
    total_bets: Number(r.total_bets ?? 0),
    is_online: onlineAddresses.has(String(r.address)),
  }));

  return c.json({ data: users, nextCursor });
});

// GET /api/v1/social/favorites — My favorites list
socialRouter.get('/favorites', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = getDb();
  const onlineAddresses = new Set(wsService.getOnlineAddresses());

  const rows = await db.execute(sql`
    SELECT f.favorite_user_id::text, u.address, u.profile_nickname as nickname,
      (SELECT vs.tier FROM vip_subscriptions vs WHERE vs.user_id = u.id AND vs.expires_at > NOW() AND vs.canceled_at IS NULL ORDER BY vs.expires_at DESC LIMIT 1) AS vip_tier,
      vc.name_gradient, vc.frame_style, vc.badge_icon,
      (SELECT count(*)::int FROM bets b WHERE (b.maker_user_id = u.id OR b.acceptor_user_id = u.id) AND b.status IN ('revealed','timeout_claimed')) as total_bets
    FROM user_favorites f
    JOIN users u ON u.id = f.favorite_user_id
    LEFT JOIN vip_customization vc ON vc.user_id = u.id
    WHERE f.user_id = ${user.id}
    ORDER BY u.profile_nickname ASC NULLS LAST
  `);
  const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;

  const users = rawRows.map((r) => ({
    address: String(r.address),
    nickname: r.nickname ? String(r.nickname) : null,
    vip_tier: r.vip_tier ? String(r.vip_tier) : null,
    vip_customization: r.vip_tier === 'diamond' && (r.name_gradient || r.frame_style || r.badge_icon) ? {
      nameGradient: String(r.name_gradient ?? 'default'),
      frameStyle: String(r.frame_style ?? 'default'),
      badgeIcon: String(r.badge_icon ?? 'default'),
    } : null,
    total_bets: Number(r.total_bets ?? 0),
    is_online: onlineAddresses.has(String(r.address)),
  }));

  return c.json({ data: users });
});

// POST /api/v1/social/favorites/:address — Add to favorites
socialRouter.post('/favorites/:address', authMiddleware, async (c) => {
  const user = c.get('user');
  const address = c.req.param('address');
  const target = await userService.getUserByAddress(address);
  if (!target) return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  if (target.id === user.id) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot favorite yourself' } }, 400);

  const db = getDb();
  await db.execute(sql`
    INSERT INTO user_favorites (user_id, favorite_user_id)
    VALUES (${user.id}, ${target.id})
    ON CONFLICT (user_id, favorite_user_id) DO NOTHING
  `);

  return c.json({ data: { added: true } });
});

// DELETE /api/v1/social/favorites/:address — Remove from favorites
socialRouter.delete('/favorites/:address', authMiddleware, async (c) => {
  const user = c.get('user');
  const address = c.req.param('address');
  const target = await userService.getUserByAddress(address);
  if (!target) return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);

  const db = getDb();
  await db.execute(sql`
    DELETE FROM user_favorites
    WHERE user_id = ${user.id} AND favorite_user_id = ${target.id}
  `);

  return c.json({ data: { removed: true } });
});

// GET /api/v1/social/favorites/check/:address — Check if user is in favorites
socialRouter.get('/favorites/check/:address', authMiddleware, async (c) => {
  const user = c.get('user');
  const address = c.req.param('address');
  const target = await userService.getUserByAddress(address);
  if (!target) return c.json({ data: { isFavorite: false } });

  const db = getDb();
  const rows = await db.execute(sql`
    SELECT 1 FROM user_favorites
    WHERE user_id = ${user.id} AND favorite_user_id = ${target.id}
    LIMIT 1
  `);
  const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<unknown>;
  return c.json({ data: { isFavorite: rawRows.length > 0 } });
});

// GET /api/v1/social/chat — Get today's messages
socialRouter.get('/chat', async (c) => {
  const messages = await chatService.getTodayMessages();
  return c.json({ data: messages });
});

// POST /api/v1/social/chat — Send message
const ChatMessageSchema = z.object({
  message: z.string().min(1).max(500).transform(s => s.trim()),
  style: z.enum(['highlighted', 'pinned']).nullable().optional(),
  effect: z.enum(['confetti', 'coins', 'fire']).nullable().optional(),
});

socialRouter.post('/chat', authMiddleware, zValidator('json', ChatMessageSchema), async (c) => {
  const user = c.get('user');
  const { message, style, effect } = c.req.valid('json');

  if (chatService.containsLinks(message)) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Links are not allowed in chat' } }, 400);
  }

  const check = chatService.canSend(user.id);
  if (!check.allowed) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Please wait', waitMs: check.waitMs } }, 429);
  }

  try {
    const chatMsg = await chatService.sendMessage(
      user.id,
      message,
      style ?? null,
      effect ?? null,
    );

    // Broadcast to all via WS
    wsService.emitChatMessage(chatMsg as unknown as Record<string, unknown>);

    return c.json({ data: chatMsg });
  } catch (err: any) {
    if (err?.message === 'INSUFFICIENT_BALANCE') {
      return c.json({ error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance for this message type' } }, 400);
    }
    throw err;
  }
});

// GET /api/v1/social/chat/prices — Get premium chat prices
socialRouter.get('/chat/prices', async (c) => {
  const { CHAT_PRICES } = await import('../services/chat.service.js');
  return c.json({
    data: {
      highlighted: CHAT_PRICES.highlighted,
      pinned: CHAT_PRICES.pinned,
      effect: CHAT_PRICES.effect,
    },
  });
});

// GET /api/v1/social/online-count — Just the count
socialRouter.get('/online-count', async (c) => {
  return c.json({ data: { count: wsService.getOnlineAddresses().length } });
});
