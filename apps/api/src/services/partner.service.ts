/**
 * Partner Service — manages partner treasury commissions.
 *
 * Each active partner earns a configurable BPS of every resolved bet's pot.
 * Earnings are tracked in partner_ledger (idempotent via unique constraint).
 */

import { eq, sql, desc, and } from 'drizzle-orm';
import { partnerConfig, partnerLedger } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

/** Cached active partners (60s TTL) */
let partnersCache: { partners: Array<{ id: string; name: string; address: string; bps: number }>; cachedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

class PartnerService {
  /** Get active partners (cached) */
  async getActivePartners() {
    if (partnersCache && Date.now() - partnersCache.cachedAt < CACHE_TTL_MS) {
      return partnersCache.partners;
    }

    const db = getDb();
    const rows = await db
      .select({
        id: partnerConfig.id,
        name: partnerConfig.name,
        address: partnerConfig.address,
        bps: partnerConfig.bps,
      })
      .from(partnerConfig)
      .where(eq(partnerConfig.isActive, 1));

    partnersCache = { partners: rows, cachedAt: Date.now() };
    return rows;
  }

  /**
   * Process partner commission for a resolved bet.
   * Idempotent via UNIQUE(partner_id, bet_id).
   */
  async processBetCommission(betId: bigint, totalPot: bigint): Promise<void> {
    const partners = await this.getActivePartners();
    if (partners.length === 0) return;

    const db = getDb();

    for (const partner of partners) {
      if (partner.bps <= 0) continue;

      const amount = (totalPot * BigInt(partner.bps)) / 10000n;
      if (amount <= 0n) continue;

      try {
        await db
          .insert(partnerLedger)
          .values({
            partnerId: partner.id,
            betId,
            amount: amount.toString(),
          })
          .onConflictDoNothing(); // idempotent

        logger.debug(
          { partnerId: partner.id, betId: betId.toString(), amount: amount.toString() },
          'Partner commission recorded',
        );
      } catch (err) {
        logger.warn({ err, partnerId: partner.id, betId: betId.toString() }, 'Partner commission insert failed');
      }
    }
  }

  /** Get all partners (admin) */
  async getAllPartners() {
    const db = getDb();
    const rows = await db
      .select()
      .from(partnerConfig)
      .orderBy(desc(partnerConfig.createdAt));

    // Attach total earned per partner
    const partnerIds = rows.map((r) => r.id);
    const earningsMap = new Map<string, string>();

    if (partnerIds.length > 0) {
      const earningsRows = await db.execute(sql`
        SELECT partner_id, COALESCE(SUM(amount::numeric), 0)::text AS total
        FROM partner_ledger
        GROUP BY partner_id
      `) as unknown as Array<{ partner_id: string; total: string }>;
      for (const e of earningsRows) {
        earningsMap.set(e.partner_id, e.total);
      }
    }

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      bps: r.bps,
      isActive: r.isActive,
      totalEarned: earningsMap.get(r.id) ?? '0',
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /** Add a new partner */
  async addPartner(name: string, address: string, bps: number) {
    const db = getDb();
    const [row] = await db
      .insert(partnerConfig)
      .values({ name, address, bps })
      .returning();
    this.invalidateCache();
    return row!;
  }

  /** Update partner */
  async updatePartner(id: string, updates: { name?: string; address?: string; bps?: number; isActive?: number }) {
    const db = getDb();
    await db
      .update(partnerConfig)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(partnerConfig.id, id));
    this.invalidateCache();
  }

  /** Deactivate partner */
  async deactivatePartner(id: string) {
    await this.updatePartner(id, { isActive: 0 });
  }

  /** Get partner ledger (paginated) */
  async getPartnerLedger(partnerId: string, limit: number, offset: number) {
    const db = getDb();
    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(partnerLedger)
        .where(eq(partnerLedger.partnerId, partnerId))
        .orderBy(desc(partnerLedger.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(partnerLedger)
        .where(eq(partnerLedger.partnerId, partnerId)),
    ]);

    return {
      rows: rows.map((r) => ({
        id: r.id,
        betId: r.betId.toString(),
        amount: r.amount,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      total: countResult[0]?.count ?? 0,
    };
  }

  /** Get partner stats */
  async getPartnerStats(partnerId: string) {
    const db = getDb();
    const [stats] = await db.execute(sql`
      SELECT
        COALESCE(SUM(amount::numeric), 0)::text AS total_earned,
        COUNT(*)::int AS total_bets,
        COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN amount::numeric ELSE 0 END), 0)::text AS week_earned,
        COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN amount::numeric ELSE 0 END), 0)::text AS day_earned
      FROM partner_ledger
      WHERE partner_id = ${partnerId}
    `) as unknown as Array<{ total_earned: string; total_bets: number; week_earned: string; day_earned: string }>;

    return stats ?? { total_earned: '0', total_bets: 0, week_earned: '0', day_earned: '0' };
  }

  private invalidateCache() {
    partnersCache = null;
  }
}

export const partnerService = new PartnerService();
