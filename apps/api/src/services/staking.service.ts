/**
 * Staking Service — accumulates per-bet staking contributions (2% of pot)
 * and periodically flushes to the LAUNCH staking contract via distribute().
 *
 * Flow:
 *   1. Per resolved bet: recordContribution(betId, totalPot) → insert into staking_ledger
 *   2. Periodic or admin-triggered: flushToContract() → send accumulated uaxm
 *      to staking contract's distribute() endpoint
 *
 * The staking contract distributes AXM pro-rata to LAUNCH token stakers.
 */

import { eq, sql } from 'drizzle-orm';
import { stakingLedger } from '@coinflip/db/schema';
import { STAKING_BPS } from '@coinflip/shared/constants';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { relayerService } from './relayer.js';
import { configService } from './config.service.js';

class StakingService {
  /**
   * Record staking contribution for a resolved bet.
   * Idempotent via UNIQUE(bet_id).
   *
   * @param betId - The resolved bet ID
   * @param totalPot - Total pot in micro-units (amount * 2)
   */
  async recordContribution(betId: bigint, totalPot: bigint): Promise<void> {
    const bps = await configService.getNumber('STAKING_BPS', STAKING_BPS);
    const amount = (totalPot * BigInt(bps)) / 10000n;
    if (amount <= 0n) return;

    const db = getDb();

    try {
      await db
        .insert(stakingLedger)
        .values({
          betId,
          amount: amount.toString(),
        })
        .onConflictDoNothing();

      logger.debug(
        { betId: betId.toString(), amount: amount.toString() },
        'Staking contribution recorded',
      );
    } catch (err) {
      logger.warn({ err, betId: betId.toString() }, 'Staking contribution insert failed');
    }
  }

  /**
   * Get total pending (unflushed) amount.
   */
  async getPendingTotal(): Promise<string> {
    const db = getDb();
    const [row] = await db
      .select({
        total: sql<string>`coalesce(sum(${stakingLedger.amount}::numeric), 0)::text`,
      })
      .from(stakingLedger)
      .where(eq(stakingLedger.status, 'pending'));
    return row?.total ?? '0';
  }

  /**
   * Get staking stats for admin panel.
   */
  async getStats() {
    const db = getDb();
    const [stats] = await db
      .select({
        totalAccumulated: sql<string>`coalesce(sum(${stakingLedger.amount}::numeric), 0)::text`,
        totalEntries: sql<number>`count(*)::int`,
        pendingAmount: sql<string>`coalesce(sum(case when ${stakingLedger.status} = 'pending' then ${stakingLedger.amount}::numeric else 0 end), 0)::text`,
        pendingEntries: sql<number>`count(*) filter (where ${stakingLedger.status} = 'pending')`,
        flushedAmount: sql<string>`coalesce(sum(case when ${stakingLedger.status} = 'flushed' then ${stakingLedger.amount}::numeric else 0 end), 0)::text`,
        flushedEntries: sql<number>`count(*) filter (where ${stakingLedger.status} = 'flushed')`,
      })
      .from(stakingLedger);

    return stats!;
  }

  /**
   * Flush accumulated pending contributions to the staking contract.
   * Sends native AXM with distribute() message.
   *
   * @returns txHash and amount flushed, or null if nothing to flush
   */
  async flushToContract(): Promise<{ txHash: string; amount: string } | null> {
    const stakingAddr = env.STAKING_CONTRACT_ADDR;
    if (!stakingAddr) {
      logger.warn('STAKING_CONTRACT_ADDR not set — cannot flush staking rewards');
      return null;
    }

    if (!relayerService.isReady()) {
      logger.warn('Relayer not ready — cannot flush staking rewards');
      return null;
    }

    const pendingTotal = await this.getPendingTotal();
    if (BigInt(pendingTotal) <= 0n) {
      logger.debug('No pending staking contributions to flush');
      return null;
    }

    logger.info({ amount: pendingTotal, stakingAddr }, 'Flushing staking contributions to contract');

    // Execute distribute() on staking contract with native AXM funds
    const result = await relayerService.relayContractExecute(
      stakingAddr,
      { distribute: {} },
      [{ denom: env.AXM_DENOM, amount: pendingTotal }],
      'Staking rewards distribution',
    );

    if (!result.success) {
      logger.error(
        { error: result.error, rawLog: result.rawLog, amount: pendingTotal },
        'Staking flush failed',
      );
      return null;
    }

    // Mark all pending entries as flushed
    const db = getDb();
    await db
      .update(stakingLedger)
      .set({
        status: 'flushed',
        flushTxHash: result.txHash ?? null,
      })
      .where(eq(stakingLedger.status, 'pending'));

    logger.info(
      { txHash: result.txHash, amount: pendingTotal },
      'Staking contributions flushed to contract',
    );

    return { txHash: result.txHash!, amount: pendingTotal };
  }

  /**
   * Backfill staking contributions for all resolved bets missing from staking_ledger.
   * Called once on server startup for resilience.
   */
  async backfillContributions(): Promise<void> {
    const db = getDb();

    try {
      const missingBets = await db.execute(sql`
        SELECT b.bet_id, b.amount
        FROM bets b
        WHERE b.status IN ('revealed', 'timeout_claimed')
          AND NOT EXISTS (
            SELECT 1 FROM staking_ledger sl WHERE sl.bet_id = b.bet_id
          )
        ORDER BY b.bet_id ASC
      `) as unknown as Array<{ bet_id: string; amount: string }>;

      if (missingBets.length === 0) return;

      logger.info({ count: missingBets.length }, 'Staking backfill: processing missing contributions');

      for (const bet of missingBets) {
        const totalPot = BigInt(bet.amount) * 2n;
        await this.recordContribution(BigInt(bet.bet_id), totalPot);
      }

      logger.info({ count: missingBets.length }, 'Staking backfill complete');
    } catch (err) {
      logger.error({ err }, 'Staking backfill failed');
    }
  }
}

export const stakingService = new StakingService();
