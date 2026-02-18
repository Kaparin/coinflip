/**
 * Persistent storage for bet secrets between chain broadcast and DB confirmation.
 *
 * Problem: bet secrets (maker_side, maker_secret) are generated in memory and
 * passed to fire-and-forget background tasks. If the task fails to resolve
 * the bet_id and save to `bets`, the secrets are lost — making auto-reveal
 * impossible if someone accepts the bet.
 *
 * Solution: persist secrets to `pending_bet_secrets` table BEFORE broadcasting.
 * The reconciliation sweep can recover them when importing orphaned chain bets.
 */

import { eq, lt } from 'drizzle-orm';
import { pendingBetSecrets } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

class PendingSecretsService {
  private db = getDb();

  /**
   * Save a bet secret before broadcasting. Uses ON CONFLICT to handle retries.
   * Must be called BEFORE relayCreateBet.
   */
  async save(params: {
    commitment: string;
    makerSide: 'heads' | 'tails';
    makerSecret: string;
    txHash?: string;
  }): Promise<void> {
    try {
      await this.db.insert(pendingBetSecrets)
        .values({
          commitment: params.commitment,
          makerSide: params.makerSide,
          makerSecret: params.makerSecret,
          txHash: params.txHash ?? null,
        })
        .onConflictDoUpdate({
          target: pendingBetSecrets.commitment,
          set: {
            makerSide: params.makerSide,
            makerSecret: params.makerSecret,
            txHash: params.txHash ?? null,
          },
        });
    } catch (err) {
      logger.error({ err, commitment: params.commitment }, 'pending-secrets: failed to save');
      throw err;
    }
  }

  /** Update the txHash after successful broadcast. */
  async setTxHash(commitment: string, txHash: string): Promise<void> {
    try {
      await this.db.update(pendingBetSecrets)
        .set({ txHash })
        .where(eq(pendingBetSecrets.commitment, commitment));
    } catch (err) {
      logger.warn({ err, commitment, txHash }, 'pending-secrets: failed to set txHash');
    }
  }

  /** Retrieve secrets by commitment hash. */
  async getByCommitment(commitment: string): Promise<{
    makerSide: string;
    makerSecret: string;
    txHash: string | null;
  } | null> {
    try {
      const [row] = await this.db.select({
        makerSide: pendingBetSecrets.makerSide,
        makerSecret: pendingBetSecrets.makerSecret,
        txHash: pendingBetSecrets.txHash,
      })
        .from(pendingBetSecrets)
        .where(eq(pendingBetSecrets.commitment, commitment))
        .limit(1);
      return row ?? null;
    } catch (err) {
      logger.warn({ err, commitment }, 'pending-secrets: failed to get');
      return null;
    }
  }

  /** Delete after bet is saved to `bets` table with the secret. */
  async delete(commitment: string): Promise<void> {
    try {
      await this.db.delete(pendingBetSecrets)
        .where(eq(pendingBetSecrets.commitment, commitment));
    } catch (err) {
      logger.warn({ err, commitment }, 'pending-secrets: failed to delete');
    }
  }

  /** Garbage-collect rows older than the given age (default: 1 hour). */
  async cleanup(maxAgeMs = 60 * 60 * 1000): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - maxAgeMs);
      const result = await this.db.delete(pendingBetSecrets)
        .where(lt(pendingBetSecrets.createdAt, cutoff));
      const count = (result as { rowCount?: number }).rowCount ?? 0;
      if (count > 0) {
        logger.info({ count, maxAgeMs }, 'pending-secrets: cleaned up stale rows');
      }
      return count;
    } catch (err) {
      logger.warn({ err }, 'pending-secrets: cleanup failed');
      return 0;
    }
  }
}

export const pendingSecretsService = new PendingSecretsService();
