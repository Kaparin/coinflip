/**
 * Client-side cryptographic helpers for the commit-reveal protocol.
 *
 * Uses Web Crypto API (available in all modern browsers).
 *
 * Commitment formula:
 *   SHA256("coinflip_v1" || maker_address || side || secret)
 */

import { COMMITMENT_PREFIX } from '@coinflip/shared/constants';

/** Convert a Uint8Array to hex string */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Convert a hex string to Uint8Array */
function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Convert a string to UTF-8 bytes */
function toUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Generate a cryptographically secure random 32-byte secret.
 * @returns 64-character hex string
 */
export function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

/**
 * Compute a SHA256 commitment for a bet.
 *
 * @param makerAddress - The maker's Axiome bech32 address
 * @param side - 'heads' or 'tails'
 * @param secretHex - 64-character hex secret
 * @returns 64-character hex SHA256 hash
 */
export async function computeCommitment(
  makerAddress: string,
  side: 'heads' | 'tails',
  secretHex: string,
): Promise<string> {
  const prefixBytes = toUtf8(COMMITMENT_PREFIX);
  const addressBytes = toUtf8(makerAddress);
  const sideBytes = toUtf8(side);
  const secretBytes = fromHex(secretHex);

  // Concatenate: prefix || address || side || secret
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

  // SHA256 via Web Crypto
  const hashBuffer = await crypto.subtle.digest('SHA-256', preimage);
  return toHex(new Uint8Array(hashBuffer));
}

/**
 * Verify a commitment matches given parameters.
 */
export async function verifyCommitment(
  commitment: string,
  makerAddress: string,
  side: 'heads' | 'tails',
  secretHex: string,
): Promise<boolean> {
  const computed = await computeCommitment(makerAddress, side, secretHex);
  return computed.toLowerCase() === commitment.toLowerCase();
}
