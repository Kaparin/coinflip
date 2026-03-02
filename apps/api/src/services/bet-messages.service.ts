import { eq, and, desc } from 'drizzle-orm';
import { betMessages, bets, users } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { AppError } from '../lib/errors.js';

/** In-memory rate limiter: userId → last message timestamp */
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 3_000;

class BetMessagesService {
  private db = getDb();

  /** Send a message in a bet's duel chat */
  async sendMessage(params: { betId: bigint; userId: string; message: string }) {
    const { betId, userId, message } = params;

    // Rate limit: 1 message per 3 seconds per user
    const now = Date.now();
    const lastSent = rateLimitMap.get(userId) ?? 0;
    if (now - lastSent < RATE_LIMIT_MS) {
      throw new AppError('RATE_LIMITED', 'Wait a few seconds before sending another message', 429);
    }

    // Verify bet exists and is in an active duel state
    const [bet] = await this.db
      .select({ betId: bets.betId, status: bets.status, makerUserId: bets.makerUserId, acceptorUserId: bets.acceptorUserId })
      .from(bets)
      .where(eq(bets.betId, betId))
      .limit(1);

    if (!bet) {
      throw new AppError('BET_NOT_FOUND', 'Bet not found', 404);
    }

    // Only maker and acceptor can send messages
    if (bet.makerUserId !== userId && bet.acceptorUserId !== userId) {
      throw new AppError('NOT_PARTICIPANT', 'Only bet participants can send messages', 403);
    }

    // Only allow messages during active duel states
    const allowedStatuses = ['accepting', 'accepted', 'revealed'];
    if (!allowedStatuses.includes(bet.status)) {
      throw new AppError('BET_NOT_ACTIVE', 'Cannot send messages for this bet', 400);
    }

    // Truncate message to 100 chars
    const trimmed = message.trim().slice(0, 100);
    if (trimmed.length === 0) {
      throw new AppError('EMPTY_MESSAGE', 'Message cannot be empty', 400);
    }

    const [row] = await this.db
      .insert(betMessages)
      .values({
        betId,
        userId,
        message: trimmed,
      })
      .returning();

    // Update rate limit
    rateLimitMap.set(userId, now);

    return row!;
  }

  /** Get messages for a bet (public) */
  async getMessages(betId: bigint, limit = 50) {
    const rows = await this.db
      .select({
        id: betMessages.id,
        betId: betMessages.betId,
        userId: betMessages.userId,
        message: betMessages.message,
        createdAt: betMessages.createdAt,
        address: users.address,
        nickname: users.profileNickname,
      })
      .from(betMessages)
      .innerJoin(users, eq(betMessages.userId, users.id))
      .where(eq(betMessages.betId, betId))
      .orderBy(betMessages.createdAt)
      .limit(limit);

    return rows;
  }
}

export const betMessagesService = new BetMessagesService();
