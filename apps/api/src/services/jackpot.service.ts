/**
 * Jackpot Service — manages 5-tier jackpot pools.
 *
 * Each resolved bet contributes 1% of the pot (split evenly across 5 tiers).
 * When a pool reaches its target, a random winner is drawn from eligible players.
 * Prize is credited to winner's vault bonus balance.
 */

import crypto from 'node:crypto';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { jackpotTiers, jackpotPools, jackpotContributions, users, userNotifications } from '@coinflip/db/schema';
import { JACKPOT_PER_TIER_BPS, VIP_JACKPOT_TIERS } from '@coinflip/shared/constants';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { wsService } from './ws.service.js';
import { vaultService } from './vault.service.js';

class JackpotService {
  /**
   * Process a resolved bet's contribution to all active jackpot pools.
   * Called from the indexer after bet_revealed / bet_timeout_claimed.
   *
   * @param betId - The resolved bet ID
   * @param totalPot - Total pot in micro-LAUNCH (amount * 2)
   */
  async processBetContribution(betId: bigint, totalPot: bigint): Promise<void> {
    const db = getDb();

    try {
      // Get all active (filling) pools with their tier info
      const activePools = await db
        .select({
          poolId: jackpotPools.id,
          tierId: jackpotPools.tierId,
          currentAmount: jackpotPools.currentAmount,
          tierName: jackpotTiers.name,
          targetAmount: jackpotTiers.targetAmount,
          contributionBps: jackpotTiers.contributionBps,
        })
        .from(jackpotPools)
        .innerJoin(jackpotTiers, eq(jackpotTiers.id, jackpotPools.tierId))
        .where(
          and(
            eq(jackpotPools.status, 'filling'),
            eq(jackpotTiers.isActive, 1),
          ),
        );

      if (activePools.length === 0) return;

      for (const pool of activePools) {
        const bps = pool.contributionBps ?? JACKPOT_PER_TIER_BPS;
        // contribution = totalPot * bps / 10000
        const contribution = (totalPot * BigInt(bps)) / 10000n;
        if (contribution <= 0n) continue;

        // Atomic insert with ON CONFLICT DO NOTHING (idempotent)
        const inserted = await db
          .insert(jackpotContributions)
          .values({
            poolId: pool.poolId,
            betId,
            amount: contribution.toString(),
          })
          .onConflictDoNothing({ target: [jackpotContributions.poolId, jackpotContributions.betId] })
          .returning({ id: jackpotContributions.id });

        // If already exists (replay), skip increment
        if (inserted.length === 0) continue;

        // Atomic increment of pool current_amount
        const [updated] = await db
          .update(jackpotPools)
          .set({
            currentAmount: sql`${jackpotPools.currentAmount}::numeric + ${contribution.toString()}::numeric`,
          })
          .where(
            and(
              eq(jackpotPools.id, pool.poolId),
              eq(jackpotPools.status, 'filling'),
            ),
          )
          .returning({
            currentAmount: jackpotPools.currentAmount,
          });

        if (!updated) continue;

        const newAmount = BigInt(updated.currentAmount);
        const target = BigInt(pool.targetAmount);

        // Broadcast pool update
        wsService.broadcast({
          type: 'jackpot_updated',
          data: {
            poolId: pool.poolId,
            tierId: pool.tierId,
            tierName: pool.tierName,
            currentAmount: newAmount.toString(),
            targetAmount: pool.targetAmount,
            progress: Math.min(100, Number((newAmount * 100n) / target)),
          },
        });

        // Check if pool reached target
        if (newAmount >= target) {
          // Mark as drawing to prevent concurrent draws
          await db
            .update(jackpotPools)
            .set({ status: 'drawing' })
            .where(
              and(
                eq(jackpotPools.id, pool.poolId),
                eq(jackpotPools.status, 'filling'),
              ),
            );

          // Draw winner asynchronously (don't block bet processing)
          this.drawWinner(pool.poolId).catch((err) => {
            logger.error({ err, poolId: pool.poolId }, 'Jackpot draw failed');
          });
        }
      }
    } catch (err) {
      logger.error({ err, betId: betId.toString() }, 'Jackpot contribution processing failed');
    }
  }

