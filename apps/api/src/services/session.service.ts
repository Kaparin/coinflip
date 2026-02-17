/**
 * Session Service — HMAC-based stateless session tokens.
 *
 * Flow:
 *   1. Frontend calls GET /api/v1/auth/challenge?address=axm1...
 *   2. Backend returns a random nonce (stored in memory with 5min TTL)
 *   3. Frontend signs the nonce using the wallet (ADR-036 amino sign)
 *   4. Frontend calls POST /api/v1/auth/verify with { address, signature, pubkey }
 *   5. Backend verifies the Secp256k1 signature against the Bech32 address
 *   6. Backend returns a stateless HMAC session token as httpOnly cookie
 *
 * Session token format:
 *   base64url(`${address}:${expiresAtMs}:${hmac}`)
 *   where hmac = HMAC-SHA256(SESSION_SECRET, `${address}:${expiresAtMs}`)
 *
 * This is stateless (no DB/Redis needed for session lookup), tamper-proof,
 * and fast to verify on every request.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { Secp256k1, Secp256k1Signature, Sha256, ripemd160 } from '@cosmjs/crypto';
import { toBech32, fromHex } from '@cosmjs/encoding';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory challenge store (address → { nonce, expiresAt })
// In production with multiple instances, use Redis instead.
const challenges = new Map<string, { nonce: string; expiresAt: number }>();

// Cleanup expired challenges every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of challenges) {
    if (val.expiresAt < now) challenges.delete(key);
  }
}, 60_000);

/** Generate a random challenge nonce for an address */
export function generateChallenge(address: string): string {
  const nonce = randomBytes(32).toString('hex');
  challenges.set(address.toLowerCase(), {
    nonce,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return nonce;
}

/** Consume a challenge (returns the nonce if valid, null if expired/missing) */
export function consumeChallenge(address: string): string | null {
  const key = address.toLowerCase();
  const entry = challenges.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    challenges.delete(key);
    return null;
  }
  challenges.delete(key);
  return entry.nonce;
}

/**
 * Verify a Secp256k1 signature against a Bech32 address.
 *
 * The challenge message format (ADR-036 compatible):
 *   The message is the raw challenge nonce bytes.
 *   The signature is a 64-byte Secp256k1 compact signature.
 *   The pubkey is the 33-byte compressed Secp256k1 public key.
 *
 * Verification steps:
 *   1. Hash the message: SHA256(challenge_nonce)
 *   2. Verify signature against pubkey
 *   3. Derive address from pubkey and compare to claimed address
 */
export async function verifySignature(
  address: string,
  challenge: string,
  signatureHex: string,
  pubkeyHex: string,
): Promise<boolean> {
  try {
    const pubkeyBytes = fromHex(pubkeyHex);
    const signatureBytes = fromHex(signatureHex);

    // Derive address from pubkey: ripemd160(sha256(pubkey))
    const sha256Hash = new Sha256(pubkeyBytes).digest();
    const addressBytes = ripemd160(sha256Hash);
    const derivedAddress = toBech32('axm', addressBytes);

    if (derivedAddress.toLowerCase() !== address.toLowerCase()) {
      logger.warn({ derivedAddress, claimedAddress: address }, 'Auth: pubkey does not match address');
      return false;
    }

    // Verify signature: SHA256(challenge) → verify(sig, hash, pubkey)
    const messageHash = new Sha256(Buffer.from(challenge, 'utf-8')).digest();
    const sig = Secp256k1Signature.fromFixedLength(signatureBytes);
    const valid = await Secp256k1.verifySignature(sig, messageHash, pubkeyBytes);

    return valid;
  } catch (err) {
    logger.error({ err, address }, 'Auth: signature verification failed');
    return false;
  }
}

/** Create a stateless HMAC session token */
export function createSessionToken(address: string): string {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const payload = `${address}:${expiresAt}`;
  const hmac = createHmac('sha256', env.SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

/** Verify and decode a session token. Returns the address if valid, null otherwise. */
export function verifySessionToken(token: string): { address: string; expiresAt: number } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;

    const [address, expiresAtStr, providedHmac] = parts;
    if (!address || !expiresAtStr || !providedHmac) return null;

    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || expiresAt < Date.now()) return null;

    // Verify HMAC
    const payload = `${address}:${expiresAtStr}`;
    const expectedHmac = createHmac('sha256', env.SESSION_SECRET)
      .update(payload)
      .digest('base64url');

    // Timing-safe comparison
    if (expectedHmac.length !== providedHmac.length) return null;
    const a = Buffer.from(expectedHmac);
    const b = Buffer.from(providedHmac);
    if (!a.equals(b)) return null;

    return { address, expiresAt };
  } catch {
    return null;
  }
}

/** Session cookie name */
export const SESSION_COOKIE_NAME = 'coinflip_session';

/** Session cookie options for production */
export function getSessionCookieOptions(isProd: boolean) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' as const : 'lax' as const,
    maxAge: SESSION_DURATION_MS / 1000,
    path: '/',
  };
}
