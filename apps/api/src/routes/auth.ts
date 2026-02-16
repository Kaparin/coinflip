import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { zValidator } from '@hono/zod-validator';
import { ConnectRequestSchema } from '@coinflip/shared/schemas';
import { userService } from '../services/user.service.js';
import { referralService } from '../services/referral.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types.js';

export const authRouter = new Hono<AppEnv>();

// POST /api/v1/auth/connect — Connect wallet and register session
authRouter.post('/connect', zValidator('json', ConnectRequestSchema), async (c) => {
  const { address } = c.req.valid('json');

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

  // Auto-assign to admin referrer if user has no referral link.
  // Delayed by 5s to give the frontend time to register a real referral code first
  // (the frontend calls POST /referral/register right after connect).
  // Runs in background — doesn't block the response.
  setTimeout(() => {
    referralService.autoAssignDefaultReferrer(user.id).catch((err) => {
      logger.warn({ err, userId: user.id }, 'Failed to auto-assign default referrer');
    });
  }, 5000);

  // Set session cookie
  setCookie(c, 'wallet_address', address, {
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
    maxAge: 30 * 24 * 60 * 60,
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

// GET /api/v1/auth/grants — Check authz + feegrant status on chain
authRouter.get('/grants', authMiddleware, async (c) => {
  const user = c.get('user');
  const address = c.get('address');

  let authzGranted = false;
  let authzExpiresAt: string | null = null;
  let feeGrantActive = false;

  // Query chain for authz grants: granter=user, grantee=relayer
  try {
    const grantsUrl = `${env.AXIOME_REST_URL}/cosmos/authz/v1beta1/grants?granter=${address}&grantee=${env.RELAYER_ADDRESS}&msg_type_url=/cosmwasm.wasm.v1.MsgExecuteContract`;
    const grantsRes = await fetch(grantsUrl);
    if (grantsRes.ok) {
      const grantsData = (await grantsRes.json()) as {
        grants?: Array<{ expiration?: string; authorization?: { type_url: string } }>;
      };
      const grants = grantsData.grants ?? [];
      if (grants.length > 0) {
        authzGranted = true;
        authzExpiresAt = grants[0]?.expiration ?? null;
      }
    }
  } catch (err) {
    logger.warn({ err, address }, 'Failed to query authz grants from chain');
  }

  // Query chain for feegrant: granter=treasury, grantee=relayer
  try {
    const feeUrl = `${env.AXIOME_REST_URL}/cosmos/feegrant/v1beta1/allowance/${env.TREASURY_ADDRESS}/${env.RELAYER_ADDRESS}`;
    const feeRes = await fetch(feeUrl);
    if (feeRes.ok) {
      feeGrantActive = true;
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to query feegrant from chain');
  }

  // Update session in DB
  if (authzGranted) {
    try {
      const session = await userService.getActiveSession(user.id);
      if (session && !session.authzEnabled) {
        await userService.updateSession(session.id, {
          authzEnabled: true,
          authzExpirationTime: authzExpiresAt ? new Date(authzExpiresAt) : undefined,
        });
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to update session authz status');
    }
  }

  return c.json({
    data: {
      authz_granted: authzGranted,
      authz_expires_at: authzExpiresAt,
      fee_grant_active: feeGrantActive,
      relayer_address: env.RELAYER_ADDRESS,
      contract_address: env.COINFLIP_CONTRACT_ADDR,
    },
  });
});

// GET /api/v1/auth/grant-msg — Get unsigned MsgGrant for Keplr signing
authRouter.get('/grant-msg', authMiddleware, async (c) => {
  const address = c.get('address');

  // Return the parameters needed for the frontend to construct and sign a MsgGrant
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  return c.json({
    data: {
      granter: address,
      grantee: env.RELAYER_ADDRESS,
      contract_address: env.COINFLIP_CONTRACT_ADDR,
      allowed_messages: [
        'create_bet', 'accept_bet', 'reveal', 'cancel_bet', 'claim_timeout', 'withdraw',
      ],
      expiration: expiresAt.toISOString(),
      chain_id: env.AXIOME_CHAIN_ID,
    },
  });
});
