import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { userService } from '../services/user.service.js';
import { AppError } from '../lib/errors.js';
import {
  verifySessionToken,
  SESSION_COOKIE_NAME,
} from '../services/session.service.js';
import { env } from '../config/env.js';

/**
 * Auth middleware: verifies wallet ownership via cryptographic session token.
 *
 * Production mode:
 *   1. Check for `coinflip_session` httpOnly cookie (HMAC session token)
 *   2. Verify HMAC and expiration
 *   3. Extract wallet address from token
 *
 * Development mode (fallback):
 *   Also accepts `x-wallet-address` header for local testing.
 *   NEVER available in production — prevents wallet impersonation.
 */
export async function authMiddleware(c: Context, next: Next) {
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

  if (!address) {
    throw new AppError('UNAUTHORIZED', 'Authentication required. Please connect your wallet.', 401);
  }

  // Find or create user
  const user = await userService.findOrCreateUser(address);

  // Store in context for downstream handlers
  c.set('user', user);
  c.set('address', address);

  await next();
}
