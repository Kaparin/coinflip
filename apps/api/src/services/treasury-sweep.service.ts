/**
 * Treasury Sweep Service — collects offchain_spent tokens from users.
 *
 * Off-chain purchases (VIP, pins, announcements, raffles) deduct from user balance
 * via offchain_spent in DB, but the actual tokens remain in the contract vault.
 * This service sweeps those tokens to the treasury wallet.
 *
 * Flow per user:
 *   1. Query chain vault balance
 *   2. sweepAmount = min(offchain_spent, chain_available)
 *   3. relayWithdraw(user, sweepAmount) → tokens from vault to user's CW20 wallet
 *   4. relayCw20Transfer(user, cw20, treasury, sweepAmount) → tokens to treasury
 *   5. On success: creditAvailable(userId, sweepAmount) to decrement offchain_spent
 *   6. On transfer failure: attempt re-deposit back into vault
 */

import { gt, eq, sql } from 'drizzle-orm';
import { vaultBalances, users, treasuryLedger } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { relayerService } from './relayer.js';
import { vaultService } from './vault.service.js';
import { env } from '../config/env.js';
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
  withdrawTxHash?: string;
  transferTxHash?: string;
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
      `/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${query}`,
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

  /** Check if a sweep is currently running */
  isRunning(): boolean {
    return this.sweepInProgress;
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
   * Sweep a single user's offchain_spent to treasury.
   * Safe to call independently (e.g., after user withdrawal).
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

      // Step 1: Withdraw from vault to user's CW20 wallet
      const withdrawResult = await relayerService.relayWithdraw(address, sweepAmount.toString());
      if (!withdrawResult.success) {
        result.status = 'failed';
        result.error = `Withdraw failed: ${withdrawResult.rawLog ?? withdrawResult.error}`;
        return result;
      }
      result.withdrawTxHash = withdrawResult.txHash;

      // Step 2: Transfer from user's CW20 wallet to treasury
      const transferResult = await relayerService.relayCw20Transfer(
        address,
        env.LAUNCH_CW20_ADDR,
        env.TREASURY_ADDRESS,
        sweepAmount.toString(),
        'Treasury sweep',
      );

      if (!transferResult.success) {
        // Transfer failed — try to re-deposit tokens back to vault
        logger.warn(
          { address, amount: sweepAmount.toString(), error: transferResult.rawLog },
          'Sweep CW20 transfer failed, attempting re-deposit',
        );

        try {
          await relayerService.submitExecOnContract(
            address,
            env.LAUNCH_CW20_ADDR,
            { send: { contract: env.COINFLIP_CONTRACT_ADDR, amount: sweepAmount.toString(), msg: btoa(JSON.stringify({ deposit: {} })) } },
          );
          logger.info({ address, amount: sweepAmount.toString() }, 'Re-deposit after failed sweep transfer succeeded');
        } catch (reDepositErr) {
          logger.error({ err: reDepositErr, address, amount: sweepAmount.toString() }, 'Re-deposit after failed sweep transfer also failed');
        }

        result.status = 'failed';
        result.error = `CW20 transfer failed: ${transferResult.rawLog ?? transferResult.error}`;
        return result;
      }
      result.transferTxHash = transferResult.txHash;

      // Step 3: Decrement offchain_spent in DB (tokens have been collected)
      await vaultService.creditAvailable(userId, sweepAmount.toString());

      // Step 4: Record in treasury ledger
      const db = getDb();
      await db.insert(treasuryLedger).values({
        txhash: transferResult.txHash ?? `sweep_${userId}_${Date.now()}`,
        amount: sweepAmount.toString(),
        denom: 'COIN',
        source: 'treasury_sweep',
      });

      result.status = 'success';
      logger.info(
        { userId, address, amount: sweepAmount.toString(), withdrawTx: withdrawResult.txHash, transferTx: transferResult.txHash },
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
