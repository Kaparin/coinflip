import { eq, sql } from 'drizzle-orm';
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
    await this.db
      .insert(vaultBalances)
      .values({ userId, available, locked, sourceHeight: height })
      .onConflictDoUpdate({
        target: vaultBalances.userId,
        set: {
          available,
          locked,
          sourceHeight: height,
          updatedAt: new Date(),
        },
      });

    logger.info({ userId, available, locked, height: height.toString() }, 'Vault balance synced');
  }

  async lockFunds(userId: string, amount: string) {
    const amountBig = BigInt(amount);

    const result = await this.db
      .update(vaultBalances)
      .set({
        available: sql`${vaultBalances.available}::numeric - ${amount}::numeric`,
        locked: sql`${vaultBalances.locked}::numeric + ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(vaultBalances.userId, userId))
      .returning();

    return result[0];
  }

  async unlockFunds(userId: string, amount: string) {
    const result = await this.db
      .update(vaultBalances)
      .set({
        available: sql`${vaultBalances.available}::numeric + ${amount}::numeric`,
        locked: sql`${vaultBalances.locked}::numeric - ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(vaultBalances.userId, userId))
      .returning();

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
