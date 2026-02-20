import { getDb } from '../lib/db.js';
import { events, eventParticipants, bets, users } from '@coinflip/db/schema';
import { eq, and, sql, inArray, desc, asc, lt, lte, gte, or, count as countFn } from 'drizzle-orm';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { vaultService } from './vault.service.js';
import { wsService } from './ws.service.js';
import { LEADERBOARD_CACHE_TTL_MS, EMPTY_EVENT_ARCHIVE_GRACE_MS, EVENT_AUTO_APPROVE_GRACE_MS } from '@coinflip/shared/constants';
import type { ContestMetric } from '@coinflip/shared/types';
import crypto from 'node:crypto';

// ---- Leaderboard cache ----

interface CacheEntry {
  data: unknown[];
  total: number;
  ts: number;
}

const leaderboardCache = new Map<string, CacheEntry>();

function getCacheKey(eventId: string, limit: number, offset: number): string {
  return `${eventId}:${limit}:${offset}`;
}

// ---- Types ----

interface ContestConfig {
  metric: ContestMetric;
  minBetAmount?: string;
  autoJoin: boolean;
}

interface RaffleConfig {
  minBets?: number;
  minTurnover?: string;
  maxParticipants?: number;
}

interface PrizeEntry {
  place: number;
  amount: string;
  label?: string;
}

interface CreateEventParams {
  type: 'contest' | 'raffle';
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  config: ContestConfig | RaffleConfig;
  prizes: PrizeEntry[];
  totalPrizePool: string;
  createdBy: string;
}

interface UpdateEventParams {
  title?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  config?: ContestConfig | RaffleConfig;
  prizes?: PrizeEntry[];
  totalPrizePool?: string;
}

// ---- Service ----

class EventsService {
  // ─── CRUD ──────────────────────────────────────────────

  async createEvent(params: CreateEventParams) {
    const db = getDb();
    const [event] = await db
      .insert(events)
      .values({
        type: params.type,
        title: params.title,
        description: params.description,
        startsAt: new Date(params.startsAt),
        endsAt: new Date(params.endsAt),
        config: params.config,
        prizes: params.prizes,
        totalPrizePool: params.totalPrizePool,
        createdBy: params.createdBy,
      })
      .returning();
    return event;
  }

