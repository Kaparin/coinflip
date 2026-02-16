import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { userService } from '../services/user.service.js';
import { Errors } from '../lib/errors.js';
import { env } from '../config/env.js';

/** Set of admin wallet addresses (parsed once at startup) */
const adminAddresses: Set<string> = new Set(
  env.ADMIN_ADDRESSES
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean),
);

/**
 * Admin middleware: requires a valid wallet session AND the address
 * must be in the ADMIN_ADDRESSES allowlist.
 */
export async function adminMiddleware(c: Context, next: Next) {
  const address =
    c.req.header('x-wallet-address') ??
    getCookie(c, 'wallet_address');

  if (!address) {
    throw Errors.unauthorized();
  }

  if (!adminAddresses.has(address.toLowerCase())) {
    throw Errors.forbidden();
  }

  // Find or create user (admin is also a user)
  const user = await userService.findOrCreateUser(address);
  c.set('user', user);
  c.set('address', address);

  await next();
}
