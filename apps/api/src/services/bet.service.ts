import { eq, desc, and, sql, lt, gt, isNull, inArray } from 'drizzle-orm';
import { bets, users } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export type BetRow = typeof bets.$inferSelect;

/** Valid bet status transitions */
const VALID_TRANSITIONS: Record<string, string[]> = {
  open:             ['accepting', 'canceling', 'canceled'],
  accepting:        ['accepted', 'open'],    // accepted on success, open on revert
  canceling:        ['canceled', 'open'],     // canceled on success, open on revert
  accepted:         ['revealed', 'timeout_claimed'],
  revealed:         [],                       // terminal
  canceled:         [],                       // terminal
  timeout_claimed:  [],                       // terminal
};

function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return true; // Unknown status — allow (for chain sync)
  return allowed.includes(to);
}

export class BetService {
  private db = getDb();

  async createBet(params: {
    betId: bigint;
    makerUserId: string;
    amount: string;
    commitment: string;
    txhashCreate: string;
    makerSide?: string;
    makerSecret?: string;
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
        makerSide: params.makerSide ?? null,
        makerSecret: params.makerSecret ?? null,
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
    const result = await this.db
      .update(bets)
      .set({
        status: 'accepted',
        acceptorUserId: params.acceptorUserId,
        acceptorGuess: params.acceptorGuess,
        acceptedTime: new Date(),
        txhashAccept: params.txhashAccept,
      })
      .where(and(eq(bets.betId, params.betId), eq(bets.status, 'accepting')))
      .returning();

    if (result.length === 0) {
      logger.warn({ betId: params.betId.toString() }, 'acceptBet: no rows updated — bet not in accepting state');
      return null;
    }
    return result[0]!;
  }

  async resolveBet(params: {
    betId: bigint;
    winnerUserId: string;
    commissionAmount: string;
    payoutAmount: string;
    txhashResolve: string;
    status: 'revealed' | 'timeout_claimed';
  }) {
    const result = await this.db
      .update(bets)
      .set({
        status: params.status,
        winnerUserId: params.winnerUserId,
        commissionAmount: params.commissionAmount,
        payoutAmount: params.payoutAmount,
        resolvedTime: new Date(),
        txhashResolve: params.txhashResolve,
      })
      .where(and(eq(bets.betId, params.betId), inArray(bets.status, ['accepted', 'accepting'])))
      .returning();

    if (result.length === 0) {
      logger.warn({ betId: params.betId.toString(), targetStatus: params.status }, 'resolveBet: no rows updated — bet not in accepted/accepting state');
      return null;
    }
    return result[0]!;
  }

  async cancelBet(betId: bigint, txhash?: string) {
    const result = await this.db
      .update(bets)
      .set({
        status: 'canceled',
        txhashResolve: txhash,
        resolvedTime: new Date(),
      })
      .where(and(eq(bets.betId, betId), inArray(bets.status, ['open', 'canceling'])))
      .returning();

    if (result.length === 0) {
      logger.warn({ betId: betId.toString() }, 'cancelBet: no rows updated — bet not in open/canceling state');
      return null;
    }
    return result[0]!;
  }

  /**
   * Atomically mark a bet as "accepting" — ONLY succeeds if status is currently "open".
   * Uses WHERE status = 'open' to prevent double-accept race condition.
   * Returns the updated bet, or null if another player already claimed it.
   */
  async markAccepting(params: {
    betId: bigint;
    acceptorUserId: string;
    acceptorGuess: string;
  }) {
    const result = await this.db
      .update(bets)
      .set({
        status: 'accepting',
        acceptorUserId: params.acceptorUserId,
        acceptorGuess: params.acceptorGuess,
      })
      .where(
        and(
          eq(bets.betId, params.betId),
          eq(bets.status, 'open'),
        ),
      )
      .returning();

    if (result.length === 0) {
      logger.warn({ betId: params.betId.toString(), acceptor: params.acceptorUserId }, 'markAccepting failed — bet no longer open (race condition)');
      return null;
    }

    logger.info({ betId: params.betId.toString(), acceptor: params.acceptorUserId }, 'Bet marked as accepting');
    return result[0]!;
  }

  /**
   * Revert a bet from "accepting" back to "open" — clears acceptor fields.
   * Called when the chain tx fails.
   */
  async revertAccepting(betId: bigint) {
    const result = await this.db
      .update(bets)
      .set({
        status: 'open',
        acceptorUserId: null,
        acceptorGuess: null,
        resolvedTime: null,
      })
      .where(and(eq(bets.betId, betId), eq(bets.status, 'accepting')))
      .returning();

    if (result.length === 0) {
      logger.warn({ betId: betId.toString() }, 'revertAccepting: no rows updated — bet not in accepting state (may have been resolved)');
      return null;
    }
    logger.info({ betId: betId.toString() }, 'Bet reverted from accepting to open');
    return result[0]!;
  }

  /**
   * Update bet status. Validates allowed transitions to prevent invalid state changes.
   * Chain sync can bypass validation via `force` parameter.
   */
  async updateBetStatus(betId: bigint, status: string, force = false) {
    if (!force) {
      const current = await this.getBetById(betId);
      if (current && !isValidTransition(current.status, status)) {
        logger.warn({ betId: betId.toString(), from: current.status, to: status }, 'Invalid status transition blocked');
        return current; // Return unchanged
      }
    }

    const [bet] = await this.db
      .update(bets)
      .set({
        status,
        resolvedTime: new Date(),
      })
      .where(eq(bets.betId, betId))
      .returning();

    logger.info({ betId: betId.toString(), status }, 'Bet status synced from chain');
    return bet;
  }

  /**
   * Atomically mark a bet as "canceling" ONLY if its current status is "open".
   * Returns the updated bet, or null if the bet was no longer open (race condition).
   */
  async markCanceling(betId: bigint): Promise<BetRow | null> {
    const result = await this.db
      .update(bets)
      .set({ status: 'canceling' })
      .where(and(eq(bets.betId, betId), eq(bets.status, 'open')))
      .returning();

    if (result.length === 0) return null;
    logger.info({ betId: betId.toString() }, 'Bet marked as canceling (atomic)');
    return result[0]!;
  }

  async getBetById(betId: bigint) {
    return this.db.query.bets.findFirst({
      where: eq(bets.betId, betId),
    });
  }

  async getOpenBets(params: { cursor?: string; limit: number; minAmount?: string; maxAmount?: string; status?: string }) {
    const limit = Math.min(params.limit, 100);
    const statusFilter = params.status ?? 'open';

    let query = this.db
      .select()
      .from(bets)
      .where(
        and(
          eq(bets.status, statusFilter),
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

  async getMyActiveBets(userId: string): Promise<BetRow[]> {
    return this.db
      .select()
      .from(bets)
      .where(
        and(
          sql`(${bets.makerUserId} = ${userId} OR ${bets.acceptorUserId} = ${userId})`,
          sql`(
            ${bets.status} IN ('open', 'accepting', 'accepted', 'canceling')
            OR (${bets.status} IN ('revealed', 'timeout_claimed', 'canceled') AND ${bets.resolvedTime} > NOW() - INTERVAL '5 minutes')
          )`,
        ),
      )
      .orderBy(desc(bets.createdTime))
      .limit(100);
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

  /**
   * Count bets that are effectively "open" on chain for this user.
   * Includes: 'open' (definitely on chain), 'canceling' (cancel tx not confirmed yet — still open on chain).
   */
  async getOpenBetCountForUser(userId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(bets)
      .where(and(eq(bets.makerUserId, userId), inArray(bets.status, ['open', 'canceling'])));

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

  /** Get user address by userId */
  async getUserAddress(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ address: users.address })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.address ?? null;
  }

  async getAcceptedBetsWithSecrets(limit = 200): Promise<BetRow[]> {
    return this.db
      .select()
      .from(bets)
      .where(
        and(
          eq(bets.status, 'accepted'),
          sql`${bets.makerSecret} IS NOT NULL`,
          sql`${bets.makerSide} IS NOT NULL`,
        ),
      )
      .limit(limit);
  }

  async getTimedOutAcceptedBets(limit = 200): Promise<BetRow[]> {
    return this.db
      .select()
      .from(bets)
      .where(
        and(
          eq(bets.status, 'accepted'),
          sql`(
            (${bets.acceptedTime} IS NOT NULL AND ${bets.acceptedTime} < NOW() - INTERVAL '5 minutes')
            OR
            (${bets.acceptedTime} IS NULL AND ${bets.createdTime} < NOW() - INTERVAL '10 minutes')
          )`,
        ),
      )
      .limit(limit);
  }

  async getExpiredOpenBets(limit = 200): Promise<BetRow[]> {
    return this.db
      .select()
      .from(bets)
      .where(
        and(
          inArray(bets.status, ['open', 'canceling']),
          sql`${bets.createdTime} < NOW() - INTERVAL '3 hours'`,
        ),
      )
      .limit(limit);
  }

  /** Get bets stuck in transitional states for too long (for recovery sweep) */
  async getStuckTransitionalBets(limit = 100): Promise<BetRow[]> {
    return this.db
      .select()
      .from(bets)
      .where(
        and(
          inArray(bets.status, ['accepting', 'canceling']),
          sql`${bets.createdTime} < NOW() - INTERVAL '2 minutes'`,
        ),
      )
      .limit(limit);
  }

  /** Build a map of userId -> { address, nickname } for a list of bets */
  async buildAddressMap(betRows: BetRow[]): Promise<Map<string, { address: string; nickname: string | null }>> {
    const userIds = new Set<string>();
    for (const bet of betRows) {
      userIds.add(bet.makerUserId);
      if (bet.acceptorUserId) userIds.add(bet.acceptorUserId);
      if (bet.winnerUserId) userIds.add(bet.winnerUserId);
    }

    if (userIds.size === 0) return new Map();

    const userRows = await this.db
      .select({ id: users.id, address: users.address, nickname: users.profileNickname })
      .from(users)
      .where(inArray(users.id, [...userIds]));

    const map = new Map<string, { address: string; nickname: string | null }>();
    for (const u of userRows) {
      map.set(u.id, { address: u.address, nickname: u.nickname });
    }
    return map;
  }
}

export const betService = new BetService();
