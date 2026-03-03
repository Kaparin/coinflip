import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { BetMessageRequestSchema } from '@coinflip/shared/schemas';
import { authMiddleware } from '../middleware/auth.js';
import { betMessagesService } from '../services/bet-messages.service.js';
import { wsService } from '../services/ws.service.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { AppEnv } from '../types.js';

export const betMessagesRouter = new Hono<AppEnv>();

/** POST /api/v1/bets/:betId/messages — Send a duel chat message (auth required) */
betMessagesRouter.post('/:betId/messages', authMiddleware, zValidator('json', BetMessageRequestSchema), async (c) => {
  const user = c.get('user');
  const raw = c.req.param('betId');
  if (!/^\d+$/.test(raw)) throw new AppError('BET_NOT_FOUND', 'Bet not found', 404);
  const betId = BigInt(raw);
  const { message } = c.req.valid('json');

  try {
    const row = await betMessagesService.sendMessage({
      betId,
      userId: user.id,
      message,
    });

    // Broadcast to all clients watching
    wsService.emitBetMessage({
      bet_id: betId.toString(),
      id: row.id,
      user_id: user.id,
      address: user.address,
      nickname: user.profileNickname ?? undefined,
      message: row.message,
      created_at: row.createdAt.toISOString(),
    });

    return c.json({ data: row });
  } catch (err) {
    // Re-throw known AppErrors (rate limit, not found, etc.)
    if (err instanceof AppError) throw err;
    logger.error({ err, betId: betId.toString(), userId: user.id }, 'Failed to send bet message');
    throw new AppError('INTERNAL_ERROR', 'Failed to send message', 500);
  }
});

/** GET /api/v1/bets/:betId/messages — Get duel chat messages (public) */
betMessagesRouter.get('/:betId/messages', async (c) => {
  const raw = c.req.param('betId');
  if (!/^\d+$/.test(raw)) throw new AppError('BET_NOT_FOUND', 'Bet not found', 404);
  const betId = BigInt(raw);

  try {
    const messages = await betMessagesService.getMessages(betId);

    return c.json({
      data: messages.map((m) => ({
        id: m.id,
        bet_id: m.betId.toString(),
        user_id: m.userId,
        address: m.address,
        nickname: m.nickname ?? undefined,
        message: m.message,
        created_at: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err, betId: betId.toString() }, 'Failed to fetch bet messages');
    throw new AppError('INTERNAL_ERROR', 'Failed to fetch messages', 500);
  }
});
