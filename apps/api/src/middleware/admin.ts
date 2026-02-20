import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { userService } from '../services/user.service.js';
import { Errors } from '../lib/errors.js';
import { env } from '../config/env.js';
import {
  verifySessionToken,
  SESSION_COOKIE_NAME,
} from '../services/session.service.js';

/** Set of admin wallet addresses (parsed once at startup) */
const adminAddresses: Set<string> = new Set(
  env.ADMIN_ADDRESSES
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean),
);

/**
 * Admin middleware: requires a valid HMAC session token AND the address
 * must be in the ADMIN_ADDRESSES allowlist.
 *
 * Production: verifies coinflip_session cookie (same as authMiddleware).
 * Dev fallback: trusts x-wallet-address header (NEVER in production).
 */
export async function adminMiddleware(c: Context, next: Next) {
  const isProd = env.NODE_ENV === 'production';
  let address: string | undefined;

  // 1. Verify session token (preferred, secure) — same as authMiddleware
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionToken) {
    const session = verifySessionToken(sessionToken);
    if (session) {
      address = session.address;
    }
  }

  // 2. Dev fallback only: trust header/cookie (NEVER in production)
  if (!address && !isProd) {
    address = c.req.header('x-wallet-address') ?? getCookie(c, 'wallet_address');
  }

  if (!address) {
    throw Errors.unauthorized();
  }

  // 3. Check admin allowlist
  if (!adminAddresses.has(address.toLowerCase())) {
    throw Errors.forbidden();
  }

  // Find or create user (admin is also a user)
  const user = await userService.findOrCreateUser(address);
  c.set('user', user);
  c.set('address', address);

  await next();
}
