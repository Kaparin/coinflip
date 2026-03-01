/**
 * REST API fetch with failover across multiple chain endpoints.
 *
 * Tries the primary URL first, then falls back to secondary URLs.
 * This prevents single-node outages from breaking the entire app.
 *
 * Usage:
 *   const res = await chainRest('/cosmos/tx/v1beta1/txs/HASH');
 *   const res = await chainRest('/cosmwasm/wasm/v1/contract/ADDR/smart/QUERY', { signal });
 */

import { env } from '../config/env.js';
import { logger } from './logger.js';

/** Parsed list of REST URLs (primary + fallbacks). Computed once at startup. */
let _restUrls: string[] | null = null;

function getRestUrls(): string[] {
  if (_restUrls) return _restUrls;
  const urls = [env.AXIOME_REST_URL];
  if (env.AXIOME_REST_URLS_FALLBACK) {
    for (const u of env.AXIOME_REST_URLS_FALLBACK.split(',')) {
      const trimmed = u.trim();
      if (trimmed) urls.push(trimmed);
    }
  }
  _restUrls = urls;
  return urls;
}

/**
 * Fetch from chain REST API with automatic failover.
 *
 * Tries each URL in order. On network error or 5xx, moves to next URL.
 * On 4xx (client error) or success, returns immediately.
 *
 * @param endpoint Path starting with `/` (e.g., `/cosmos/tx/v1beta1/txs/HASH`)
 * @param init Standard fetch options. If no signal is provided, defaults to 5s timeout.
 */
export async function chainRest(
  endpoint: string,
  init?: RequestInit,
): Promise<Response> {
  const urls = getRestUrls();
  let lastError: unknown;

  for (let i = 0; i < urls.length; i++) {
    const baseUrl = urls[i];
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        signal: AbortSignal.timeout(5000),
        ...init,
      });
      // 5xx = server error → try next URL
      if (res.status >= 500 && i < urls.length - 1) {
        logger.warn({ baseUrl, endpoint, status: res.status }, 'Chain REST 5xx, trying fallback');
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (i < urls.length - 1) {
        logger.warn({ baseUrl, endpoint, err }, 'Chain REST failed, trying fallback');
      }
    }
  }

  throw lastError ?? new Error(`All REST URLs failed for: ${endpoint}`);
}

/**
 * Convenience: POST JSON to chain REST API with failover.
 */
export async function chainRestPost(
  endpoint: string,
  body: unknown,
  init?: RequestInit,
): Promise<Response> {
  return chainRest(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });
}
