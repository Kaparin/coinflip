import { eq, desc, and, sql, lt, gt, isNull } from 'drizzle-orm';
import { bets, users } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export type BetRow = typeof bets.$inferSelect;

export class BetService {
  private db = getDb();

  async createBet(params: {
    betId: bigint;
    makerUserId: string;
    amount: string;
    commitment: string;
    txhashCreate: string;
  }) {
    const [bet] = await this.db
      .insert(bets)
      .values({
        betId: params.betId,
        makerUserId: params.makerUserId,
        amount: params.amount,
        status: 'open',
        commitment: params.commitment,
        txhashCreate: params.txhashCreate,
      })
      .returning();

    logger.info({ betId: params.betId.toString(), maker: params.makerUserId }, 'Bet created in DB');
    return bet!;
  }

  async acceptBet(params: {
    betId: bigint;
    acceptorUserId: string;
    acceptorGuess: string;
    txhashAccept: string;
  }) {
    const [bet] = await this.db
      .update(bets)
      .set({
        status: 'accepted',
        acceptorUserId: params.acceptorUserId,
        acceptorGuess: params.acceptorGuess,
        acceptedTime: new Date(),
        txhashAccept: params.txhashAccept,
      })
      .where(eq(bets.betId, params.betId))
      .returning();

    return bet;
  }

  async resolveBet(params: {
    betId: bigint;
    winnerUserId: string;
    commissionAmount: string;
    payoutAmount: string;
    txhashResolve: string;
    status: 'revealed' | 'timeout_claimed';
  }) {
    const [bet] = await this.db
      .update(bets)
      .set({
        status: params.status,
        winnerUserId: params.winnerUserId,
        commissionAmount: params.commissionAmount,
        payoutAmount: params.payoutAmount,
        resolvedTime: new Date(),
        txhashResolve: params.txhashResolve,
      })
      .where(eq(bets.betId, params.betId))
      .returning();

    return bet;
  }

  async cancelBet(betId: bigint, txhash?: string) {
    const [bet] = await this.db
      .update(bets)
      .set({
        status: 'canceled',
        txhashResolve: txhash,
        resolvedTime: new Date(),
      })
      .where(eq(bets.betId, betId))
      .returning();

    return bet;
  }

  async getBetById(betId: bigint) {
    return this.db.query.bets.findFirst({
      where: eq(bets.betId, betId),
    });
  }

  async getOpenBets(params: { cursor?: string; limit: number; minAmount?: string; maxAmount?: string }) {
    const limit = Math.min(params.limit, 100);

    let query = this.db
      .select()
      .from(bets)
      .where(
        and(
          eq(bets.status, 'open'),
          params.cursor ? lt(bets.createdTime, new Date(params.cursor)) : undefined,
          params.minAmount ? sql`${bets.amount}::numeric >= ${params.minAmount}::numeric` : undefined,
          params.maxAmount ? sql`${bets.amount}::numeric <= ${params.maxAmount}::numeric` : undefined,
        ),
      )
      .orderBy(desc(bets.createdTime))
      .limit(limit + 1);

    const rows = await query;

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && data.length > 0
      ? data[data.length - 1]!.createdTime.toISOString()
      : null;

    return { data, cursor: nextCursor, has_more: hasMore };
  }

  async getUserBetHistory(params: { userId: string; cursor?: string; limit: number }) {
    const limit = Math.min(params.limit, 100);

    const rows = await this.db
      .select()
      .from(bets)
      .where(
        and(
          sql`(${bets.makerUserId} = ${params.userId} OR ${bets.acceptorUserId} = ${params.userId})`,
          params.cursor ? lt(bets.createdTime, new Date(params.cursor)) : undefined,
        ),
      )
      .orderBy(desc(bets.createdTime))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && data.length > 0
      ? data[data.length - 1]!.createdTime.toISOString()
      : null;

    return { data, cursor: nextCursor, has_more: hasMore };
  }

  async getOpenBetCountForUser(userId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(bets)
      .where(and(eq(bets.makerUserId, userId), eq(bets.status, 'open')));

    return result[0]?.count ?? 0;
  }

  async getExpiredAcceptedBets(now: Date, timeoutSecs: number) {
    const deadline = new Date(now.getTime() - timeoutSecs * 1000);
    return this.db
      .select()
      .from(bets)
      .where(
        and(
          eq(bets.status, 'accepted'),
          lt(bets.acceptedTime, deadline),
        ),
      );
  }
}

export const betService = new BetService();
