import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ConnectRequestSchema } from '@coinflip/shared/schemas';
import { userService } from '../services/user.service.js';
import { referralService } from '../services/referral.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { chainCached } from '../lib/chain-cache.js';
import {
  generateChallenge,
  consumeChallenge,
  verifySignature,
  createSessionToken,
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
} from '../services/session.service.js';
import type { AppEnv } from '../types.js';

export const authRouter = new Hono<AppEnv>();

// ─── Challenge-Response Authentication ─────────────────────────

// GET /api/v1/auth/challenge — Request a challenge nonce for wallet signing
authRouter.get('/challenge', async (c) => {
  const address = c.req.query('address')?.trim().toLowerCase();
  if (!address || !address.startsWith('axm1') || address.length < 20) {
    return c.json({ error: { code: 'INVALID_ADDRESS', message: 'Valid axm1... address required' } }, 400);
  }

  const nonce = generateChallenge(address);
  const message = `Sign this message to authenticate with CoinFlip.\n\nWallet: ${address}\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString()}`;

  return c.json({
    data: {
      challenge: nonce,
      message,
    },
  });
});

// POST /api/v1/auth/verify — Verify wallet signature and create session
const VerifySchema = z.object({
  address: z.string().min(20).max(100),
  signature: z.string().min(1).max(256),
  pubkey: z.string().min(1).max(256),
});

authRouter.post('/verify', zValidator('json', VerifySchema), async (c) => {
  const { address, signature, pubkey } = c.req.valid('json');
  const normalizedAddress = address.trim().toLowerCase();

  // Consume the challenge (one-time use, prevents replay attacks)
  const challenge = consumeChallenge(normalizedAddress);
  if (!challenge) {
    return c.json({
      error: { code: 'INVALID_CHALLENGE', message: 'Challenge expired or not found. Please request a new one.' },
    }, 400);
  }

  // Verify the Secp256k1 signature
  const valid = await verifySignature(normalizedAddress, challenge, signature, pubkey);
  if (!valid) {
    return c.json({
      error: { code: 'INVALID_SIGNATURE', message: 'Signature verification failed.' },
    }, 401);
  }

  // Find or create user
  const user = await userService.findOrCreateUser(normalizedAddress);

  // Create session
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  const session = await userService.createSession(user.id, {
    authzEnabled: false,
    feeSponsored: false,
    expiresAt,
  });

  // Create HMAC session token and set as httpOnly cookie
  const sessionToken = createSessionToken(normalizedAddress);
  const isProd = env.NODE_ENV === 'production';
  const cookieOpts = getSessionCookieOptions(isProd);
  setCookie(c, SESSION_COOKIE_NAME, sessionToken, cookieOpts);

  logger.info({ address: normalizedAddress }, 'Wallet authenticated via signature');

  return c.json({
    data: {
      session_id: session.id,
      address: user.address,
      user_id: user.id,
      authenticated: true,
    },
  });
});

// ─── Legacy Connect (dev-only, production requires /auth/verify) ─────

// POST /api/v1/auth/connect — Connect wallet (dev-only, no signature check)
// SECURITY: In production, this endpoint ONLY returns user info without setting auth cookies.
// Use /auth/challenge + /auth/verify for production authentication.
authRouter.post('/connect', zValidator('json', ConnectRequestSchema), async (c) => {
  const { address: rawAddress } = c.req.valid('json');
  const address = rawAddress.trim().toLowerCase();
  const isProd = env.NODE_ENV === 'production';

  logger.info({ address, isProd }, 'Wallet connect request');

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
  setTimeout(() => {
    referralService.autoAssignDefaultReferrer(user.id).catch((err) => {
      logger.warn({ err, userId: user.id }, 'Failed to auto-assign default referrer');
    });
  }, 5000);

  // SECURITY: Only set session cookie in development.
  // In production, clients MUST use /auth/challenge + /auth/verify (signature-based).
  if (!isProd) {
    const sessionToken = createSessionToken(address);
    const cookieOpts = getSessionCookieOptions(false);
    setCookie(c, SESSION_COOKIE_NAME, sessionToken, cookieOpts);
    setCookie(c, 'wallet_address', address, {
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });
  }

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
    const authzResult = await chainCached(
      'grants:' + address,
      async () => {
        const grantsUrl = `${env.AXIOME_REST_URL}/cosmos/authz/v1beta1/grants?granter=${address}&grantee=${env.RELAYER_ADDRESS}&msg_type_url=/cosmwasm.wasm.v1.MsgExecuteContract`;
        const grantsRes = await fetch(grantsUrl, { signal: AbortSignal.timeout(5000) });
        if (!grantsRes.ok) return { authzGranted: false, authzExpiresAt: null };
        const grantsData = (await grantsRes.json()) as {
          grants?: Array<{ expiration?: string; authorization?: { type_url: string } }>;
        };
        const grants = grantsData.grants ?? [];
        return {
          authzGranted: grants.length > 0,
          authzExpiresAt: grants[0]?.expiration ?? null,
        };
      },
      300_000,
    );
    authzGranted = authzResult.authzGranted;
    authzExpiresAt = authzResult.authzExpiresAt;
  } catch (err) {
    logger.warn({ err, address }, 'Failed to query authz grants from chain');
  }

  // Query chain for feegrant: granter=treasury, grantee=relayer
  try {
    const feeUrl = `${env.AXIOME_REST_URL}/cosmos/feegrant/v1beta1/allowance/${env.TREASURY_ADDRESS}/${env.RELAYER_ADDRESS}`;
    const feeRes = await fetch(feeUrl, { signal: AbortSignal.timeout(5000) });
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
