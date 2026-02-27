import { eq, sql, and } from 'drizzle-orm';
import { vaultBalances } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export class VaultService {
  private db = getDb();

  /**
   * Get user's balance from DB.
   * Returns chain-synced available/locked + off-chain bonus separately.
   */
  async getBalance(userId: string) {
    const balance = await this.db.query.vaultBalances.findFirst({
      where: eq(vaultBalances.userId, userId),
    });

    if (!balance) {
      return { available: '0', locked: '0', total: '0', bonus: '0' };
    }

    const available = BigInt(balance.available);
    const locked = BigInt(balance.locked);
    const bonus = BigInt(balance.bonus);
    const total = available + locked + bonus;

    return {
      available: available.toString(),
      locked: locked.toString(),
      total: total.toString(),
      bonus: bonus.toString(),
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
          // NOTE: bonus is NOT touched — it persists across chain syncs
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
   * Only deducts from on-chain available balance (NOT bonus).
   * Bonus is off-chain and cannot be used for on-chain operations.
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

  /**
   * Atomically deduct from available balance (no locked increase).
   * Used for off-chain payments: VIP subscriptions, pin purchases, etc.
   * Returns the updated row, or null if insufficient balance.
   */
  async deductBalance(userId: string, amount: string) {
    const result = await this.db
      .update(vaultBalances)
      .set({
        available: sql`${vaultBalances.available}::numeric - ${amount}::numeric`,
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
      logger.warn({ userId, amount }, 'deductBalance: insufficient available balance');
      return null;
    }

    return result[0];
  }

  /**
   * Credit back to user's available balance (for refunds).
   * Unlike creditWinner, this restores money to available (on-chain) balance.
   */
  async creditAvailable(userId: string, amount: string) {
    const result = await this.db
      .insert(vaultBalances)
      .values({ userId, available: amount })
      .onConflictDoUpdate({
        target: vaultBalances.userId,
        set: {
          available: sql`${vaultBalances.available}::numeric + ${amount}::numeric`,
          updatedAt: new Date(),
        },
      })
      .returning();

    logger.info(
      { userId, amount, newAvailable: result[0]?.available },
      'Refund credited to available balance',
    );
  }

  /**
   * Credit prize to user's bonus balance. This is separate from on-chain
   * available and is NOT overwritten by syncBalanceFromChain.
   * Bonus is an off-chain prize credit displayed alongside chain balance.
   * If the user has no vault_balances row, one is created.
   */
  async creditWinner(userId: string, amount: string) {
    const result = await this.db
      .insert(vaultBalances)
      .values({ userId, bonus: amount })
      .onConflictDoUpdate({
        target: vaultBalances.userId,
        set: {
          bonus: sql`${vaultBalances.bonus}::numeric + ${amount}::numeric`,
          updatedAt: new Date(),
        },
      })
      .returning();

    logger.info(
      { userId, amount, newBonus: result[0]?.bonus },
      'Prize credited to bonus balance',
    );
  }
}

export const vaultService = new VaultService();
