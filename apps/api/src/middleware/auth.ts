import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { userService } from '../services/user.service.js';
import { AppError } from '../lib/errors.js';

/**
 * Auth middleware: extracts wallet address from session cookie or header.
 * In production this would verify a signed session token.
 * For now, accepts `x-wallet-address` header for development.
 */
export async function authMiddleware(c: Context, next: Next) {
  const address =
    c.req.header('x-wallet-address') ??
    getCookie(c, 'wallet_address');

  if (!address) {
    throw new AppError('UNAUTHORIZED', 'Wallet address required', 401);
  }

  // Find or create user
  const user = await userService.findOrCreateUser(address);

  // Store in context for downstream handlers
  c.set('user', user);
  c.set('address', address);

  await next();
}
