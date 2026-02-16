import { eq, and, sql, desc } from 'drizzle-orm';
import {
  referralCodes,
  referrals,
  referralRewards,
  referralBalances,
  users,
  vaultBalances,
} from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { randomBytes } from 'node:crypto';

/** Cost to change referral branch, in micro-LAUNCH (1000 LAUNCH = 1_000_000_000 micro) */
const CHANGE_BRANCH_COST_MICRO = '1000000000';

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
   * Auto-assign a user to the default referrer (admin) if they have no referrer yet.
   * Called after wallet connect when the user didn't come via a referral link.
   *
   * The admin address is taken from ADMIN_ADDRESSES env var (first address).
   * If the admin has no referral code yet, one is created automatically.
   *
   * Skips silently if:
   * - No admin address configured
   * - User IS the admin
   * - User already has a referrer
   */
  async autoAssignDefaultReferrer(userId: string): Promise<void> {
    const tag = 'referral:auto-assign';

    // Get admin address (first one from comma-separated list)
    const adminAddr = env.ADMIN_ADDRESSES.split(',').map(a => a.trim()).filter(Boolean)[0];
    if (!adminAddr) return;

    // Check if user already has a referrer
    const existingRef = await this.db.query.referrals.findFirst({
      where: eq(referrals.userId, userId),
    });
    if (existingRef) return; // Already has a referrer

    // Find admin user
    const adminUser = await this.db.query.users.findFirst({
      where: eq(users.address, adminAddr),
    });
    if (!adminUser) {
      logger.warn({ adminAddr }, `${tag} — admin user not found in DB`);
      return;
    }

    // Don't self-refer
    if (adminUser.id === userId) return;

    // Get or create admin's referral code
    const adminCode = await this.getOrCreateCode(adminUser.id);

    // Register the referral
    try {
      await this.db.insert(referrals).values({
        userId,
        referrerUserId: adminUser.id,
        code: adminCode,
      });

      // Update legacy referrer address field
      await this.db
        .update(users)
        .set({ referrerAddress: adminAddr })
        .where(eq(users.id, userId));

      logger.info({ userId, adminId: adminUser.id, code: adminCode }, `${tag} — user auto-assigned to admin`);
    } catch {
      // Unique constraint — user already has a referrer (race condition), which is fine
    }
  }

  /**
   * Register a referral by referrer wallet address (instead of code).
   * Used when user manually enters "who invited you" during registration.
   *
   * Returns: { success: true } | { success: false, reason: string }
   */
  async registerByAddress(
    userId: string,
    referrerAddress: string,
  ): Promise<{ success: boolean; reason?: string }> {
    // Find referrer user by address
    const referrer = await this.db.query.users.findFirst({
      where: eq(users.address, referrerAddress.trim()),
    });
    if (!referrer) {
      return { success: false, reason: 'USER_NOT_FOUND' };
    }

    // Prevent self-referral
    if (referrer.id === userId) {
      return { success: false, reason: 'SELF_REFERRAL' };
    }

    // Check if user already has a referrer
    const existing = await this.db.query.referrals.findFirst({
      where: eq(referrals.userId, userId),
    });
    if (existing) {
      return { success: false, reason: 'ALREADY_HAS_REFERRER' };
    }

    // Get or create referrer's code
    const code = await this.getOrCreateCode(referrer.id);

    try {
      await this.db.insert(referrals).values({
        userId,
        referrerUserId: referrer.id,
        code,
      });

      await this.db
        .update(users)
        .set({ referrerAddress: referrer.address })
        .where(eq(users.id, userId));

      logger.info({ userId, referrerId: referrer.id, address: referrerAddress }, 'Referral registered by address');
      return { success: true };
    } catch {
      return { success: false, reason: 'ALREADY_HAS_REFERRER' };
    }
  }

  /**
   * Check if a user already has a referrer.
   */
  async hasReferrer(userId: string): Promise<boolean> {
    const existing = await this.db.query.referrals.findFirst({
      where: eq(referrals.userId, userId),
    });
    return !!existing;
  }

  /**
   * Change referral branch (paid feature).
   * Costs CHANGE_BRANCH_COST_MICRO from user's available vault balance.
   * The funds go to the treasury (platform revenue).
   *
   * Returns: { success: true } | { success: false, reason: string }
   */
  async changeBranch(
    userId: string,
    newReferrerAddress: string,
  ): Promise<{ success: boolean; reason?: string; cost?: string }> {
    const tag = 'referral:change-branch';

    // Find new referrer
    const newReferrer = await this.db.query.users.findFirst({
      where: eq(users.address, newReferrerAddress.trim()),
    });
    if (!newReferrer) {
      return { success: false, reason: 'USER_NOT_FOUND' };
    }

    if (newReferrer.id === userId) {
      return { success: false, reason: 'SELF_REFERRAL' };
    }

    // Check for cycles: walk up the chain from newReferrer to see if userId appears
    // (would create a cycle: A → B → ... → A)
    let cursor = newReferrer.id;
    const visited = new Set<string>([userId]);
    for (let i = 0; i < 20; i++) {
      const ref = await this.db.query.referrals.findFirst({
        where: eq(referrals.userId, cursor),
      });
      if (!ref) break;
      if (visited.has(ref.referrerUserId)) {
        return { success: false, reason: 'WOULD_CREATE_CYCLE' };
      }
      visited.add(ref.referrerUserId);
      cursor = ref.referrerUserId;
    }

    // Deduct cost from available balance (atomic)
    const deductResult = await this.db
      .update(vaultBalances)
      .set({
        available: sql`${vaultBalances.available}::numeric - ${CHANGE_BRANCH_COST_MICRO}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vaultBalances.userId, userId),
          sql`${vaultBalances.available}::numeric >= ${CHANGE_BRANCH_COST_MICRO}::numeric`,
        ),
      )
      .returning();

    if (deductResult.length === 0) {
      return { success: false, reason: 'INSUFFICIENT_BALANCE' };
    }

    // Credit treasury
    const treasuryAddr = env.TREASURY_ADDRESS;
    if (treasuryAddr) {
      const treasuryUser = await this.db.query.users.findFirst({
        where: eq(users.address, treasuryAddr),
      });
      if (treasuryUser) {
        await this.db
          .update(vaultBalances)
          .set({
            available: sql`${vaultBalances.available}::numeric + ${CHANGE_BRANCH_COST_MICRO}::numeric`,
            updatedAt: new Date(),
          })
          .where(eq(vaultBalances.userId, treasuryUser.id));
      }
    }

    // Get or create new referrer's code
    const newCode = await this.getOrCreateCode(newReferrer.id);

    // Delete existing referral (if any)
    await this.db.delete(referrals).where(eq(referrals.userId, userId));

    // Insert new referral
    await this.db.insert(referrals).values({
      userId,
      referrerUserId: newReferrer.id,
      code: newCode,
    });

    // Update legacy field
    await this.db
      .update(users)
      .set({ referrerAddress: newReferrer.address })
      .where(eq(users.id, userId));

    logger.info(
      { userId, newReferrerId: newReferrer.id, address: newReferrerAddress, cost: CHANGE_BRANCH_COST_MICRO },
      `${tag} — branch changed`,
    );

    return { success: true, cost: CHANGE_BRANCH_COST_MICRO };
  }

  /**
   * Get user's current referrer info (address + nickname).
   */
  async getCurrentReferrer(userId: string): Promise<{ address: string; nickname: string | null } | null> {
    const ref = await this.db.query.referrals.findFirst({
      where: eq(referrals.userId, userId),
    });
    if (!ref) return null;

    const referrer = await this.db.query.users.findFirst({
      where: eq(users.id, ref.referrerUserId),
    });
    if (!referrer) return null;

    return { address: referrer.address, nickname: referrer.profileNickname };
  }

  /**
   * Walk up the referral chain (max 3 levels) starting from a player.
   * Returns an array of { userId, level } for each referrer in the chain.
   * Includes cycle detection to prevent infinite loops.
   */
  async getReferralChain(playerUserId: string): Promise<Array<{ userId: string; level: number }>> {
    const chain: Array<{ userId: string; level: number }> = [];
    const visited = new Set<string>([playerUserId]);
    let currentUserId = playerUserId;

    for (let level = 1; level <= MAX_REFERRAL_DEPTH; level++) {
      const ref = await this.db.query.referrals.findFirst({
        where: eq(referrals.userId, currentUserId),
      });
      if (!ref) break;

      // Cycle detection: if we've already visited this referrer, stop
      if (visited.has(ref.referrerUserId)) {
        logger.warn({ playerUserId, cycle: ref.referrerUserId }, 'Referral chain cycle detected — stopping');
        break;
      }

      visited.add(ref.referrerUserId);
      chain.push({ userId: ref.referrerUserId, level });
      currentUserId = ref.referrerUserId;
    }

    return chain;
  }

  /**
   * Distribute referral rewards for a resolved bet.
   * Called once per bet resolution, processes BOTH players (maker + acceptor).
   *
   * IDEMPOTENT: checks if rewards already exist for this betId before inserting.
   * Safe to call multiple times (from both indexer and background tasks).
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
    const betIdStr = betId.toString();

    // ─── Idempotency guard: skip if rewards already distributed for this bet ───
    const existingRewards = await this.db
      .select({ id: referralRewards.id })
      .from(referralRewards)
      .where(eq(referralRewards.betId, betIdStr))
      .limit(1);

    if (existingRewards.length > 0) {
      logger.debug({ betId: betIdStr }, `${tag} — rewards already distributed, skipping (idempotent)`);
      return;
    }

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
          betId: betIdStr,
          amount: amount.toString(),
          level,
        });

        // Upsert referral balance (on insert: set initial values; on conflict: increment)
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
          { referrerId, amount: amount.toString(), level, betId: betIdStr, fromPlayer },
          `${tag} — reward credited`,
        );
      } catch (err) {
        logger.error({ err, referrerId, betId: betIdStr, level }, `${tag} — failed to credit reward`);
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
   * Uses atomic CAS (compare-and-swap) to prevent double-claims.
   * Returns the claimed amount, or null if nothing to claim.
   */
  async claimRewards(userId: string): Promise<string | null> {
    const balance = await this.db.query.referralBalances.findFirst({
      where: eq(referralBalances.userId, userId),
    });

    if (!balance || BigInt(balance.unclaimed) <= 0n) return null;

    const amount = balance.unclaimed;

    // Atomic CAS: only zero out if unclaimed still matches (prevents double-claim race)
    const updated = await this.db
      .update(referralBalances)
      .set({ unclaimed: '0', updatedAt: new Date() })
      .where(
        and(
          eq(referralBalances.userId, userId),
          sql`${referralBalances.unclaimed}::numeric = ${amount}::numeric`,
        ),
      )
      .returning();

    if (updated.length === 0) {
      logger.warn({ userId, amount }, 'Referral claim CAS failed — concurrent claim detected');
      return null;
    }

    // Credit to vault available balance
    const vaultUpdated = await this.db
      .update(vaultBalances)
      .set({
        available: sql`${vaultBalances.available}::numeric + ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(vaultBalances.userId, userId))
      .returning();

    if (vaultUpdated.length === 0) {
      // Vault row doesn't exist — rollback the claim
      logger.error({ userId, amount }, 'Referral claim: vault balance row not found — rolling back');
      await this.db
        .update(referralBalances)
        .set({
          unclaimed: sql`${referralBalances.unclaimed}::numeric + ${amount}::numeric`,
          updatedAt: new Date(),
        })
        .where(eq(referralBalances.userId, userId));
      return null;
    }

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
