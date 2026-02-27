import { eq, sql, and } from 'drizzle-orm';
import { vaultBalances } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export class VaultService {
  private db = getDb();

  /**
   * Get user's balance from DB.
   * Returns effective balances after accounting for off-chain spending.
   *
   * offchain_spent is deducted from available first, then from bonus if needed.
   * This ensures chain sync (which overwrites `available`) never "restores" spent funds.
   */
  async getBalance(userId: string) {
    const balance = await this.db.query.vaultBalances.findFirst({
      where: eq(vaultBalances.userId, userId),
    });

    if (!balance) {
      return { available: '0', locked: '0', total: '0', bonus: '0' };
    }

    const chainAvailable = BigInt(balance.available);
    const locked = BigInt(balance.locked);
    const bonus = BigInt(balance.bonus);
    const spent = BigInt(balance.offchainSpent);

    // Deduct offchain_spent from available first, overflow goes to bonus
    let effectiveAvailable: bigint;
    let effectiveBonus: bigint;

    if (spent <= chainAvailable) {
      effectiveAvailable = chainAvailable - spent;
      effectiveBonus = bonus;
    } else {
      effectiveAvailable = 0n;
      const overflowFromBonus = spent - chainAvailable;
      effectiveBonus = bonus > overflowFromBonus ? bonus - overflowFromBonus : 0n;
    }

    const total = effectiveAvailable + locked + effectiveBonus;

    return {
      available: effectiveAvailable.toString(),
      locked: locked.toString(),
      total: total.toString(),
      bonus: effectiveBonus.toString(),
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
          // NOTE: bonus and offchain_spent are NOT touched — they persist across chain syncs
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
   * Checks (available - offchain_spent) >= amount to prevent double-spending.
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
          sql`(${vaultBalances.available}::numeric - ${vaultBalances.offchainSpent}::numeric) >= ${amount}::numeric`,
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
   * Forfeit locked funds after a resolved bet (revealed/timeout_claimed).
   * Only decrements locked — does NOT add back to available (funds are gone on-chain).
   * For the winner, chain sync will update available with the payout.
   * For the loser, available stays at the correct post-lock value.
   *
   * Use this instead of unlockFunds when funds were consumed (not returned).
   */
  async forfeitLocked(userId: string, amount: string) {
    const result = await this.db
      .update(vaultBalances)
      .set({
        locked: sql`GREATEST(0, ${vaultBalances.locked}::numeric - ${amount}::numeric)`,
        updatedAt: new Date(),
      })
      .where(eq(vaultBalances.userId, userId))
      .returning();

    if (result.length === 0) {
      logger.warn({ userId, amount }, 'forfeitLocked: no balance row found');
      return null;
    }

    return result[0];
  }

  /**
   * Atomically deduct from user's effective balance (available + bonus - offchain_spent).
   * Used for off-chain payments: VIP subscriptions, pin purchases, announcements, etc.
   *
   * Instead of decrementing `available` (which gets overwritten by chain sync),
   * we increment `offchain_spent` — a persistent counter that survives chain sync.
   *
   * Returns the updated row, or null if insufficient balance.
   */
  async deductBalance(userId: string, amount: string) {
    const result = await this.db
      .update(vaultBalances)
      .set({
        offchainSpent: sql`${vaultBalances.offchainSpent}::numeric + ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vaultBalances.userId, userId),
          sql`(${vaultBalances.available}::numeric + ${vaultBalances.bonus}::numeric - ${vaultBalances.offchainSpent}::numeric) >= ${amount}::numeric`,
        ),
      )
      .returning();

    if (result.length === 0) {
      logger.warn({ userId, amount }, 'deductBalance: insufficient effective balance');
      return null;
    }

    return result[0];
  }

  /**
   * Get off-chain balance columns (offchain_spent + bonus) from DB.
   * Used by the balance endpoint to adjust chain-derived available balance.
   */
  async getOffchainBalances(userId: string): Promise<{ offchainSpent: string; bonus: string }> {
    const balance = await this.db.query.vaultBalances.findFirst({
      where: eq(vaultBalances.userId, userId),
      columns: { offchainSpent: true, bonus: true },
    });
    return {
      offchainSpent: balance?.offchainSpent ?? '0',
      bonus: balance?.bonus ?? '0',
    };
  }

  /**
   * Refund off-chain payment by decrementing offchain_spent.
   * Used when admin rejects a sponsored announcement/raffle, etc.
   * Clamps offchain_spent to 0 to prevent negative values.
   */
  async creditAvailable(userId: string, amount: string) {
    const result = await this.db
      .update(vaultBalances)
      .set({
        offchainSpent: sql`GREATEST(0, ${vaultBalances.offchainSpent}::numeric - ${amount}::numeric)`,
        updatedAt: new Date(),
      })
      .where(eq(vaultBalances.userId, userId))
      .returning();

    if (result.length === 0) {
      // User has no balance row — nothing to refund (edge case)
      logger.warn({ userId, amount }, 'creditAvailable: no balance row found for refund');
      return;
    }

    logger.info(
      { userId, amount, offchainSpent: result[0]?.offchainSpent },
      'Refund: offchain_spent decremented',
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
