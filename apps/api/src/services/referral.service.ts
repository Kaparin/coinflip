import { eq, sql, desc } from 'drizzle-orm';
import {
  referralCodes,
  referrals,
  referralRewards,
  referralBalances,
  users,
} from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { randomBytes } from 'node:crypto';

/**
 * Referral reward percentages from the TOTAL POT (2 × bet amount).
 * These come out of the 10% platform commission (20 LAUNCH on a 200 pot).
 *
 * Level 1 (direct): 3% of pot  → 30% of commission
 * Level 2:          1.5% of pot → 15% of commission
 * Level 3:          0.5% of pot →  5% of commission
 * Platform keeps:   5% of pot  → 50% of commission
 */
const REWARD_BPS_BY_LEVEL: Record<number, bigint> = {
  1: 300n,  // 3%   (300 basis points)
  2: 150n,  // 1.5% (150 basis points)
  3: 50n,   // 0.5% (50 basis points)
};

const MAX_REFERRAL_DEPTH = 3;

function generateCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

export class ReferralService {
  private db = getDb();

  /**
   * Get or create a referral code for a user.
   */
  async getOrCreateCode(userId: string): Promise<string> {
    const existing = await this.db.query.referralCodes.findFirst({
      where: eq(referralCodes.ownerUserId, userId),
    });
    if (existing) return existing.code;

    let code = generateCode();
    let attempts = 0;
    while (attempts < 10) {
      try {
        await this.db.insert(referralCodes).values({ code, ownerUserId: userId });
        return code;
      } catch {
        code = generateCode();
        attempts++;
      }
    }
    throw new Error('Failed to generate unique referral code');
  }

  /**
   * Register a referral: link a new user to their referrer via code.
   * Returns true if registered, false if already has a referrer or code invalid.
   */
  async registerReferral(userId: string, code: string): Promise<boolean> {
    const codeRow = await this.db.query.referralCodes.findFirst({
      where: eq(referralCodes.code, code.toUpperCase()),
    });
    if (!codeRow) return false;

    // Prevent self-referral
    if (codeRow.ownerUserId === userId) return false;

    // Check if user already has a referrer
    const existing = await this.db.query.referrals.findFirst({
      where: eq(referrals.userId, userId),
    });
    if (existing) return false;

    try {
      await this.db.insert(referrals).values({
        userId,
        referrerUserId: codeRow.ownerUserId,
        code: code.toUpperCase(),
      });

      // Update legacy field too
      const user = await this.db.query.users.findFirst({
        where: eq(users.id, codeRow.ownerUserId),
      });
      if (user) {
        await this.db
          .update(users)
          .set({ referrerAddress: user.address })
          .where(eq(users.id, userId));
      }

      logger.info({ userId, referrerId: codeRow.ownerUserId, code }, 'Referral registered');
      return true;
    } catch {
      return false; // Unique constraint violation
    }
  }

  /**
   * Walk up the referral chain (max 3 levels) starting from a player.
   * Returns an array of { userId, level } for each referrer in the chain.
   */
  async getReferralChain(playerUserId: string): Promise<Array<{ userId: string; level: number }>> {
    const chain: Array<{ userId: string; level: number }> = [];
    let currentUserId = playerUserId;

    for (let level = 1; level <= MAX_REFERRAL_DEPTH; level++) {
      const ref = await this.db.query.referrals.findFirst({
        where: eq(referrals.userId, currentUserId),
      });
      if (!ref) break;

      chain.push({ userId: ref.referrerUserId, level });
      currentUserId = ref.referrerUserId;
    }

    return chain;
  }

  /**
   * Distribute referral rewards for a resolved bet.
   * Called once per bet resolution, processes BOTH players (maker + acceptor).
   *
   * @param betId - The resolved bet ID
   * @param totalPot - Total pot in micro LAUNCH (2 × bet amount)
   * @param makerUserId - Maker's user ID
   * @param acceptorUserId - Acceptor's user ID
   */
  async distributeRewards(
    betId: bigint,
    totalPot: bigint,
    makerUserId: string,
    acceptorUserId: string,
  ): Promise<void> {
    const tag = 'referral:distribute';
    const players = [makerUserId, acceptorUserId];

    // Deduplicate referrers — a referrer who invited both players should only earn once per bet per level
    const rewardMap = new Map<string, { amount: bigint; level: number; fromPlayer: string }>();

    for (const playerId of players) {
      const chain = await this.getReferralChain(playerId);
      for (const { userId: referrerId, level } of chain) {
        const bps = REWARD_BPS_BY_LEVEL[level];
        if (!bps) continue;

        const reward = (totalPot * bps) / 10000n;
        if (reward <= 0n) continue;

        const key = `${referrerId}:${level}`;
        const existing = rewardMap.get(key);
        if (!existing || reward > existing.amount) {
          rewardMap.set(key, { amount: reward, level, fromPlayer: playerId });
        }
      }
    }

    if (rewardMap.size === 0) return;

    // Write rewards + update balances
    for (const [key, { amount, level, fromPlayer }] of rewardMap) {
      const referrerId = key.split(':')[0]!;
      try {
        // Record the reward event
        await this.db.insert(referralRewards).values({
          recipientUserId: referrerId,
          fromPlayerUserId: fromPlayer,
          betId: betId.toString(),
          amount: amount.toString(),
          level,
        });

        // Upsert referral balance
        await this.db
          .insert(referralBalances)
          .values({
            userId: referrerId,
            unclaimed: amount.toString(),
            totalEarned: amount.toString(),
          })
          .onConflictDoUpdate({
            target: referralBalances.userId,
            set: {
              unclaimed: sql`${referralBalances.unclaimed}::numeric + ${amount.toString()}::numeric`,
              totalEarned: sql`${referralBalances.totalEarned}::numeric + ${amount.toString()}::numeric`,
              updatedAt: new Date(),
            },
          });

        logger.info(
          { referrerId, amount: amount.toString(), level, betId: betId.toString(), fromPlayer },
          `${tag} — reward credited`,
        );
      } catch (err) {
        logger.error({ err, referrerId, betId: betId.toString(), level }, `${tag} — failed to credit reward`);
      }
    }
  }

