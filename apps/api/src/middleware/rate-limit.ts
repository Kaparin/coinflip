/**
 * Rate Limiting Middleware — in-memory sliding window.
 *
 * Two layers:
 *   1. IP-based:     30 requests per minute per IP (all endpoints)
 *   2. Wallet-based: 10 transaction requests per minute per wallet (write endpoints)
 *
 * Uses a sliding window counter stored in memory.
 * For multi-instance production deployments, swap to Redis-based counters.
 */

import type { Context, Next } from 'hono';
import { logger } from '../lib/logger.js';

interface WindowEntry {
  count: number;
  resetAt: number;
}

const ipWindows = new Map<string, WindowEntry>();
const walletWindows = new Map<string, WindowEntry>();

// Cleanup expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ipWindows) {
    if (entry.resetAt < now) ipWindows.delete(key);
  }
  for (const [key, entry] of walletWindows) {
    if (entry.resetAt < now) walletWindows.delete(key);
  }
}, 60_000);

function getClientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'unknown'
  );
}

function checkLimit(
  store: Map<string, WindowEntry>,
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

// ─── IP Rate Limit (all requests) ────────────────────────────────

const IP_MAX_REQUESTS = 60;
const IP_WINDOW_MS = 60_000; // 1 minute

export async function ipRateLimit(c: Context, next: Next) {
  const ip = getClientIp(c);
  const { allowed, remaining, resetAt } = checkLimit(ipWindows, ip, IP_MAX_REQUESTS, IP_WINDOW_MS);

  c.header('X-RateLimit-Limit', String(IP_MAX_REQUESTS));
  c.header('X-RateLimit-Remaining', String(remaining));
  c.header('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

  if (!allowed) {
    logger.warn({ ip, path: c.req.path }, 'IP rate limit exceeded');
    return c.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait and try again.' } },
      429,
    );
  }

  await next();
}

// ─── Wallet Rate Limit (transaction endpoints only) ──────────────

const WALLET_MAX_TX = 10;
const WALLET_WINDOW_MS = 60_000; // 1 minute

export async function walletTxRateLimit(c: Context, next: Next) {
  const address = c.get('address') as string | undefined;
  if (!address) {
    await next();
    return;
  }

  const { allowed, remaining, resetAt } = checkLimit(walletWindows, address, WALLET_MAX_TX, WALLET_WINDOW_MS);

  c.header('X-WalletRateLimit-Limit', String(WALLET_MAX_TX));
  c.header('X-WalletRateLimit-Remaining', String(remaining));
  c.header('X-WalletRateLimit-Reset', String(Math.ceil(resetAt / 1000)));

  if (!allowed) {
    logger.warn({ address, path: c.req.path }, 'Wallet tx rate limit exceeded');
    return c.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many transactions. Please wait a minute.' } },
      429,
    );
  }

  await next();
}
