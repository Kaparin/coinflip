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
  /** AXM price in USD (from axmUsdt field) */
  axm_usd: number | null;
  /** How many AXM per 1 RUB (rubAxm) */
  axm_rub: number | null;
  /** How many AXM per 1 EUR (eurAxm) */
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

    // axmUsdt = AXM price in USDT ≈ USD
    // usdAxm = how many AXM per 1 USD (inverse of price)
    // To get AXM price in USD: either use axmUsdt directly, or 1/usdAxm
    const axmUsd = typeof r.axmUsdt === 'number'
      ? r.axmUsdt
      : (typeof r.usdAxm === 'number' && r.usdAxm > 0 ? 1 / r.usdAxm : null);

    // For RUB: rubAxm = how many AXM per 1 RUB → AXM price in RUB = 1/rubAxm
    const axmRub = typeof r.rubAxm === 'number' && r.rubAxm > 0 ? 1 / r.rubAxm : null;

    // For EUR: eurAxm = how many AXM per 1 EUR → AXM price in EUR = 1/eurAxm
    const axmEur = typeof r.eurAxm === 'number' && r.eurAxm > 0 ? 1 / r.eurAxm : null;

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
