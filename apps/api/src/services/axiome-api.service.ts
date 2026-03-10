/**
 * Axiome Indexer API client.
 *
 * Fetches exchange rates from the Axiome ecosystem indexer
 * at api-idx.axiomechain.pro with failover to backup URLs.
 *
 * Note: /accounts/info/{address} does NOT return profile nicknames/avatars —
 * it only returns on-chain account data (balance, sequence). Axiome profile
 * data (nicknames, avatars) is stored in their private DB and not publicly accessible.
 */

import { logger } from '../lib/logger.js';

const AXIOME_IDX_URLS = [
  'https://api-idx.axiomechain.pro',
  'https://idx.ambdmn.com',
  'https://aback-d.ru',
];

const REQUEST_TIMEOUT = 5_000;

// ─── In-memory cache ────────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number): T {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

// ─── Low-level fetch with failover ──────────────────────────────

async function axiomeFetch(endpoint: string): Promise<unknown | null> {
  let lastError: unknown;

  for (let i = 0; i < AXIOME_IDX_URLS.length; i++) {
    const baseUrl = AXIOME_IDX_URLS[i];
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        headers: { Accept: 'application/json' },
      });
      if (res.status >= 500 && i < AXIOME_IDX_URLS.length - 1) {
        logger.warn({ baseUrl, endpoint, status: res.status }, 'Axiome IDX 5xx, trying fallback');
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      lastError = err;
      if (i < AXIOME_IDX_URLS.length - 1) {
        logger.debug({ baseUrl, endpoint, err }, 'Axiome IDX fetch failed, trying fallback');
      }
    }
  }

  logger.warn({ endpoint, err: lastError }, 'All Axiome IDX URLs failed');
  return null;
}

// ─── Exchange rates ─────────────────────────────────────────────

export interface AxiomeRates {
  /** AXM price in USD (e.g. 0.00486 = 1 AXM costs $0.00486) */
  axm_usd: number | null;
  /** AXM price in RUB (e.g. 0.384 = 1 AXM costs 0.384₽) */
  axm_rub: number | null;
  /** AXM price in EUR (e.g. 0.00417 = 1 AXM costs €0.00417) */
  axm_eur: number | null;
  /** All raw rates from the indexer */
  raw: Record<string, number>;
  updated_at: string;
}

/** Cache TTL for rates: 60 seconds */
const RATES_CACHE_TTL = 60_000;

/**
 * Fetch AXM exchange rates from Axiome indexer.
 *
 * Real response format:
 * ```json
 * { "rates": {
 *     "usdAxm": 0.00488,
 *     "eurAxm": 0.00419,
 *     "rubAxm": 0.38587,
 *     "axmUsdt": 0.00488,
 *     "ethUsdt": 2081.41,
 *     ...
 *   }
 * }
 * ```
 */
export async function getAxiomeRates(): Promise<AxiomeRates> {
  const cacheKey = 'axiome_rates';
  const cached = getCached<AxiomeRates>(cacheKey);
  if (cached) return cached;

  const empty: AxiomeRates = {
    axm_usd: null,
    axm_rub: null,
    axm_eur: null,
    raw: {},
    updated_at: new Date().toISOString(),
  };

  try {
    const data = await axiomeFetch('/app/rates') as { rates?: Record<string, number> } | null;

    if (!data?.rates) return empty;

    const r = data.rates;

    // Naming convention: `XY` = price of 1 Y in X.
    // usdAxm = 0.00486 → 1 AXM costs $0.00486 (price of AXM in USD)
    // rubAxm = 0.384   → 1 AXM costs 0.384 RUB
    // eurAxm = 0.00417 → 1 AXM costs 0.00417 EUR
    // axmUsdt = 0.00486 → 1 AXM costs 0.00486 USDT (same as usdAxm)

    // AXM price in USD: prefer usdAxm (direct), fallback to axmUsdt
    const axmUsd = typeof r.usdAxm === 'number' ? r.usdAxm
      : (typeof r.axmUsdt === 'number' ? r.axmUsdt : null);

    // AXM price in RUB: rubAxm is already the price of 1 AXM in RUB
    const axmRub = typeof r.rubAxm === 'number' ? r.rubAxm : null;

    // AXM price in EUR: eurAxm is already the price of 1 AXM in EUR
    const axmEur = typeof r.eurAxm === 'number' ? r.eurAxm : null;

    const rates: AxiomeRates = {
      axm_usd: axmUsd,
      axm_rub: axmRub,
      axm_eur: axmEur,
      raw: r,
      updated_at: new Date().toISOString(),
    };

    return setCache(cacheKey, rates, RATES_CACHE_TTL);
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch Axiome rates');
    return empty;
  }
}
