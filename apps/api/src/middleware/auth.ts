import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { userService } from '../services/user.service.js';
import { AppError } from '../lib/errors.js';
import {
  verifySessionToken,
  SESSION_COOKIE_NAME,
} from '../services/session.service.js';
import { env } from '../config/env.js';

const USER_CACHE_TTL_MS = 30_000;
const USER_CACHE_CLEANUP_INTERVAL_MS = 30_000;
const USER_CACHE_MAX_AGE_MS = 60_000;

const userCache = new Map<string, { user: any; ts: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of userCache.entries()) {
    if (now - entry.ts > USER_CACHE_MAX_AGE_MS) {
      userCache.delete(key);
    }
  }
}, USER_CACHE_CLEANUP_INTERVAL_MS);

/**
 * Resolve user from session cookie or dev header.
 * Returns true if user was found and set on context, false otherwise.
 */
async function resolveUser(c: Context): Promise<boolean> {
  const isProd = env.NODE_ENV === 'production';
  let address: string | undefined;

  // 1. Try session token (preferred, secure)
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionToken) {
    const session = verifySessionToken(sessionToken);
    if (session) {
      address = session.address;
    }
  }

  // 2. Dev fallback: trust x-wallet-address header (NEVER in production)
  if (!address && !isProd) {
    address = c.req.header('x-wallet-address') ?? getCookie(c, 'wallet_address');
  }

  if (!address) return false;

  // Find or create user (with in-memory cache)
  let user: any;
  const cached = userCache.get(address);
  const now = Date.now();
  if (cached && now - cached.ts < USER_CACHE_TTL_MS) {
    user = cached.user;
  } else {
    user = await userService.findOrCreateUser(address);
    userCache.set(address, { user, ts: now });
  }

  // Store in context for downstream handlers
  c.set('user', user);
  c.set('address', address);
  return true;
}

/**
 * Auth middleware: requires wallet auth. Throws 401 if not authenticated.
 *
 * Production: `coinflip_session` httpOnly cookie (HMAC session token).
 * Dev fallback: `x-wallet-address` header (NEVER in production).
 */
export async function authMiddleware(c: Context, next: Next) {
  const resolved = await resolveUser(c);
  if (!resolved) {
    throw new AppError('UNAUTHORIZED', 'Authentication required. Please connect your wallet.', 401);
  }
  await next();
}

/**
 * Optional auth middleware: sets user on context if authenticated,
 * but does NOT throw 401 — allows unauthenticated access.
 * Use for public endpoints that optionally personalize responses (e.g. hasJoined).
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  try {
    await resolveUser(c);
  } catch {
    // Swallow auth errors — this middleware is optional, request continues unauthenticated
  }
  await next();
}
