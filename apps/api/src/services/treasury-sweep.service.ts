/**
 * Treasury Sweep Service — collects offchain_spent tokens from users.
 *
 * Off-chain purchases (VIP, pins, announcements, raffles) deduct from user balance
 * via offchain_spent in DB, but the actual tokens remain in the contract vault.
 * This service sweeps those tokens to the admin wallet using the contract's
 * admin_withdraw_user function.
 *
 * Flow per user:
 *   1. Query chain vault balance
 *   2. sweepAmount = min(offchain_spent, chain_available)
 *   3. relayContractExecute({ admin_withdraw_user: { user, amount } })
 *      → contract sends native AXM from user's vault directly to admin wallet
 *   4. On success: creditAvailable(userId, sweepAmount) to decrement offchain_spent
 *   5. Record in treasury_ledger
 */

import { gt, eq, sql } from 'drizzle-orm';
import { vaultBalances, users, treasuryLedger } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { relayerService } from './relayer.js';
import { vaultService } from './vault.service.js';
import { env, getActiveContractAddr, gameDenom } from '../config/env.js';
import { chainRest } from '../lib/chain-fetch.js';

export interface SweepCandidate {
  userId: string;
  address: string;
  nickname: string | null;
  offchainSpent: string;
  chainAvailable: string;
  sweepable: string;
}

export interface SweepResult {
  userId: string;
  address: string;
  amount: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  txHash?: string;
}

export interface SweepSummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  totalSwept: string;
  results: SweepResult[];
}

async function queryChainVaultBalance(address: string): Promise<{ available: string; locked: string }> {
  try {
    const query = btoa(JSON.stringify({ vault_balance: { address } }));
    const res = await chainRest(
      `/cosmwasm/wasm/v1/contract/${getActiveContractAddr()}/smart/${query}`,
    );
    if (!res.ok) return { available: '0', locked: '0' };
    const data = (await res.json()) as { data: { available: string; locked: string } };
    return data.data;
  } catch {
    return { available: '0', locked: '0' };
  }
}

class TreasurySweepService {
  private sweepInProgress = false;
  private autoSweepInterval: ReturnType<typeof setInterval> | null = null;

  /** Check if a sweep is currently running */
  isRunning(): boolean {
    return this.sweepInProgress;
  }

  /**
   * Start automatic sweep cron — runs every intervalMs.
   * Default: every 10 minutes.
   */
  startAutoSweep(intervalMs = 10 * 60 * 1000): void {
    if (this.autoSweepInterval) return;

    logger.info({ intervalMs }, 'Starting auto-sweep cron');
    this.autoSweepInterval = setInterval(async () => {
      try {
        if (this.sweepInProgress) {
          logger.debug('Auto-sweep skipped: already in progress');
          return;
        }
        if (!relayerService.isReady()) {
          logger.debug('Auto-sweep skipped: relayer not ready');
          return;
        }

        // Check if there are any candidates
        const db = getDb();
        const [count] = await db
          .select({ cnt: sql<number>`count(*)::int` })
          .from(vaultBalances)
          .where(gt(sql`${vaultBalances.offchainSpent}::numeric`, sql`0`));

        if (!count?.cnt) return;

        logger.info({ candidates: count.cnt }, 'Auto-sweep: found debts, starting sweep');
        const summary = await this.executeSweep(20);
        logger.info(
          { succeeded: summary.succeeded, failed: summary.failed, totalSwept: summary.totalSwept },
          'Auto-sweep completed',
        );
      } catch (err) {
        logger.warn({ err }, 'Auto-sweep cron failed');
      }
    }, intervalMs);
  }

  /** Stop automatic sweep */
  stopAutoSweep(): void {
    if (this.autoSweepInterval) {
      clearInterval(this.autoSweepInterval);
      this.autoSweepInterval = null;
    }
  }

  /**
   * Preview sweep candidates — users with offchain_spent > 0.
   * Queries chain balance for each to calculate sweepable amount.
   */
  async getSweepPreview(): Promise<{ candidates: SweepCandidate[]; totalSweepable: string }> {
    const db = getDb();

    // Get all users with offchain_spent > 0
    const rows = await db
      .select({
        userId: vaultBalances.userId,
        address: users.address,
        nickname: users.profileNickname,
        offchainSpent: vaultBalances.offchainSpent,
      })
      .from(vaultBalances)
      .innerJoin(users, eq(users.id, vaultBalances.userId))
      .where(gt(sql`${vaultBalances.offchainSpent}::numeric`, sql`0`));

    // Query chain balances in parallel (batched)
    const candidates: SweepCandidate[] = [];
    let totalSweepable = 0n;

    const BATCH_SIZE = 10;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const chainBalances = await Promise.all(
        batch.map((r) => queryChainVaultBalance(r.address)),
      );

      for (let j = 0; j < batch.length; j++) {
        const row = batch[j]!;
        const chain = chainBalances[j]!;
        const offchainSpent = BigInt(row.offchainSpent);
        const chainAvailable = BigInt(chain.available);
        const sweepable = offchainSpent < chainAvailable ? offchainSpent : chainAvailable;

        if (sweepable > 0n) {
          candidates.push({
            userId: row.userId,
            address: row.address,
            nickname: row.nickname,
            offchainSpent: row.offchainSpent,
            chainAvailable: chain.available,
            sweepable: sweepable.toString(),
          });
          totalSweepable += sweepable;
        }
      }
    }

