/**
 * Commit-reveal cryptographic helpers.
 * Used by both backend (relayer verification) and frontend (commitment generation).
 *
 * Commitment formula:
 *   SHA256("coinflip_v1" || maker_address || side || secret)
 *
 * - maker_address: bech32 Axiome address (e.g. axm1abc...)
 * - side: "heads" or "tails"
 * - secret: 32 random bytes as 64 hex chars
 */

import { sha256 } from '@cosmjs/crypto';
import { toHex, fromHex, toUtf8 } from '@cosmjs/encoding';
import { COMMITMENT_PREFIX } from './constants.js';

/** Generate a cryptographically random 32-byte secret (hex encoded) */
export function generateSecret(): string {
  // Works in both Node.js and browser environments
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return toHex(bytes);
  }
  // Fallback for Node.js without WebCrypto
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require('node:crypto') as typeof import('node:crypto');
  return toHex(randomBytes(32));
}

/**
 * Compute a commitment hash.
 *
 * @param makerAddress - Axiome bech32 address of the bet maker
 * @param side - "heads" or "tails"
 * @param secretHex - 64-character hex string (32 bytes)
 * @returns 64-character hex-encoded SHA256 hash
 */
export function computeCommitment(
  makerAddress: string,
  side: 'heads' | 'tails',
  secretHex: string,
): string {
  if (secretHex.length !== 64) {
    throw new Error(`Secret must be 64 hex characters (32 bytes), got ${secretHex.length}`);
  }

  // Build preimage: prefix || address || side || secret_bytes
  const prefixBytes = toUtf8(COMMITMENT_PREFIX);
  const addressBytes = toUtf8(makerAddress);
  const sideBytes = toUtf8(side);
  const secretBytes = fromHex(secretHex);

  // Concatenate all parts
  const preimage = new Uint8Array(
    prefixBytes.length + addressBytes.length + sideBytes.length + secretBytes.length,
  );
  let offset = 0;
  preimage.set(prefixBytes, offset);
  offset += prefixBytes.length;
  preimage.set(addressBytes, offset);
  offset += addressBytes.length;
  preimage.set(sideBytes, offset);
  offset += sideBytes.length;
  preimage.set(secretBytes, offset);

  const hash = sha256(preimage);
  return toHex(hash);
}

/**
 * Verify a commitment matches the given parameters.
 *
 * @returns true if the commitment matches
 */
export function verifyCommitment(
  commitment: string,
  makerAddress: string,
  side: 'heads' | 'tails',
  secretHex: string,
): boolean {
  const computed = computeCommitment(makerAddress, side, secretHex);
  return computed.toLowerCase() === commitment.toLowerCase();
}
