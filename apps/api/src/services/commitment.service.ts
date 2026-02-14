/**
 * Backend Commitment Service.
 *
 * Server-side helpers for the commit-reveal protocol.
 * Uses the shared commitment library from @coinflip/shared.
 */

import {
  computeCommitment,
  verifyCommitment,
  generateSecret,
} from '@coinflip/shared';
import { logger } from '../lib/logger.js';

/**
 * Validate a commitment hash format (64 hex chars).
 */
export function isValidCommitment(commitment: string): boolean {
  return /^[0-9a-f]{64}$/i.test(commitment);
}

/**
 * Validate a secret format (64 hex chars = 32 bytes).
 */
export function isValidSecret(secret: string): boolean {
  return /^[0-9a-f]{64}$/i.test(secret);
}

/**
 * Verify that a reveal matches the original commitment.
 * This is used when the relayer receives a reveal request
 * to pre-check before submitting to chain.
 *
 * @param commitment - The original SHA256 commitment stored in DB
 * @param makerAddress - Axiome address of the bet maker
 * @param side - The revealed side (heads/tails)
 * @param secret - The revealed secret (64 hex chars)
 * @returns true if the commitment matches
 */
export function verifyReveal(
  commitment: string,
  makerAddress: string,
  side: 'heads' | 'tails',
  secret: string,
): boolean {
  if (!isValidCommitment(commitment)) {
    logger.warn({ commitment }, 'Invalid commitment format');
    return false;
  }

  if (!isValidSecret(secret)) {
    logger.warn({ secret: secret.slice(0, 8) + '...' }, 'Invalid secret format');
    return false;
  }

  const matches = verifyCommitment(commitment, makerAddress, side, secret);

  if (!matches) {
    logger.warn(
      { makerAddress, side, commitmentPrefix: commitment.slice(0, 16) },
      'Commitment verification failed',
    );
  }

  return matches;
}

export { computeCommitment, verifyCommitment, generateSecret };
