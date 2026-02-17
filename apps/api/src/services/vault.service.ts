import { eq, sql, and } from 'drizzle-orm';
import { vaultBalances } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export class VaultService {
  private db = getDb();

  async getBalance(userId: string) {
    const balance = await this.db.query.vaultBalances.findFirst({
      where: eq(vaultBalances.userId, userId),
    });

    if (!balance) {
      return { available: '0', locked: '0', total: '0' };
    }

    const available = BigInt(balance.available);
    const locked = BigInt(balance.locked);
    const total = available + locked;

    return {
      available: available.toString(),
      locked: locked.toString(),
      total: total.toString(),
    };
  }

  async syncBalanceFromChain(userId: string, available: string, locked: string, height: bigint) {
    // height=0n means "live chain query" — always trust it (no height guard).
    // height>0n means "from indexer/background task" — only update if newer than DB row.
    const isLiveQuery = height === 0n;

    await this.db
      .insert(vaultBalances)
      .values({ userId, available, locked, sourceHeight: isLiveQuery ? null : height })
      .onConflictDoUpdate({
        target: vaultBalances.userId,
        set: {
          available,
          locked,
          ...(isLiveQuery ? {} : { sourceHeight: height }),
          updatedAt: new Date(),
        },
        // Only apply height guard for indexed data; live queries always win
        ...(isLiveQuery ? {} : {
          where: sql`${vaultBalances.sourceHeight} IS NULL OR ${vaultBalances.sourceHeight} < ${height}`,
        }),
      });

    logger.debug({ userId, available, locked, height: height.toString(), isLiveQuery }, 'Vault balance synced');
  }

  /**
   * Atomically lock funds: available -= amount, locked += amount.
   * Uses WHERE available >= amount to prevent negative balances (double-spend).
   * Returns the updated row, or null if insufficient balance.
   */
  async lockFunds(userId: string, amount: string) {
    const result = await this.db
      .update(vaultBalances)
      .set({
        available: sql`${vaultBalances.available}::numeric - ${amount}::numeric`,
        locked: sql`${vaultBalances.locked}::numeric + ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vaultBalances.userId, userId),
          sql`${vaultBalances.available}::numeric >= ${amount}::numeric`,
        ),
      )
      .returning();

    if (result.length === 0) {
      logger.warn({ userId, amount }, 'lockFunds: insufficient available balance (atomic guard)');
      return null;
    }

    return result[0];
  }

  /**
   * Atomically unlock funds: locked -= amount, available += amount.
   * Uses WHERE locked >= amount to prevent negative locked balance.
   * Returns the updated row, or null if insufficient locked balance.
   */
  async unlockFunds(userId: string, amount: string) {
    const result = await this.db
      .update(vaultBalances)
      .set({
        available: sql`${vaultBalances.available}::numeric + ${amount}::numeric`,
        locked: sql`${vaultBalances.locked}::numeric - ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vaultBalances.userId, userId),
          sql`${vaultBalances.locked}::numeric >= ${amount}::numeric`,
        ),
      )
      .returning();

    if (result.length === 0) {
      logger.warn({ userId, amount }, 'unlockFunds: insufficient locked balance (atomic guard)');
      return null;
    }

    return result[0];
  }

  async creditWinner(userId: string, amount: string) {
    await this.db
      .update(vaultBalances)
      .set({
        available: sql`${vaultBalances.available}::numeric + ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(vaultBalances.userId, userId));
  }
}

export const vaultService = new VaultService();
