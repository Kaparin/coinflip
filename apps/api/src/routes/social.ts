import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { userService } from '../services/user.service.js';
import { chatService } from '../services/chat.service.js';
import { vaultService } from '../services/vault.service.js';
import { wsService } from '../services/ws.service.js';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import type { AppEnv } from '../types.js';

export const socialRouter = new Hono<AppEnv>();

// ─── Online Users ──────────────────────────────────────────

// GET /api/v1/social/online — Online users with profiles
socialRouter.get('/online', async (c) => {
  const onlineAddresses = wsService.getOnlineAddresses();
  if (onlineAddresses.length === 0) {
    return c.json({ data: [], count: 0 });
  }

  const db = getDb();
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

// ─── All Users ──────────────────────────────────────────────

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

// ─── Favorites ──────────────────────────────────────────────

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

// ─── Chat ──────────────────────────────────────────────────

socialRouter.get('/chat', async (c) => {
  const messages = await chatService.getTodayMessages();
  return c.json({ data: messages });
});

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
    const chatMsg = await chatService.sendMessage(user.id, message, style ?? null, effect ?? null);
    wsService.emitChatMessage(chatMsg as unknown as Record<string, unknown>);
    return c.json({ data: chatMsg });
  } catch (err: any) {
    if (err?.message === 'INSUFFICIENT_BALANCE') {
      return c.json({ error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient COIN balance' } }, 400);
    }
    throw err;
  }
});

socialRouter.get('/chat/prices', async (c) => {
  const { CHAT_PRICES } = await import('../services/chat.service.js');
  return c.json({
    data: {
      highlighted: CHAT_PRICES.highlighted,
      pinned: CHAT_PRICES.pinned,
      effect: CHAT_PRICES.effect,
      coinDropMin: CHAT_PRICES.coinDropMin,
    },
  });
});

// ─── COIN Drop ─────────────────────────────────────────────

const CoinDropSchema = z.object({
  amount: z.number().min(1).max(100000),
  message: z.string().min(1).max(200).transform(s => s.trim()).optional(),
});

socialRouter.post('/chat/coin-drop', authMiddleware, zValidator('json', CoinDropSchema), async (c) => {
  const user = c.get('user');
  const { amount, message } = c.req.valid('json');

  const check = chatService.canSend(user.id);
  if (!check.allowed) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Please wait', waitMs: check.waitMs } }, 429);
  }

  const microAmount = String(Math.floor(amount * 1_000_000));
  const dropMessage = message || `${amount} COIN`;

  try {
    const chatMsg = await chatService.sendCoinDrop(user.id, microAmount, dropMessage);
    wsService.emitChatMessage(chatMsg as unknown as Record<string, unknown>);
    return c.json({ data: chatMsg });
  } catch (err: any) {
    if (err?.message === 'INSUFFICIENT_BALANCE') {
      return c.json({ error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient COIN balance' } }, 400);
    }
    if (err?.message === 'MIN_AMOUNT') {
      return c.json({ error: { code: 'MIN_AMOUNT', message: 'Minimum drop is 1 COIN' } }, 400);
    }
    throw err;
  }
});

socialRouter.post('/chat/coin-drop/:messageId/claim', authMiddleware, async (c) => {
  const user = c.get('user');
  const messageId = c.req.param('messageId');

  try {
    const result = await chatService.claimCoinDrop(messageId, user.id);

    if (!result.success) {
      return c.json({ error: { code: 'ALREADY_CLAIMED', message: 'This coin drop has already been claimed' } }, 400);
    }

    // Broadcast claim event so all clients update the drop state
    wsService.broadcast({
      type: 'coin_drop_claimed',
      data: {
        messageId,
        claimedByAddress: result.drop!.claimedByAddress,
        claimedByNickname: result.drop!.claimedByNickname,
      },
    });

    return c.json({ data: { claimed: true, amount: result.drop!.amount } });
  } catch (err) {
    logger.error({ err, messageId }, 'Failed to claim coin drop');
    throw err;
  }
});

// ─── P2P COIN Transfer ────────────────────────────────────

const TRANSFER_FEE_BPS = 500; // 5% fee

const TransferSchema = z.object({
  recipientAddress: z.string().min(1),
  amount: z.number().min(1).max(1000000),
  currency: z.enum(['coin', 'axm']).default('coin'),
  message: z.string().max(200).optional(),
});

socialRouter.post('/transfer', authMiddleware, zValidator('json', TransferSchema), async (c) => {
  const user = c.get('user');
  const { recipientAddress, amount, currency, message } = c.req.valid('json');

  // Find recipient
  const recipient = await userService.getUserByAddress(recipientAddress);
  if (!recipient) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Recipient not found' } }, 404);
  }
  if (recipient.id === user.id) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot transfer to yourself' } }, 400);
  }

  const microAmount = String(Math.floor(amount * 1_000_000));
  const fee = String(Math.floor(amount * 1_000_000 * TRANSFER_FEE_BPS / 10000));
  const totalDeduct = String(BigInt(microAmount) + BigInt(fee));

  if (currency === 'coin') {
    // COIN: virtual currency (coin_balance)
    const deducted = await vaultService.deductCoin(user.id, totalDeduct);
    if (!deducted) {
      return c.json({ error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient COIN balance' } }, 400);
    }
    await vaultService.creditCoin(recipient.id, microAmount);
  } else {
    // AXM: deduct from vault available (offchainSpent), credit to recipient (bonus)
    try {
      await vaultService.deductBalance(user.id, totalDeduct);
    } catch {
      return c.json({ error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient AXM balance' } }, 400);
    }
    await vaultService.creditWinner(recipient.id, microAmount);
  }

  // Record transfer
  const db = getDb();
  await db.execute(sql`
    INSERT INTO coin_transfers (sender_id, recipient_id, amount, fee, message, currency)
    VALUES (${user.id}, ${recipient.id}, ${microAmount}, ${fee}, ${message ?? null}, ${currency})
  `);

  // Get sender info for notification
  const senderInfo = await db.execute(sql`
    SELECT address, profile_nickname as nickname FROM users WHERE id = ${user.id}
  `);
  const rawSender = (Array.isArray(senderInfo) ? senderInfo : (senderInfo as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
  const sender = rawSender[0]!;

  // Notify recipient via WS
  wsService.sendToAddress(recipientAddress, {
    type: 'coin_transfer',
    data: {
      fromAddress: String(sender.address),
      fromNickname: sender.nickname ? String(sender.nickname) : null,
      amount: microAmount,
      fee,
      currency,
      message: message ?? null,
    },
  });

  logger.info({ senderId: user.id, recipientId: recipient.id, amount: microAmount, fee, currency }, `${currency.toUpperCase()} transfer completed`);

  return c.json({
    data: {
      success: true,
      amount: microAmount,
      fee,
      currency,
      recipientAddress,
    },
  });
});

// GET /api/v1/social/transfers — Transfer history
socialRouter.get('/transfers', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = getDb();

  const rows = await db.execute(sql`
    SELECT t.id::text, t.amount::text, t.fee::text, t.message, t.created_at,
      t.sender_id::text, t.recipient_id::text,
      coalesce(t.currency, 'coin') as currency,
      su.address as sender_address, su.profile_nickname as sender_nickname,
      ru.address as recipient_address, ru.profile_nickname as recipient_nickname
    FROM coin_transfers t
    JOIN users su ON su.id = t.sender_id
    JOIN users ru ON ru.id = t.recipient_id
    WHERE t.sender_id = ${user.id} OR t.recipient_id = ${user.id}
    ORDER BY t.created_at DESC
    LIMIT 50
  `);
  const rawRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;

  const transfers = rawRows.map((r) => ({
    id: String(r.id),
    type: String(r.sender_id) === user.id ? 'sent' : 'received',
    amount: String(r.amount),
    fee: String(r.fee),
    currency: String(r.currency) as 'coin' | 'axm',
    message: r.message ? String(r.message) : null,
    counterparty: {
      address: String(r.sender_id) === user.id ? String(r.recipient_address) : String(r.sender_address),
      nickname: String(r.sender_id) === user.id
        ? (r.recipient_nickname ? String(r.recipient_nickname) : null)
        : (r.sender_nickname ? String(r.sender_nickname) : null),
    },
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  return c.json({ data: transfers });
});

// ─── Online Count ──────────────────────────────────────────

socialRouter.get('/online-count', async (c) => {
  return c.json({ data: { count: wsService.getOnlineAddresses().length } });
});
