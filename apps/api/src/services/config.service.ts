/**
 * Config Service — dynamic platform configuration with caching.
 *
 * Reads from `platform_config` table with 60s LRU cache.
 * Falls back to constants.ts defaults when keys are missing.
 */

import { eq, sql } from 'drizzle-orm';
import { platformConfig, partnerConfig } from '@coinflip/db/schema';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

interface CacheEntry {
  value: string;
  valueType: string;
  cachedAt: number;
}

const CACHE_TTL_MS = 60_000;

class ConfigService {
  private cache = new Map<string, CacheEntry>();
  private allCache: { entries: Array<{ key: string; value: string; valueType: string; description: string | null; category: string; updatedAt: string; updatedBy: string | null }>; cachedAt: number } | null = null;

  /** Get raw string value for a key, or fallback */
  async getString(key: string, fallback: string): Promise<string> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.value;
    }

    const db = getDb();
    const [row] = await db
      .select({ value: platformConfig.value, valueType: platformConfig.valueType })
      .from(platformConfig)
      .where(eq(platformConfig.key, key))
      .limit(1);

    if (!row) return fallback;

    this.cache.set(key, { value: row.value, valueType: row.valueType, cachedAt: Date.now() });
    return row.value;
  }

  /** Get number value */
  async getNumber(key: string, fallback: number): Promise<number> {
    const val = await this.getString(key, String(fallback));
    const n = Number(val);
    return Number.isNaN(n) ? fallback : n;
  }

  /** Get boolean value */
  async getBoolean(key: string, fallback: boolean): Promise<boolean> {
    const val = await this.getString(key, String(fallback));
    return val === 'true' || val === '1';
  }

  /** Get JSON value */
  async getJson<T>(key: string, fallback: T): Promise<T> {
    const val = await this.getString(key, '');
    if (!val) return fallback;
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }

  /** Load all config entries (for admin panel) */
  async getAll() {
    if (this.allCache && Date.now() - this.allCache.cachedAt < CACHE_TTL_MS) {
      return this.allCache.entries;
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(platformConfig)
      .orderBy(platformConfig.category, platformConfig.key);

    const entries = rows.map((r) => ({
      key: r.key,
      value: r.value,
      valueType: r.valueType,
      description: r.description,
      category: r.category,
      updatedAt: r.updatedAt.toISOString(),
      updatedBy: r.updatedBy,
    }));

    this.allCache = { entries, cachedAt: Date.now() };
    return entries;
  }

  /** Get config by category */
  async getByCategory(category: string) {
    const all = await this.getAll();
    return all.filter((e) => e.category === category);
  }

  /** Update a single config key */
  async set(key: string, value: string, updatedBy: string): Promise<void> {
    const db = getDb();
    await db
      .update(platformConfig)
      .set({ value, updatedAt: new Date(), updatedBy })
      .where(eq(platformConfig.key, key));

    this.invalidateCache();
    logger.info({ key, value, updatedBy }, 'Config updated');
  }

  /** Bulk update config entries (transactional) */
  async bulkSet(entries: Array<{ key: string; value: string }>, updatedBy: string): Promise<void> {
    const db = getDb();
    await db.transaction(async (tx) => {
      for (const entry of entries) {
        await tx
          .update(platformConfig)
          .set({ value: entry.value, updatedAt: new Date(), updatedBy })
          .where(eq(platformConfig.key, entry.key));
      }
    });
    this.invalidateCache();
    logger.info({ count: entries.length, updatedBy }, 'Config bulk updated');
  }

  /** Invalidate all caches */
  invalidateCache(): void {
    this.cache.clear();
    this.allCache = null;
  }

  /** Check maintenance mode */
  async isMaintenanceMode(): Promise<boolean> {
    return this.getBoolean('MAINTENANCE_MODE', false);
  }

  /** Get maintenance message */
  async getMaintenanceMessage(): Promise<string> {
    return this.getString('MAINTENANCE_MESSAGE', '');
  }

  /**
   * Validate that total commission distribution doesn't exceed COMMISSION_BPS.
   * Returns breakdown + validity.
   */
  async validateCommissionDistribution(): Promise<{
    valid: boolean;
    breakdown: {
      commissionBps: number;
      referralMaxBps: number;
      jackpotBps: number;
      partnerBps: number;
      treasuryBps: number;
      totalAllocated: number;
    };
    error?: string;
  }> {
    const db = getDb();

    const commissionBps = await this.getNumber('COMMISSION_BPS', 1000);
    const referralMaxBps = await this.getNumber('MAX_REFERRAL_BPS_PER_BET', 500);
    const jackpotBps = await this.getNumber('JACKPOT_TOTAL_BPS', 100);

    const [partnerRow] = await db
      .select({ totalBps: sql<number>`COALESCE(SUM(bps), 0)::int` })
      .from(partnerConfig)
      .where(eq(partnerConfig.isActive, 1));
    const partnerBps = partnerRow?.totalBps ?? 0;

    const totalAllocated = referralMaxBps + jackpotBps + partnerBps;
    const treasuryBps = commissionBps - totalAllocated;

    return {
      valid: totalAllocated <= commissionBps && treasuryBps >= 0,
      breakdown: {
        commissionBps,
        referralMaxBps,
        jackpotBps,
        partnerBps,
        treasuryBps: Math.max(0, treasuryBps),
        totalAllocated,
      },
      error: totalAllocated > commissionBps
        ? `Total allocated (${totalAllocated} BPS) exceeds commission (${commissionBps} BPS)`
        : undefined,
    };
  }
}

export const configService = new ConfigService();
