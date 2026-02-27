/**
 * VIP Service — manages VIP subscriptions, boost limits, and tier lookups.
 *
 * Subscription purchase deducts from user's available balance (not bonus)
 * and records revenue in treasury_ledger.
 */

import crypto from 'node:crypto';
import { eq, sql, and, gt, isNull } from 'drizzle-orm';
import { vipSubscriptions, vipConfig, boostUsage, treasuryLedger } from '@coinflip/db/schema';
import { VIP_DURATION_DAYS, BOOST_LIMITS } from '@coinflip/shared/constants';
import type { VipTier } from '@coinflip/shared/constants';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { Errors } from '../lib/errors.js';
import { vaultService } from './vault.service.js';

/** Simple LRU-ish cache for active VIP tier lookups (60s TTL) */
const vipCache = new Map<string, { tier: VipTier; expiresAt: string; cachedAt: number }>();
const VIP_CACHE_TTL_MS = 60_000;

class VipService {
  /**
   * Get the user's active VIP tier (with caching).
   * Returns null if no active subscription.
   */
  async getActiveVip(userId: string): Promise<{ tier: VipTier; expiresAt: string } | null> {
    // Check cache
    const cached = vipCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < VIP_CACHE_TTL_MS) {
      // Double-check not expired
      if (new Date(cached.expiresAt) > new Date()) {
        return { tier: cached.tier, expiresAt: cached.expiresAt };
      }
      vipCache.delete(userId);
    }

    const db = getDb();
    const nowIso = new Date().toISOString();

    const [sub] = await db
      .select({ tier: vipSubscriptions.tier, expiresAt: vipSubscriptions.expiresAt })
      .from(vipSubscriptions)
      .where(
        and(
          eq(vipSubscriptions.userId, userId),
          isNull(vipSubscriptions.canceledAt),
          gt(vipSubscriptions.expiresAt, sql`${nowIso}::timestamptz`),
        ),
      )
      .orderBy(sql`${vipSubscriptions.expiresAt} DESC`)
      .limit(1);

    if (!sub) {
      vipCache.delete(userId);
      return null;
    }

    const result = {
      tier: sub.tier as VipTier,
      expiresAt: sub.expiresAt instanceof Date ? sub.expiresAt.toISOString() : String(sub.expiresAt),
    };