  async updateEvent(eventId: string, params: UpdateEventParams) {
    const db = getDb();
    const event = await this.getEventById(eventId);
    if (!event) return null;

    if (event.status === 'active') {
      // Active events: limited editing only
      if (params.startsAt) {
        throw new AppError('CANNOT_CHANGE_START', 'Cannot change start date of an active event', 400);
      }
      if (params.config) {
        throw new AppError('CANNOT_CHANGE_CONFIG', 'Cannot change config of an active event', 400);
      }
      if (params.endsAt && new Date(params.endsAt) < event.endsAt) {
        throw new AppError('CANNOT_SHORTEN', 'Can only extend event duration, not shorten it', 400);
      }
      if (params.totalPrizePool && BigInt(params.totalPrizePool) < BigInt(event.totalPrizePool ?? '0')) {
        throw new AppError('CANNOT_REDUCE_POOL', 'Can only increase prize pool, not reduce it', 400);
      }
    } else if (event.status !== 'draft') {
      throw new AppError('INVALID_STATE', `Cannot edit event in ${event.status} status`, 400);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (params.title !== undefined) updates.title = params.title;
    if (params.description !== undefined) updates.description = params.description;
    if (params.startsAt !== undefined) updates.startsAt = new Date(params.startsAt);
    if (params.endsAt !== undefined) updates.endsAt = new Date(params.endsAt);
    if (params.config !== undefined) updates.config = params.config;
    if (params.prizes !== undefined) updates.prizes = params.prizes;
    if (params.totalPrizePool !== undefined) updates.totalPrizePool = params.totalPrizePool;

    const [updated] = await db
      .update(events)
      .set(updates)
      .where(eq(events.id, eventId))
      .returning();
    return updated ?? null;
  }

  async deleteEvent(eventId: string) {
    const db = getDb();
    const [event] = await db
      .delete(events)
      .where(and(eq(events.id, eventId), eq(events.status, 'draft')))
      .returning();
    return event ?? null;
  }

  async setStatus(eventId: string, status: string, extra?: Record<string, unknown>) {
    const db = getDb();
    const updates: Record<string, unknown> = { status, updatedAt: new Date(), ...extra };
    const [event] = await db
      .update(events)
      .set(updates)
      .where(eq(events.id, eventId))
      .returning();
    return event ?? null;
  }

  // ─── Queries ───────────────────────────────────────────

  async getEventById(eventId: string) {
    const db = getDb();
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    return event ?? null;
  }

  async getActiveEvents() {
    const db = getDb();
    const now = new Date();
    return db
      .select()
      .from(events)
      .where(
        or(
          eq(events.status, 'active'),
          and(eq(events.status, 'draft'), gte(events.startsAt, now)),
        ),
      )
      .orderBy(asc(events.startsAt));
  }

  async getPublicActiveEvents() {
    const db = getDb();
    // Show active events + upcoming drafts (scheduled but not yet started)
    return db
      .select()
      .from(events)
      .where(
        or(
          eq(events.status, 'active'),
          and(eq(events.status, 'draft'), gte(events.startsAt, new Date())),
        ),
      )
      .orderBy(asc(events.endsAt));
  }

  async getCompletedEvents(limit = 20, offset = 0) {
    const db = getDb();
    return db
      .select()
      .from(events)
      .where(inArray(events.status, ['completed', 'calculating']))
      .orderBy(desc(events.endsAt))
      .limit(limit)
      .offset(offset);
  }

  async getAllEvents(statusFilter?: string) {
    const db = getDb();
    const where = statusFilter ? eq(events.status, statusFilter) : undefined;
    return db
      .select()
      .from(events)
      .where(where)
      .orderBy(desc(events.createdAt));
  }

  async getParticipantCount(eventId: string): Promise<number> {
    const db = getDb();
    const [row] = await db
      .select({ count: countFn() })
      .from(eventParticipants)
      .where(eq(eventParticipants.eventId, eventId));
    return Number(row?.count ?? 0);
  }

  // ─── Participation ─────────────────────────────────────

  async hasUserJoined(eventId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const [row] = await db
      .select({ id: eventParticipants.id })
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          eq(eventParticipants.userId, userId),
        ),
      )
      .limit(1);
    return !!row;
  }

  async joinEvent(eventId: string, userId: string) {
    const db = getDb();

    // Check event exists and is active (or upcoming draft)
    const event = await this.getEventById(eventId);
    if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found', 404);
    const isUpcomingDraft = event.status === 'draft' && event.startsAt > new Date();
    if (event.status !== 'active' && !isUpcomingDraft) {
      throw new AppError('EVENT_NOT_ACTIVE', 'Event is not currently active', 400);
    }

    // Reject joins after event has ended
    if (new Date() > event.endsAt) {
      throw new AppError('EVENT_ENDED', 'This event has already ended', 400);
    }

    // Check maxParticipants for raffles
    if (event.type === 'raffle') {
      const config = event.config as RaffleConfig;
      if (config.maxParticipants) {
        const count = await this.getParticipantCount(eventId);
        if (count >= config.maxParticipants) {
          throw new AppError('EVENT_FULL', 'Event has reached maximum participants', 400);
        }
      }
    }

    // Check if contest is opt-in (autoJoin = false)
    if (event.type === 'contest') {
      const config = event.config as ContestConfig;
      if (config.autoJoin) {
        throw new AppError('AUTO_JOIN_EVENT', 'This contest auto-joins all players. No manual join needed.', 400);
      }
    }

    try {
      const [participant] = await db
        .insert(eventParticipants)
        .values({ eventId, userId })
        .returning();
      return participant;
    } catch (err: unknown) {
      // Duplicate entry
      if ((err as { code?: string }).code === '23505') {
        throw new AppError('ALREADY_JOINED', 'Already joined this event', 400);
      }
      throw err;
    }
  }

  async getParticipants(eventId: string, limit = 100, offset = 0) {
    const db = getDb();
    return db
      .select({
        userId: eventParticipants.userId,
        address: users.address,
        nickname: users.profileNickname,
        status: eventParticipants.status,
        joinedAt: eventParticipants.joinedAt,
        finalRank: eventParticipants.finalRank,
        prizeAmount: eventParticipants.prizeAmount,
      })
      .from(eventParticipants)
      .innerJoin(users, eq(users.id, eventParticipants.userId))
      .where(eq(eventParticipants.eventId, eventId))
      .orderBy(asc(eventParticipants.joinedAt))
      .limit(limit)
      .offset(offset);
  }

  // ─── Contest Leaderboard ───────────────────────────────

  async getContestLeaderboard(
    eventId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ data: unknown[]; total: number }> {
    // Check cache
    const cacheKey = getCacheKey(eventId, limit, offset);
    const cached = leaderboardCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < LEADERBOARD_CACHE_TTL_MS) {
      return { data: cached.data, total: cached.total };
    }

    const event = await this.getEventById(eventId);
    if (!event || event.type !== 'contest') {
      return { data: [], total: 0 };
    }

    const config = event.config as ContestConfig;
    const metric = config.metric;
    const startsAt = event.startsAt;
    const endsAt = event.endsAt;

    const db = getDb();

    // Build ORDER BY based on metric
    // IMPORTANT: use raw aggregate expressions, not text aliases — text aliases sort lexicographically ("9" > "10")
    const metricOrderSql =
      metric === 'turnover' ? sql`SUM(pb.amount) DESC` :
      metric === 'wins' ? sql`SUM(CASE WHEN pb.winner_user_id = pb.user_id THEN 1 ELSE 0 END) DESC` :
      sql`(SUM(CASE WHEN pb.winner_user_id = pb.user_id THEN pb.payout ELSE 0 END) - SUM(pb.amount)) DESC`;

    // Build participant filter for opt-in contests
    const participantFilter = config.autoJoin
      ? sql`TRUE`
      : sql`pb.user_id IN (SELECT ep.user_id FROM event_participants ep WHERE ep.event_id = ${eventId})`;

    // Min bet filter
    const minBetFilter = config.minBetAmount
      ? sql`b.amount::numeric >= ${config.minBetAmount}::numeric`
      : sql`TRUE`;

    const rows = await db.execute(sql`
      WITH player_bets AS (
        SELECT b.maker_user_id AS user_id, b.amount::numeric AS amount, b.winner_user_id,
               COALESCE(b.payout_amount, '0')::numeric AS payout
        FROM bets b
        WHERE b.status IN ('revealed', 'timeout_claimed')
          AND b.resolved_time >= ${startsAt}
          AND b.resolved_time <= ${endsAt}
          AND ${minBetFilter}
        UNION ALL
        SELECT b.acceptor_user_id AS user_id, b.amount::numeric AS amount, b.winner_user_id,
               COALESCE(b.payout_amount, '0')::numeric AS payout
        FROM bets b
        WHERE b.status IN ('revealed', 'timeout_claimed')
          AND b.resolved_time >= ${startsAt}
          AND b.resolved_time <= ${endsAt}
          AND b.acceptor_user_id IS NOT NULL
          AND ${minBetFilter}
      )
      SELECT pb.user_id, u.address, u.profile_nickname AS nickname,
             SUM(pb.amount)::text AS turnover,
             SUM(CASE WHEN pb.winner_user_id = pb.user_id THEN 1 ELSE 0 END)::int AS wins,
             (SUM(CASE WHEN pb.winner_user_id = pb.user_id THEN pb.payout ELSE 0 END) - SUM(pb.amount))::text AS profit,
             COUNT(*)::int AS games,
             ROW_NUMBER() OVER (ORDER BY ${metricOrderSql}) AS rank
      FROM player_bets pb
      JOIN users u ON u.id = pb.user_id
      WHERE ${participantFilter}
      GROUP BY pb.user_id, u.address, u.profile_nickname
      ORDER BY ${metricOrderSql}
      LIMIT ${limit} OFFSET ${offset}
    `);

    // Get total count
    const [totalRow] = await db.execute(sql`
      WITH player_bets AS (
        SELECT b.maker_user_id AS user_id
        FROM bets b
        WHERE b.status IN ('revealed', 'timeout_claimed')
          AND b.resolved_time >= ${startsAt}
          AND b.resolved_time <= ${endsAt}
          AND ${minBetFilter}
        UNION ALL
        SELECT b.acceptor_user_id AS user_id
        FROM bets b
        WHERE b.status IN ('revealed', 'timeout_claimed')
          AND b.resolved_time >= ${startsAt}
          AND b.resolved_time <= ${endsAt}
          AND b.acceptor_user_id IS NOT NULL
          AND ${minBetFilter}
      )
      SELECT COUNT(DISTINCT pb.user_id)::int AS total
      FROM player_bets pb
      WHERE ${participantFilter}
    `) as unknown as [{ total: number }];

    const data = rows as unknown as unknown[];
    const total = Number(totalRow?.total ?? 0);

    // Cache result
    leaderboardCache.set(cacheKey, { data, total, ts: Date.now() });

    return { data, total };
  }

  async getUserRank(eventId: string, userId: string): Promise<number | null> {
    const event = await this.getEventById(eventId);
    if (!event || event.type !== 'contest') return null;

    const config = event.config as ContestConfig;
    const metric = config.metric;

    // Use raw aggregate expressions — text aliases sort lexicographically
    const metricOrderSql =
      metric === 'turnover' ? sql`SUM(pb.amount) DESC` :
      metric === 'wins' ? sql`SUM(CASE WHEN pb.winner_user_id = pb.user_id THEN 1 ELSE 0 END) DESC` :
      sql`(SUM(CASE WHEN pb.winner_user_id = pb.user_id THEN pb.payout ELSE 0 END) - SUM(pb.amount)) DESC`;

    const participantFilter = config.autoJoin
      ? sql`TRUE`
      : sql`pb.user_id IN (SELECT ep.user_id FROM event_participants ep WHERE ep.event_id = ${eventId})`;

    const minBetFilter = config.minBetAmount
      ? sql`b.amount::numeric >= ${config.minBetAmount}::numeric`
      : sql`TRUE`;

    const db = getDb();
    const rows = await db.execute(sql`
      WITH player_bets AS (
        SELECT b.maker_user_id AS user_id, b.amount::numeric AS amount, b.winner_user_id,
               COALESCE(b.payout_amount, '0')::numeric AS payout
        FROM bets b
        WHERE b.status IN ('revealed', 'timeout_claimed')
          AND b.resolved_time >= ${event.startsAt}
          AND b.resolved_time <= ${event.endsAt}
          AND ${minBetFilter}
        UNION ALL
        SELECT b.acceptor_user_id AS user_id, b.amount::numeric AS amount, b.winner_user_id,
               COALESCE(b.payout_amount, '0')::numeric AS payout
        FROM bets b
        WHERE b.status IN ('revealed', 'timeout_claimed')
          AND b.resolved_time >= ${event.startsAt}
          AND b.resolved_time <= ${event.endsAt}
          AND b.acceptor_user_id IS NOT NULL
          AND ${minBetFilter}
      ),
      ranked AS (
        SELECT pb.user_id,
               ROW_NUMBER() OVER (ORDER BY ${metricOrderSql}) AS rank
        FROM player_bets pb
        WHERE ${participantFilter}
        GROUP BY pb.user_id
      )
      SELECT rank FROM ranked WHERE user_id = ${userId}
    `) as unknown as Array<{ rank: number }>;

    return rows[0]?.rank ?? null;
  }

  // ─── Contest Finalization ──────────────────────────────

  async calculateContestResults(eventId: string, force = false) {
    const event = await this.getEventById(eventId);
    if (!event || event.type !== 'contest') return null;

    // If force=true, clear old results before recalculating
    if (force) {
      await this.setStatus(eventId, 'calculating', { results: null });
      logger.info({ eventId }, 'Force recalculate: cleared previous contest results');
    }

    // Idempotent: if results already calculated, return them
    if (!force && event.results && Array.isArray(event.results) && (event.results as unknown[]).length > 0) {
      logger.info({ eventId }, 'Contest results already calculated, returning existing');
      return event.results as Array<{ rank: number; userId: string; address: string; prizeAmount: string }>;
    }

    // Clear leaderboard cache to get fresh data for final calculation
    for (const [key] of leaderboardCache) {
      if (key.startsWith(`${eventId}:`)) leaderboardCache.delete(key);
    }

    const { data: leaderboard } = await this.getContestLeaderboard(eventId, 1000, 0);
    const prizes = event.prizes as PrizeEntry[];

    const db = getDb();
    const results: Array<{ rank: number; userId: string; address: string; prizeAmount: string }> = [];

    for (const prize of prizes) {
      const entry = leaderboard[prize.place - 1] as { user_id: string; address: string; rank: number } | undefined;
      if (!entry) continue;

      results.push({
        rank: prize.place,
        userId: entry.user_id,
        address: entry.address,
        prizeAmount: prize.amount,
      });

      // Upsert participant record
      await db
        .insert(eventParticipants)
        .values({
          eventId,
          userId: entry.user_id,
          status: 'winner',
          finalRank: prize.place,
          prizeAmount: prize.amount,
          finalMetric: String((entry as unknown as Record<string, string>).turnover ?? '0'),
        })
        .onConflictDoUpdate({
          target: [eventParticipants.eventId, eventParticipants.userId],
          set: {
            status: 'winner',
            finalRank: prize.place,
            prizeAmount: prize.amount,
            finalMetric: String((entry as unknown as Record<string, string>).turnover ?? '0'),
          },
        });
    }

    // Save results to event
    await this.setStatus(eventId, 'calculating', { results });

    return results;
  }

  // ─── Raffle Draw ───────────────────────────────────────

  async drawRaffleWinners(eventId: string, force = false) {
    const event = await this.getEventById(eventId);
    if (!event || event.type !== 'raffle') return null;
    if (event.status !== 'calculating') {
      throw new AppError('INVALID_STATE', 'Event must be in calculating state to draw', 400);
    }

    // If force=true, reset previous draw results
    if (force) {
      const db = getDb();
      await db
        .update(eventParticipants)
        .set({ status: 'joined', finalRank: null, prizeAmount: null })
        .where(
          and(
            eq(eventParticipants.eventId, eventId),
            inArray(eventParticipants.status, ['winner', 'not_selected']),
          ),
        );
      await this.setStatus(eventId, 'calculating', { results: null, raffleSeed: null });
      logger.info({ eventId }, 'Force redraw: cleared previous raffle results');
    }

    // Idempotent: if raffle already drawn (seed exists), return existing results
    if (!force && event.raffleSeed && event.results && Array.isArray(event.results) && (event.results as unknown[]).length > 0) {
      logger.info({ eventId }, 'Raffle already drawn, returning existing results');
      return {
        results: event.results as Array<{ rank: number; userId: string; prizeAmount: string }>,
        seed: event.raffleSeed,
      };
    }

    const db = getDb();
    const participants = await db
      .select({ userId: eventParticipants.userId })
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          eq(eventParticipants.status, 'joined'),
        ),
      );

    if (participants.length === 0) {
      await this.setStatus(eventId, 'calculating', { results: [], raffleSeed: null });
      logger.info({ eventId }, 'Raffle has 0 participants, marked as empty');
      return { results: [], seed: null };
    }

    const prizes = event.prizes as PrizeEntry[];
    const seed = crypto.randomBytes(32).toString('hex');

    // Fisher-Yates shuffle with seeded randomness
    const indices = participants.map((_, i) => i);
    const seedBuffer = Buffer.from(seed, 'hex');
    for (let i = indices.length - 1; i > 0; i--) {
      // Derive deterministic random from seed + position
      const hash = crypto.createHash('sha256').update(Buffer.concat([seedBuffer, Buffer.from([i])])).digest();
      const j = hash.readUInt32BE(0) % (i + 1);
      [indices[i], indices[j]] = [indices[j]!, indices[i]!];
    }

    const results: Array<{ rank: number; userId: string; prizeAmount: string }> = [];

    for (const prize of prizes) {
      const winnerIdx = indices[prize.place - 1];
      if (winnerIdx === undefined) continue;
      const winner = participants[winnerIdx];
      if (!winner) continue;

      results.push({
        rank: prize.place,
        userId: winner.userId,
        prizeAmount: prize.amount,
      });

      await db
        .update(eventParticipants)
        .set({
          status: 'winner',
          finalRank: prize.place,
          prizeAmount: prize.amount,
        })
        .where(
          and(
            eq(eventParticipants.eventId, eventId),
            eq(eventParticipants.userId, winner.userId),
          ),
        );
    }

    // Mark non-winners
    await db
      .update(eventParticipants)
      .set({ status: 'not_selected' })
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          eq(eventParticipants.status, 'joined'),
        ),
      );

    // Save seed and results
    await this.setStatus(eventId, 'calculating', { results, raffleSeed: seed });

    return { results, seed };
  }

  // ─── Prize Distribution ────────────────────────────────

  async getWinnersForDistribution(eventId: string) {
    const db = getDb();
    return db
      .select({
        userId: eventParticipants.userId,
        address: users.address,
        prizeAmount: eventParticipants.prizeAmount,
        prizeTxHash: eventParticipants.prizeTxHash,
        finalRank: eventParticipants.finalRank,
      })
      .from(eventParticipants)
      .innerJoin(users, eq(users.id, eventParticipants.userId))
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          eq(eventParticipants.status, 'winner'),
        ),
      )
      .orderBy(asc(eventParticipants.finalRank));
  }

  async markPrizeDistributed(eventId: string, userId: string, txHash: string) {
    const db = getDb();
    await db
      .update(eventParticipants)
      .set({ prizeTxHash: txHash })
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          eq(eventParticipants.userId, userId),
        ),
      );
  }

  async distributePrize(eventId: string, userId: string): Promise<void> {
    const winners = await this.getWinnersForDistribution(eventId);
    const winner = winners.find((w) => w.userId === userId);
    if (!winner) throw new AppError('WINNER_NOT_FOUND', 'Winner not found for this event', 404);
    if (winner.prizeTxHash) throw new AppError('ALREADY_DISTRIBUTED', 'Prize already distributed', 400);
    if (!winner.prizeAmount) throw new AppError('NO_PRIZE', 'No prize amount set', 400);

    await vaultService.creditWinner(userId, winner.prizeAmount);
    await this.markPrizeDistributed(eventId, userId, 'vault_credit');
    logger.info({ eventId, userId, amount: winner.prizeAmount }, 'Prize distributed via vault credit');
  }

  async distributeAllPrizes(eventId: string): Promise<{ distributed: number; failed: number }> {
    const winners = await this.getWinnersForDistribution(eventId);
    const undistributed = winners.filter((w) => !w.prizeTxHash && w.prizeAmount);

    let distributed = 0;
    let failed = 0;

    for (const winner of undistributed) {
      try {
        await this.distributePrize(eventId, winner.userId);
        distributed++;
      } catch (err) {
        logger.error({ err, eventId, userId: winner.userId }, 'Failed to distribute prize');
        failed++;
      }
    }

    return { distributed, failed };
  }

  // ─── Cancel Event ─────────────────────────────────────

  async cancelEvent(eventId: string) {
    const db = getDb();
    const event = await this.getEventById(eventId);
    if (!event) return null;
    if (!['draft', 'active'].includes(event.status)) {
      throw new AppError('INVALID_STATE', `Cannot cancel event in ${event.status} status`, 400);
    }

    // If active, delete participants first (refund not needed — no funds locked for events)
    if (event.status === 'active') {
      await db
        .delete(eventParticipants)
        .where(eq(eventParticipants.eventId, eventId));
    }

    const [deleted] = await db
      .delete(events)
      .where(eq(events.id, eventId))
      .returning();

    if (deleted) {
      wsService.broadcast({
        type: 'event_canceled',
        data: { eventId, title: event.title, type: event.type },
      });
      logger.info({ eventId, title: event.title, status: event.status }, 'Event canceled and deleted');
    }

    return deleted ?? null;
  }

  // ─── Event Lifecycle (background) ─────────────────────

  async checkEventLifecycle() {
    const db = getDb();
    const now = new Date();

    // 0. Delete stale drafts — both startsAt and endsAt in the past (never activated, no participants)
    const staleDrafts = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.status, 'draft'),
          lt(events.startsAt, now),
          lt(events.endsAt, now),
        ),
      );

    for (const event of staleDrafts) {
      try {
        await db.delete(events).where(eq(events.id, event.id));
        logger.info({ eventId: event.id, title: event.title }, 'Stale draft event deleted (both dates in the past)');
      } catch (err) {
        logger.error({ err, eventId: event.id }, 'Failed to delete stale draft event');
      }
    }

    // 1. Auto-activate draft events whose startsAt has passed (but endsAt still in the future)
    const draftsToActivate = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.status, 'draft'),
          lte(events.startsAt, now),
          gte(events.endsAt, now),
        ),
      );

    for (const event of draftsToActivate) {
      try {
        await this.setStatus(event.id, 'active');
        wsService.broadcast({
          type: 'event_started',
          data: { eventId: event.id, title: event.title, type: event.type },
        });
        logger.info({ eventId: event.id, type: event.type, title: event.title }, 'Event auto-activated (startsAt reached)');
      } catch (err) {
        logger.error({ err, eventId: event.id }, 'Event auto-activation failed');
      }
    }

    // 2. Find active events that have ended → transition to calculating
    const endedEvents = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.status, 'active'),
          lt(events.endsAt, now),
        ),
      );

    for (const event of endedEvents) {
      try {
        await this.setStatus(event.id, 'calculating');
        wsService.emitEventEnded({ eventId: event.id, title: event.title, type: event.type });
        logger.info({ eventId: event.id, type: event.type, title: event.title }, 'Event ended → calculating');

        // Auto-calculate for contests
        if (event.type === 'contest') {
          await this.calculateContestResults(event.id);
          logger.info({ eventId: event.id }, 'Contest results calculated');
        }
        // Raffles wait for admin to trigger draw
      } catch (err) {
        logger.error({ err, eventId: event.id }, 'Event lifecycle transition failed');
      }
    }

    // 3. Handle stuck calculating events — auto-archive empty, auto-approve with results
    const calculatingEvents = await db
      .select()
      .from(events)
      .where(eq(events.status, 'calculating'));

    for (const event of calculatingEvents) {
      try {
        const msSinceEnd = now.getTime() - event.endsAt.getTime();
        if (msSinceEnd < 0) continue; // endsAt still in the future (shouldn't happen but be safe)

        const participantCount = await this.getParticipantCount(event.id);
        const results = event.results as unknown[] | null;
        const hasResults = Array.isArray(results) && results.length > 0;

        // 3a. Empty events (0 participants, 5+ min past end) → auto-archive
        if (participantCount === 0 && msSinceEnd >= EMPTY_EVENT_ARCHIVE_GRACE_MS) {
          await this.setStatus(event.id, 'archived');
          wsService.broadcast({
            type: 'event_archived',
            data: { eventId: event.id, title: event.title, type: event.type },
          });
          logger.info({ eventId: event.id, title: event.title }, 'Empty calculating event auto-archived');
          continue;
        }

        // 3b. Events with results (10+ min past end) → auto-approve to completed
        if (hasResults && msSinceEnd >= EVENT_AUTO_APPROVE_GRACE_MS) {
          await this.setStatus(event.id, 'completed');
          wsService.broadcast({
            type: 'event_results_published',
            data: { eventId: event.id, title: event.title, type: event.type },
          });
          logger.info({ eventId: event.id, title: event.title }, 'Calculating event auto-approved → completed');
        }
      } catch (err) {
        logger.error({ err, eventId: event.id }, 'Failed to handle stuck calculating event');
      }
    }
  }

  // ─── Format for API Response ──────────────────────────

  async formatEventResponse(event: typeof events.$inferSelect, userId?: string) {
    const participantCount = await this.getParticipantCount(event.id);
    const hasJoined = userId ? await this.hasUserJoined(event.id, userId) : undefined;
    const myRank = userId && event.type === 'contest' && event.status === 'active'
      ? await this.getUserRank(event.id, userId)
      : null;

    return {
      id: event.id,
      type: event.type,
      title: event.title,
      description: event.description,
      status: event.status,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      config: event.config as Record<string, unknown>,
      prizes: event.prizes as PrizeEntry[],
      totalPrizePool: event.totalPrizePool ?? '0',
      results: event.results as Record<string, unknown> | null,
      raffleSeed: event.raffleSeed,
      participantCount,
      hasJoined,
      myRank,
      createdAt: event.createdAt.toISOString(),
    };
  }
}

export const eventsService = new EventsService();