    return { candidates, totalSweepable: totalSweepable.toString() };
  }

  /**
   * Execute sweep for multiple users.
   * Processes sequentially (relay queue is serialized anyway).
   */
  async executeSweep(maxUsers = 20): Promise<SweepSummary> {
    if (this.sweepInProgress) {
      throw new Error('Sweep already in progress');
    }

    this.sweepInProgress = true;
    const results: SweepResult[] = [];
    let totalSwept = 0n;

    try {
      const db = getDb();

      // Get candidates
      const rows = await db
        .select({
          userId: vaultBalances.userId,
          address: users.address,
          offchainSpent: vaultBalances.offchainSpent,
        })
        .from(vaultBalances)
        .innerJoin(users, eq(users.id, vaultBalances.userId))
        .where(gt(sql`${vaultBalances.offchainSpent}::numeric`, sql`0`))
        .limit(maxUsers);

      for (const row of rows) {
        const result = await this.sweepSingleUser(row.userId, row.address, row.offchainSpent);
        results.push(result);
        if (result.status === 'success') {
          totalSwept += BigInt(result.amount);
        }
      }
    } finally {
      this.sweepInProgress = false;
    }

    const summary: SweepSummary = {
      total: results.length,
      succeeded: results.filter((r) => r.status === 'success').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      totalSwept: totalSwept.toString(),
      results,
    };

    logger.info(
      { succeeded: summary.succeeded, failed: summary.failed, skipped: summary.skipped, totalSwept: summary.totalSwept },
      'Treasury sweep completed',
    );

    return summary;
  }

  /**
   * Sweep a single user's offchain_spent to admin wallet.
   * Uses the contract's admin_withdraw_user function.
   */
  async sweepSingleUser(userId: string, address: string, offchainSpent: string): Promise<SweepResult> {
    const result: SweepResult = { userId, address, amount: '0', status: 'skipped' };

    try {
      // Query chain balance
      const chain = await queryChainVaultBalance(address);
      const chainAvailable = BigInt(chain.available);
      const debt = BigInt(offchainSpent);

      if (debt <= 0n || chainAvailable <= 0n) {
        result.status = 'skipped';
        result.error = debt <= 0n ? 'No offchain debt' : 'No chain balance';
        return result;
      }

      // Sweep the lesser of debt and available
      const sweepAmount = debt < chainAvailable ? debt : chainAvailable;
      result.amount = sweepAmount.toString();

      if (!relayerService.isReady()) {
        result.status = 'failed';
        result.error = 'Relayer not ready';
        return result;
      }

      // Use admin_withdraw_user — sends AXM from user's vault directly to admin wallet
      const txResult = await relayerService.relayContractExecute(
        getActiveContractAddr(),
        {
          admin_withdraw_user: {
            user: address,
            amount: sweepAmount.toString(),
          },
        },
        [],
        `Sweep offchain debt: ${address}`,
      );

      if (!txResult.success) {
        result.status = 'failed';
        result.error = `admin_withdraw_user failed: ${txResult.rawLog ?? txResult.error}`;
        return result;
      }

      result.txHash = txResult.txHash;

      // Decrement offchain_spent in DB (tokens have been collected)
      await vaultService.creditAvailable(userId, sweepAmount.toString());

      // Record in treasury ledger
      const db = getDb();
      await db.insert(treasuryLedger).values({
        txhash: txResult.txHash ?? `sweep_${userId}_${Date.now()}`,
        amount: sweepAmount.toString(),
        denom: gameDenom(),
        source: 'treasury_sweep',
      });

      result.status = 'success';
      logger.info(
        { userId, address, amount: sweepAmount.toString(), txHash: result.txHash },
        'Single user sweep completed',
      );
    } catch (err) {
      result.status = 'failed';
      result.error = err instanceof Error ? err.message : String(err);
      logger.error({ err, userId, address }, 'Single user sweep failed');
    }

    return result;
  }
}

export const treasurySweepService = new TreasurySweepService();