  /**
   * Get referral balance for a user.
   */
  async getBalance(userId: string): Promise<{ unclaimed: string; totalEarned: string }> {
    const row = await this.db.query.referralBalances.findFirst({
      where: eq(referralBalances.userId, userId),
    });
    return {
      unclaimed: row?.unclaimed ?? '0',
      totalEarned: row?.totalEarned ?? '0',
    };
  }

  /**
   * Claim referral rewards: move unclaimed balance to vault available balance.
   * Returns the claimed amount, or null if nothing to claim.
   */
  async claimRewards(userId: string): Promise<string | null> {
    const balance = await this.db.query.referralBalances.findFirst({
      where: eq(referralBalances.userId, userId),
    });

    if (!balance || BigInt(balance.unclaimed) <= 0n) return null;

    const amount = balance.unclaimed;

    // Zero out unclaimed
    await this.db
      .update(referralBalances)
      .set({ unclaimed: '0', updatedAt: new Date() })
      .where(eq(referralBalances.userId, userId));

    // Credit to vault available balance
    const { vaultBalances } = await import('@coinflip/db/schema');
    await this.db
      .update(vaultBalances)
      .set({
        available: sql`${vaultBalances.available}::numeric + ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(vaultBalances.userId, userId));

    logger.info({ userId, amount }, 'Referral rewards claimed to vault');
    return amount;
  }

  /**
   * Get referral stats: direct invites, earnings by level, referral tree.
   */
  async getStats(userId: string) {
    // Direct invites (level 1)
    const directInvites = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(referrals)
      .where(eq(referrals.referrerUserId, userId));

    // Earnings by level
    const earningsByLevel = await this.db
      .select({
        level: referralRewards.level,
        total: sql<string>`sum(${referralRewards.amount}::numeric)::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(referralRewards)
      .where(eq(referralRewards.recipientUserId, userId))
      .groupBy(referralRewards.level);

    // Total team size (all levels)
    const teamSize = await this._countTeamSize(userId);

    return {
      directInvites: directInvites[0]?.count ?? 0,
      teamSize,
      earningsByLevel: earningsByLevel.map(e => ({
        level: e.level,
        totalEarned: e.total ?? '0',
        betCount: e.count,
      })),
    };
  }

  /**
   * Count total team size (users in referral tree, all levels).
   */
  private async _countTeamSize(userId: string): Promise<number> {
    const result = await this.db.execute(sql`
      with recursive team as (
        select user_id from referrals where referrer_user_id = ${userId}
        union all
        select r.user_id from referrals r join team t on r.referrer_user_id = t.user_id
      )
      select count(*)::int as size from team
    `);
    const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
    return (rows[0] as { size?: number })?.size ?? 0;
  }

  /**
   * Get reward history (paginated).
   */
  async getRewardHistory(userId: string, limit = 20, offset = 0) {
    const rows = await this.db
      .select({
        id: referralRewards.id,
        fromPlayer: users.address,
        betId: referralRewards.betId,
        amount: referralRewards.amount,
        level: referralRewards.level,
        createdAt: referralRewards.createdAt,
      })
      .from(referralRewards)
      .leftJoin(users, eq(users.id, referralRewards.fromPlayerUserId))
      .where(eq(referralRewards.recipientUserId, userId))
      .orderBy(desc(referralRewards.createdAt))
      .limit(limit)
      .offset(offset);

    return rows;
  }

  /**
   * Get direct referrals list (people you invited).
   */
  async getDirectReferrals(userId: string) {
    const rows = await this.db
      .select({
        address: users.address,
        joinedAt: referrals.createdAt,
      })
      .from(referrals)
      .innerJoin(users, eq(users.id, referrals.userId))
      .where(eq(referrals.referrerUserId, userId))
      .orderBy(desc(referrals.createdAt));

    return rows;
  }
}

export const referralService = new ReferralService();
