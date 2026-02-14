import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { zValidator } from '@hono/zod-validator';
import { ConnectRequestSchema } from '@coinflip/shared/schemas';
import { userService } from '../services/user.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';

export const authRouter = new Hono();

// POST /api/v1/auth/connect — Connect wallet and register session
authRouter.post('/connect', zValidator('json', ConnectRequestSchema), async (c) => {
  const { address, signature, message } = c.req.valid('json');

  // TODO: Verify signature against message using CosmJS or Axiome-specific verification
  // For now, accept any connection in development
  logger.info({ address }, 'Wallet connect request');

  // Find or create user
  const user = await userService.findOrCreateUser(address);

  // Create session (30 day expiry)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const session = await userService.createSession(user.id, {
    authzEnabled: false,
    feeSponsored: false,
    expiresAt,
  });

  // Set session cookie for development
  setCookie(c, 'wallet_address', address, {
    httpOnly: true,
    secure: false, // true in production
    sameSite: 'Lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  });

  return c.json({
    data: {
      session_id: session.id,
      address: user.address,
      user_id: user.id,
    },
  });
});

// GET /api/v1/auth/grants — Check authz + feegrant status
authRouter.get('/grants', authMiddleware, async (c) => {
  const user = c.get('user') as { id: string };
  const session = await userService.getActiveSession(user.id);

  // TODO: Query chain for actual authz grants and feegrant allowance
  // For now, return session data from DB

  return c.json({
    data: {
      authz_granted: session?.authzEnabled ?? false,
      authz_expires_at: session?.authzExpirationTime?.toISOString() ?? null,
      authz_calls_remaining: null, // Would query chain
      fee_grant_active: session?.feeSponsored ?? false,
      fee_grant_daily_remaining: null, // Would query chain
    },
  });
});