  /**
   * Draw a random winner for a filled pool.
   * Uses seeded Fisher-Yates shuffle (same pattern as raffle draw).
   */
  async drawWinner(poolId: string): Promise<void> {
    const db = getDb();

    try {
      // Get pool + tier info
      const [pool] = await db
        .select({
          id: jackpotPools.id,
          tierId: jackpotPools.tierId,
          cycle: jackpotPools.cycle,
          currentAmount: jackpotPools.currentAmount,
          status: jackpotPools.status,
          tierName: jackpotTiers.name,
          targetAmount: jackpotTiers.targetAmount,
          minGames: jackpotTiers.minGames,
        })
        .from(jackpotPools)
        .innerJoin(jackpotTiers, eq(jackpotTiers.id, jackpotPools.tierId))
        .where(eq(jackpotPools.id, poolId))
        .limit(1);

      if (!pool || pool.status !== 'drawing') {
        logger.warn({ poolId }, 'Jackpot draw skipped: pool not in drawing state');
        return;
      }

      // Get eligible users (total resolved bets >= minGames)
      let eligible = await this.getEligibleUsers(pool.minGames);

      // VIP-exclusive tiers: filter by VIP tier
      const requiredVipTier = VIP_JACKPOT_TIERS[pool.tierName];
      if (requiredVipTier) {
        const { vipService } = await import('./vip.service.js');
        const vipTierOrder: Record<string, number> = { silver: 1, gold: 2, diamond: 3 };
        const minTierLevel = vipTierOrder[requiredVipTier] ?? 0;

        const vipFiltered: typeof eligible = [];
        for (const user of eligible) {
          const vip = await vipService.getActiveVip(user.userId);
          if (vip && (vipTierOrder[vip.tier] ?? 0) >= minTierLevel) {
            vipFiltered.push(user);
          }
        }
        eligible = vipFiltered;
        logger.info(
          { poolId, tierName: pool.tierName, requiredVipTier, totalEligible: eligible.length },
          'Jackpot VIP filter applied',
        );
      }

      if (eligible.length === 0) {
        logger.warn({ poolId, minGames: pool.minGames, vipFilter: requiredVipTier ?? 'none' }, 'Jackpot draw: no eligible users, staying in drawing state');
        return;
      }

      // Generate cryptographic seed
      const seed = crypto.randomBytes(32).toString('hex');
      const seedBuffer = Buffer.from(seed, 'hex');

      // Fisher-Yates shuffle with seeded deterministic randomness
      const indices = eligible.map((_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const posBuf = Buffer.alloc(4);
        posBuf.writeUInt32BE(i);
        const hash = crypto.createHash('sha256').update(Buffer.concat([seedBuffer, posBuf])).digest();
        const j = hash.readUInt32BE(0) % (i + 1);
        [indices[i], indices[j]] = [indices[j]!, indices[i]!];
      }

      const winnerIdx = indices[0]!;
      const winner = eligible[winnerIdx]!;
      const prizeAmount = pool.currentAmount;

      // Credit prize to winner's vault bonus balance
      await vaultService.creditWinner(winner.userId, prizeAmount);

      // Update pool with winner info
      const now = new Date();
      await db
        .update(jackpotPools)
        .set({
          status: 'completed',
          winnerUserId: winner.userId,
          winnerAddress: winner.address,
          drawSeed: seed,
          winnerDrawnAt: now,
          completedAt: now,
        })
        .where(eq(jackpotPools.id, poolId));

      // Broadcast jackpot won to all clients
      wsService.broadcast({
        type: 'jackpot_won',
        data: {
          poolId,
          tierId: pool.tierId,
          tierName: pool.tierName,
          cycle: pool.cycle,
          amount: prizeAmount,
          winnerAddress: winner.address,
          winnerNickname: winner.nickname,
        },
      });

      // Insert persistent notification for the winner (survives offline)
      const tierDisplayNames: Record<string, string> = {
        mini: 'Mini',
        medium: 'Medium',
        large: 'Large',
        mega: 'Mega',
        super_mega: 'Super Mega',
      };
      const displayName = tierDisplayNames[pool.tierName] ?? pool.tierName;

      await db.insert(userNotifications).values({
        userId: winner.userId,
        type: 'jackpot_won',
        title: `Jackpot ${displayName} Won!`,
        message: `You won the ${displayName} Jackpot — ${prizeAmount} LAUNCH!`,
        metadata: {
          poolId,
          tierId: pool.tierId,
          tierName: pool.tierName,
          amount: prizeAmount,
          cycle: pool.cycle,
        },
      });

      // Send targeted WS to winner (for real-time modal even if they didn't see the broadcast)
      wsService.sendToAddress(winner.address, {
        type: 'jackpot_won',
        data: {
          poolId,
          tierId: pool.tierId,
          tierName: pool.tierName,
          cycle: pool.cycle,
          amount: prizeAmount,
          winnerAddress: winner.address,
          winnerNickname: winner.nickname,
          isPersonal: true,
        },
      });

      logger.info(
        {
          poolId,
          tierId: pool.tierId,
          tierName: pool.tierName,
          cycle: pool.cycle,
          amount: prizeAmount,
          winner: winner.address,
          eligibleCount: eligible.length,
        },
        'Jackpot drawn — winner selected',
      );

      // Create new pool for next cycle
      await this.createNextCycle(pool.tierId, pool.cycle);
    } catch (err) {
      logger.error({ err, poolId }, 'Jackpot draw error');
    }
  }

  /**
   * Get users eligible for a jackpot tier (total resolved bets >= minGames).
   */
  private async getEligibleUsers(minGames: number): Promise<Array<{ userId: string; address: string; nickname: string | null }>> {
    const db = getDb();

    const result = await db.execute(sql`
      SELECT u.id AS user_id, u.address, u.profile_nickname AS nickname
      FROM users u
      WHERE (
        SELECT COUNT(*)::int FROM bets b
        WHERE (b.maker_user_id = u.id OR b.acceptor_user_id = u.id)
          AND b.status IN ('revealed', 'timeout_claimed')
      ) >= ${minGames}
    `);

    return (result as unknown as Array<{ user_id: string; address: string; nickname: string | null }>).map((r) => ({
      userId: r.user_id,
      address: r.address,
      nickname: r.nickname,
    }));
  }

  /**
   * Create the next cycle pool for a tier after a draw completes.
   */
  private async createNextCycle(tierId: number, previousCycle: number): Promise<void> {
    const db = getDb();
    const newCycle = previousCycle + 1;

    try {
      await db
        .insert(jackpotPools)
        .values({
          tierId,
          cycle: newCycle,
          currentAmount: '0',
          status: 'filling',
        })
        .onConflictDoNothing({ target: [jackpotPools.tierId, jackpotPools.cycle] });

      // Broadcast reset
      const [tier] = await db
        .select({ name: jackpotTiers.name, targetAmount: jackpotTiers.targetAmount })
        .from(jackpotTiers)
        .where(eq(jackpotTiers.id, tierId))
        .limit(1);

      if (tier) {
        wsService.broadcast({
          type: 'jackpot_reset',
          data: {
            tierId,
            tierName: tier.name,
            cycle: newCycle,
            targetAmount: tier.targetAmount,
          },
        });
      }

      logger.info({ tierId, cycle: newCycle }, 'New jackpot cycle created');
    } catch (err) {
      logger.error({ err, tierId, cycle: newCycle }, 'Failed to create next jackpot cycle');
    }
  }

  /**
   * Ensure all tiers have an active (filling) pool.
   * Called on server startup.
   */
  async ensureActivePoolsExist(): Promise<void> {
    const db = getDb();

    try {
      const tiers = await db
        .select({ id: jackpotTiers.id })
        .from(jackpotTiers)
        .where(eq(jackpotTiers.isActive, 1));

      for (const tier of tiers) {
        const existing = await db
          .select({ id: jackpotPools.id })
          .from(jackpotPools)
          .where(
            and(
              eq(jackpotPools.tierId, tier.id),
              inArray(jackpotPools.status, ['filling', 'drawing']),
            ),
          )
          .limit(1);

        if (existing.length === 0) {
          // Find max cycle for this tier
          const [maxCycle] = await db.execute(sql`
            SELECT COALESCE(MAX(cycle), 0)::int AS max_cycle
            FROM jackpot_pools WHERE tier_id = ${tier.id}
          `) as unknown as [{ max_cycle: number }];

          await db
            .insert(jackpotPools)
            .values({
              tierId: tier.id,
              cycle: (maxCycle?.max_cycle ?? 0) + 1,
              currentAmount: '0',
              status: 'filling',
            })
            .onConflictDoNothing({ target: [jackpotPools.tierId, jackpotPools.cycle] });

          logger.info({ tierId: tier.id }, 'Created missing active jackpot pool');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to ensure active jackpot pools');
    }
  }

  /**
   * Backfill jackpot contributions for all resolved bets that have no contributions yet.
   * Called once on startup after pools are created.
   */
  async backfillContributions(): Promise<void> {
    const db = getDb();

    try {
      // Find resolved bets with NO jackpot contributions
      const { bets } = await import('@coinflip/db/schema');

      const missingBets = await db.execute(sql`
        SELECT b.bet_id, b.amount
        FROM bets b
        WHERE b.status IN ('revealed', 'timeout_claimed')
          AND NOT EXISTS (
            SELECT 1 FROM jackpot_contributions jc WHERE jc.bet_id = b.bet_id
          )
        ORDER BY b.bet_id ASC
      `) as unknown as Array<{ bet_id: string; amount: string }>;

      if (missingBets.length === 0) {
        logger.info('Jackpot backfill: no missing contributions');
        return;
      }

      logger.info({ count: missingBets.length }, 'Jackpot backfill: processing missing contributions');

      let processed = 0;
      for (const bet of missingBets) {
        const totalPot = BigInt(bet.amount) * 2n;
        await this.processBetContribution(BigInt(bet.bet_id), totalPot);
        processed++;
      }

      logger.info({ processed }, 'Jackpot backfill complete');
    } catch (err) {
      logger.error({ err }, 'Jackpot backfill failed');
    }
  }

  /**
   * Background lifecycle check — retry any stuck drawing pools.
   */
  async checkJackpotLifecycle(): Promise<void> {
    const db = getDb();

    try {
      // Find pools stuck in "drawing" state (failed draw)
      const stuckPools = await db
        .select({ id: jackpotPools.id })
        .from(jackpotPools)
        .where(eq(jackpotPools.status, 'drawing'));

      for (const pool of stuckPools) {
        logger.info({ poolId: pool.id }, 'Retrying stuck jackpot draw');
        await this.drawWinner(pool.id);
      }
    } catch (err) {
      logger.error({ err }, 'Jackpot lifecycle check failed');
    }
  }

  // ─── Query Methods (for API routes) ─────────────────

  /**
   * Get all active (filling/drawing) pools with tier info.
   */
  async getActivePools() {
    const db = getDb();

    const pools = await db
      .select({
        id: jackpotPools.id,
        tierId: jackpotPools.tierId,
        cycle: jackpotPools.cycle,
        currentAmount: jackpotPools.currentAmount,
        status: jackpotPools.status,
        createdAt: jackpotPools.createdAt,
        tierName: jackpotTiers.name,
        targetAmount: jackpotTiers.targetAmount,
        minGames: jackpotTiers.minGames,
        contributionBps: jackpotTiers.contributionBps,
      })
      .from(jackpotPools)
      .innerJoin(jackpotTiers, eq(jackpotTiers.id, jackpotPools.tierId))
      .where(inArray(jackpotPools.status, ['filling', 'drawing']))
      .orderBy(jackpotPools.tierId);

    return pools.map((p) => this.formatPoolResponse(p));
  }

  /**
   * Get completed jackpot pools (history) with pagination.
   */
  async getHistory(limit: number, offset: number) {
    const db = getDb();

    const pools = await db
      .select({
        id: jackpotPools.id,
        tierId: jackpotPools.tierId,
        cycle: jackpotPools.cycle,
        currentAmount: jackpotPools.currentAmount,
        status: jackpotPools.status,
        winnerAddress: jackpotPools.winnerAddress,
        winnerUserId: jackpotPools.winnerUserId,
        drawSeed: jackpotPools.drawSeed,
        winnerDrawnAt: jackpotPools.winnerDrawnAt,
        completedAt: jackpotPools.completedAt,
        createdAt: jackpotPools.createdAt,
        tierName: jackpotTiers.name,
        targetAmount: jackpotTiers.targetAmount,
        minGames: jackpotTiers.minGames,
        contributionBps: jackpotTiers.contributionBps,
      })
      .from(jackpotPools)
      .innerJoin(jackpotTiers, eq(jackpotTiers.id, jackpotPools.tierId))
      .where(eq(jackpotPools.status, 'completed'))
      .orderBy(sql`${jackpotPools.completedAt} DESC NULLS LAST`)
      .limit(limit)
      .offset(offset);

    // Get winner nicknames
    const result = [];
    for (const p of pools) {
      let winnerNickname: string | null = null;
      if (p.winnerUserId) {
        const [user] = await db
          .select({ nickname: users.profileNickname })
          .from(users)
          .where(eq(users.id, p.winnerUserId))
          .limit(1);
        winnerNickname = user?.nickname ?? null;
      }
      result.push(this.formatPoolResponse({ ...p, winnerNickname }));
    }

    return result;
  }

  /**
   * Get a single pool by ID.
   */
  async getPoolById(poolId: string) {
    const db = getDb();

    const [pool] = await db
      .select({
        id: jackpotPools.id,
        tierId: jackpotPools.tierId,
        cycle: jackpotPools.cycle,
        currentAmount: jackpotPools.currentAmount,
        status: jackpotPools.status,
        winnerAddress: jackpotPools.winnerAddress,
        winnerUserId: jackpotPools.winnerUserId,
        drawSeed: jackpotPools.drawSeed,
        winnerDrawnAt: jackpotPools.winnerDrawnAt,
        completedAt: jackpotPools.completedAt,
        createdAt: jackpotPools.createdAt,
        tierName: jackpotTiers.name,
        targetAmount: jackpotTiers.targetAmount,
        minGames: jackpotTiers.minGames,
        contributionBps: jackpotTiers.contributionBps,
      })
      .from(jackpotPools)
      .innerJoin(jackpotTiers, eq(jackpotTiers.id, jackpotPools.tierId))
      .where(eq(jackpotPools.id, poolId))
      .limit(1);

    if (!pool) return null;

    let winnerNickname: string | null = null;
    if (pool.winnerUserId) {
      const [user] = await db
        .select({ nickname: users.profileNickname })
        .from(users)
        .where(eq(users.id, pool.winnerUserId))
        .limit(1);
      winnerNickname = user?.nickname ?? null;
    }

    return this.formatPoolResponse({ ...pool, winnerNickname });
  }

  /**
   * Get user's eligibility for jackpot tiers.
   */
  async getUserEligibility(userId: string) {
    const db = getDb();

    // Count user's resolved bets
    const [countResult] = await db.execute(sql`
      SELECT COUNT(*)::int AS total_bets
      FROM bets
      WHERE (maker_user_id = ${userId} OR acceptor_user_id = ${userId})
        AND status IN ('revealed', 'timeout_claimed')
    `) as unknown as [{ total_bets: number }];

    const totalBets = countResult?.total_bets ?? 0;

    // Get all tier thresholds
    const tiers = await db
      .select({ id: jackpotTiers.id, minGames: jackpotTiers.minGames })
      .from(jackpotTiers)
      .where(eq(jackpotTiers.isActive, 1))
      .orderBy(jackpotTiers.id);

    const eligibleTiers = tiers
      .filter((t) => totalBets >= t.minGames)
      .map((t) => t.id);

    return { totalBets, eligibleTiers };
  }

  // ─── Admin Methods ──────────────────────────────────

  /**
   * Get all tiers with their current active pool (for admin).
   */
  async getTiersWithPools() {
    const db = getDb();

    const tiers = await db
      .select({
        id: jackpotTiers.id,
        name: jackpotTiers.name,
        targetAmount: jackpotTiers.targetAmount,
        minGames: jackpotTiers.minGames,
        contributionBps: jackpotTiers.contributionBps,
        isActive: jackpotTiers.isActive,
      })
      .from(jackpotTiers)
      .orderBy(jackpotTiers.id);

    const activePools = await db
      .select({
        id: jackpotPools.id,
        tierId: jackpotPools.tierId,
        cycle: jackpotPools.cycle,
        currentAmount: jackpotPools.currentAmount,
        status: jackpotPools.status,
      })
      .from(jackpotPools)
      .where(inArray(jackpotPools.status, ['filling', 'drawing']));

    const poolMap = new Map(activePools.map((p) => [p.tierId, p]));

    return tiers.map((t) => {
      const pool = poolMap.get(t.id);
      const current = pool ? BigInt(pool.currentAmount) : 0n;
      const target = BigInt(t.targetAmount);
      const progress = target > 0n ? Math.min(100, Number((current * 100n) / target)) : 0;

      return {
        ...t,
        pool: pool
          ? { id: pool.id, cycle: pool.cycle, currentAmount: pool.currentAmount, status: pool.status, progress }
          : null,
      };
    });
  }

  /**
   * Update tier configuration (admin).
   */
  async updateTier(tierId: number, updates: { targetAmount?: string; minGames?: number; isActive?: number }): Promise<void> {
    const db = getDb();

    const setFields: Record<string, unknown> = {};
    if (updates.targetAmount !== undefined) setFields.targetAmount = updates.targetAmount;
    if (updates.minGames !== undefined) setFields.minGames = updates.minGames;
    if (updates.isActive !== undefined) setFields.isActive = updates.isActive;

    if (Object.keys(setFields).length === 0) return;

    await db
      .update(jackpotTiers)
      .set(setFields as typeof jackpotTiers.$inferInsert)
      .where(eq(jackpotTiers.id, tierId));

    logger.info({ tierId, updates }, 'Admin: jackpot tier updated');
  }

  /**
   * Force draw a pool (admin). Sets status to drawing, then draws winner.
   */
  async forceDrawPool(poolId: string): Promise<{ success: boolean; message: string }> {
    const db = getDb();

    const [pool] = await db
      .select({ id: jackpotPools.id, status: jackpotPools.status, currentAmount: jackpotPools.currentAmount })
      .from(jackpotPools)
      .where(eq(jackpotPools.id, poolId))
      .limit(1);

    if (!pool) return { success: false, message: 'Pool not found' };
    if (pool.status === 'completed') return { success: false, message: 'Pool already completed' };

    if (pool.status === 'filling') {
      await db
        .update(jackpotPools)
        .set({ status: 'drawing' })
        .where(eq(jackpotPools.id, poolId));
    }

    await this.drawWinner(poolId);
    logger.info({ poolId }, 'Admin: forced jackpot draw');
    return { success: true, message: 'Draw triggered' };
  }

  /**
   * Reset a pool to 0 (admin). Only for filling pools.
   */
  async resetPool(poolId: string): Promise<{ success: boolean; message: string }> {
    const db = getDb();

    const [pool] = await db
      .select({ id: jackpotPools.id, status: jackpotPools.status })
      .from(jackpotPools)
      .where(eq(jackpotPools.id, poolId))
      .limit(1);

    if (!pool) return { success: false, message: 'Pool not found' };
    if (pool.status !== 'filling') return { success: false, message: 'Can only reset filling pools' };

    await db
      .update(jackpotPools)
      .set({ currentAmount: '0' })
      .where(eq(jackpotPools.id, poolId));

    logger.info({ poolId }, 'Admin: jackpot pool reset to 0');
    return { success: true, message: 'Pool reset to 0' };
  }

  /**
   * Format a pool DB row into the API response shape.
   */
  private formatPoolResponse(pool: {
    id: string;
    tierId: number;
    cycle: number;
    currentAmount: string;
    status: string;
    tierName: string;
    targetAmount: string;
    minGames?: number;
    winnerAddress?: string | null;
    winnerNickname?: string | null;
    drawSeed?: string | null;
    winnerDrawnAt?: Date | null;
    completedAt?: Date | null;
    createdAt: Date;
  }) {
    const current = BigInt(pool.currentAmount);
    const target = BigInt(pool.targetAmount);
    const progress = target > 0n ? Math.min(100, Number((current * 100n) / target)) : 0;

    return {
      id: pool.id,
      tierId: pool.tierId,
      tierName: pool.tierName,
      cycle: pool.cycle,
      currentAmount: pool.currentAmount,
      targetAmount: pool.targetAmount,
      minGames: pool.minGames ?? 0,
      progress,
      status: pool.status,
      winnerAddress: pool.winnerAddress ?? null,
      winnerNickname: pool.winnerNickname ?? null,
      drawSeed: pool.drawSeed ?? null,
      winnerDrawnAt: pool.winnerDrawnAt instanceof Date ? pool.winnerDrawnAt.toISOString() : pool.winnerDrawnAt ?? null,
      completedAt: pool.completedAt instanceof Date ? pool.completedAt.toISOString() : pool.completedAt ?? null,
      createdAt: pool.createdAt instanceof Date ? pool.createdAt.toISOString() : String(pool.createdAt),
    };
  }
}

export const jackpotService = new JackpotService();
