/**
 * In-memory cache for chain REST API queries.
 * Reduces redundant requests to the chain node — the same query
 * (e.g., open_bets) is called from 5+ places with identical results.
 */

import { logger } from './logger.js';

interface CacheEntry<T> {
  data: T;
  ts: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 5_000;

/**
 * Get or fetch a cached chain query result.
 * @param key Unique cache key (e.g., 'open_bets', 'bet:123', 'vault:axm1...')
 * @param fetcher Async function that performs the actual chain query
 * @param ttlMs Cache TTL in milliseconds (default: 5s)
 */
export async function chainCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && Date.now() - existing.ts < ttlMs) {
    return existing.data;
  }

  const data = await fetcher();
  cache.set(key, { data, ts: Date.now() });
  return data;
}

/** Invalidate a specific cache key */
export function invalidateChainCache(key: string): void {
  cache.delete(key);
}

/** Invalidate all keys matching a prefix */
export function invalidateChainCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of cache) {
    if (now - entry.ts > 60_000) {
      cache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug({ cleaned }, 'chain-cache: cleaned expired entries');
  }
}, 30_000);