    vipCache.set(userId, { ...result, cachedAt: Date.now() });
    return result;
  }

  /** Invalidate cache for a user (after purchase/revoke). */
  invalidateCache(userId: string): void {
    vipCache.delete(userId);
  }

  /**
   * Purchase a VIP subscription.
   * Deducts price from available balance, records treasury revenue.
   */
  async purchaseVip(userId: string, tier: VipTier): Promise<{ expiresAt: string }> {
    const db = getDb();

    // Get tier config + price
    const [config] = await db
      .select({ price: vipConfig.price, isActive: vipConfig.isActive })
      .from(vipConfig)
      .where(eq(vipConfig.tier, tier))
      .limit(1);

    if (!config || config.isActive !== 1) {
      throw Errors.validationError(`VIP tier "${tier}" is not available`);
    }

    const price = config.price;

    // Check if user already has active VIP of same or higher tier
    const existing = await this.getActiveVip(userId);
    if (existing) {
      const tierOrder: Record<VipTier, number> = { silver: 1, gold: 2, diamond: 3 };
      if (tierOrder[existing.tier] >= tierOrder[tier]) {
        throw Errors.validationError(`You already have an active ${existing.tier} subscription`);
      }
      // Upgrading: cancel old subscription
      await db
        .update(vipSubscriptions)
        .set({ canceledAt: new Date() })
        .where(
          and(
            eq(vipSubscriptions.userId, userId),
            isNull(vipSubscriptions.canceledAt),
            gt(vipSubscriptions.expiresAt, sql`NOW()`),
          ),
        );
    }

    // Atomic deduct from available balance
    const deducted = await vaultService.deductBalance(userId, price);
    if (!deducted) {
      throw Errors.insufficientBalance(price, '(check your balance)');
    }

    // Calculate expiry
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + VIP_DURATION_DAYS * 24 * 60 * 60 * 1000);

    // Insert subscription
    await db.insert(vipSubscriptions).values({
      userId,
      tier,
      pricePaid: price,
      startedAt,
      expiresAt,
    });

    // Record revenue in treasury ledger
    await db.insert(treasuryLedger).values({
      txhash: `vip_${crypto.randomUUID()}`,
      amount: price,
      denom: 'COIN',
      source: 'vip_subscription',
    });

    // Invalidate cache
    this.invalidateCache(userId);

    logger.info({ userId, tier, price, expiresAt: expiresAt.toISOString() }, 'VIP subscription purchased');
    return { expiresAt: expiresAt.toISOString() };
  }

  /**
   * Get boost usage for today and the user's limit.
   */
  async getBoostInfo(userId: string): Promise<{ used: number; limit: number | null }> {
    const db = getDb();

    // Count today's boosts
    const [countResult] = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM boost_usage
      WHERE user_id = ${userId}
        AND used_at >= NOW() - INTERVAL '24 hours'
    `) as unknown as [{ cnt: number }];

    const used = countResult?.cnt ?? 0;

    // Get VIP tier for limit
    const vip = await this.getActiveVip(userId);
    const tier = vip?.tier ?? 'free';
    const limit = BOOST_LIMITS[tier as keyof typeof BOOST_LIMITS] ?? BOOST_LIMITS.free;

    return { used, limit };
  }

  /**
   * Get VIP tier config (prices, active status) — public endpoint.
   */
  async getConfig(): Promise<Array<{ tier: string; price: string; isActive: boolean }>> {
    const db = getDb();
    const rows = await db
      .select({ tier: vipConfig.tier, price: vipConfig.price, isActive: vipConfig.isActive })
      .from(vipConfig)
      .orderBy(vipConfig.price);

    return rows.map((r) => ({
      tier: r.tier,
      price: r.price,
      isActive: r.isActive === 1,
    }));
  }

  // ─── Admin Methods ──────────────────────────────────

  /** Admin: revoke a user's VIP subscription. */
  async revokeVip(userId: string): Promise<void> {
    const db = getDb();
    await db
      .update(vipSubscriptions)
      .set({ canceledAt: new Date() })
      .where(
        and(
          eq(vipSubscriptions.userId, userId),
          isNull(vipSubscriptions.canceledAt),
          gt(vipSubscriptions.expiresAt, sql`NOW()`),
        ),
      );
    this.invalidateCache(userId);
    logger.info({ userId }, 'Admin: VIP revoked');
  }

  /** Admin: grant VIP subscription (free). */
  async grantVip(userId: string, tier: VipTier, days: number): Promise<void> {
    const db = getDb();
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + days * 24 * 60 * 60 * 1000);

    // Cancel any existing active sub
    await db
      .update(vipSubscriptions)
      .set({ canceledAt: new Date() })
      .where(
        and(
          eq(vipSubscriptions.userId, userId),
          isNull(vipSubscriptions.canceledAt),
          gt(vipSubscriptions.expiresAt, sql`NOW()`),
        ),
      );

    await db.insert(vipSubscriptions).values({
      userId,
      tier,
      pricePaid: '0', // free grant
      startedAt,
      expiresAt,
    });

    this.invalidateCache(userId);
    logger.info({ userId, tier, days, expiresAt: expiresAt.toISOString() }, 'Admin: VIP granted');
  }

  /** Admin: update tier config (price, active status). */
  async updateConfig(tier: string, updates: { price?: string; isActive?: boolean }): Promise<void> {
    const db = getDb();
    const setFields: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.price !== undefined) setFields.price = updates.price;
    if (updates.isActive !== undefined) setFields.isActive = updates.isActive ? 1 : 0;

    await db
      .update(vipConfig)
      .set(setFields as typeof vipConfig.$inferInsert)
      .where(eq(vipConfig.tier, tier));

    logger.info({ tier, updates }, 'Admin: VIP config updated');
  }

  /** Admin: get all VIP subscribers with stats. */
  async getSubscribers(limit = 50, offset = 0) {
    const db = getDb();

    const rows = await db.execute(sql`
      SELECT
        vs.id, vs.user_id, vs.tier, vs.price_paid, vs.started_at, vs.expires_at,
        u.address, u.profile_nickname
      FROM vip_subscriptions vs
      INNER JOIN users u ON u.id = vs.user_id
      WHERE vs.canceled_at IS NULL AND vs.expires_at > NOW()
      ORDER BY vs.started_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as unknown as Array<{
      id: string;
      user_id: string;
      tier: string;
      price_paid: string;
      started_at: Date | string;
      expires_at: Date | string;
      address: string;
      profile_nickname: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      tier: r.tier,
      pricePaid: r.price_paid,
      startedAt: r.started_at instanceof Date ? r.started_at.toISOString() : String(r.started_at),
      expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : String(r.expires_at),
      address: r.address,
      nickname: r.profile_nickname,
    }));
  }

  /** Admin: get VIP stats (revenue, subscriber counts). */
  async getStats() {
    const db = getDb();

    const [stats] = await db.execute(sql`
      SELECT
        COUNT(CASE WHEN canceled_at IS NULL AND expires_at > NOW() THEN 1 END)::int AS active_count,
        COUNT(CASE WHEN canceled_at IS NULL AND expires_at > NOW() AND tier = 'silver' THEN 1 END)::int AS silver_count,
        COUNT(CASE WHEN canceled_at IS NULL AND expires_at > NOW() AND tier = 'gold' THEN 1 END)::int AS gold_count,
        COUNT(CASE WHEN canceled_at IS NULL AND expires_at > NOW() AND tier = 'diamond' THEN 1 END)::int AS diamond_count,
        COALESCE(SUM(price_paid::numeric), 0)::text AS total_revenue,
        COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN price_paid::numeric ELSE 0 END), 0)::text AS week_revenue
      FROM vip_subscriptions
    `) as unknown as [{
      active_count: number;
      silver_count: number;
      gold_count: number;
      diamond_count: number;
      total_revenue: string;
      week_revenue: string;
    }];

    return stats ?? {
      active_count: 0,
      silver_count: 0,
      gold_count: 0,
      diamond_count: 0,
      total_revenue: '0',
      week_revenue: '0',
    };
  }
}

export const vipService = new VipService();
