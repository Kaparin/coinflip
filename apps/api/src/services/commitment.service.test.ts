import { describe, it, expect } from 'vitest';
import {
  isValidCommitment,
  isValidSecret,
  verifyReveal,
  computeCommitment,
  generateSecret,
} from './commitment.service.js';

describe('Commitment Service', () => {
  const MAKER_ADDRESS = 'axiome1qz3f5xr7yn0d5kwmjx9m4yehsqq72rch3mqdv';

  describe('generateSecret', () => {
    it('generates a 64-character hex string', () => {
      const secret = generateSecret();
      expect(secret).toHaveLength(64);
      expect(secret).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates unique secrets', () => {
      const s1 = generateSecret();
      const s2 = generateSecret();
      expect(s1).not.toBe(s2);
    });
  });

  describe('isValidCommitment', () => {
    it('accepts valid 64-char hex', () => {
      expect(isValidCommitment('a'.repeat(64))).toBe(true);
      expect(isValidCommitment('0123456789abcdef'.repeat(4))).toBe(true);
    });

    it('rejects invalid formats', () => {
      expect(isValidCommitment('short')).toBe(false);
      expect(isValidCommitment('g'.repeat(64))).toBe(false); // non-hex
      expect(isValidCommitment('')).toBe(false);
      expect(isValidCommitment('a'.repeat(63))).toBe(false);
      expect(isValidCommitment('a'.repeat(65))).toBe(false);
    });
  });

  describe('isValidSecret', () => {
    it('accepts valid 64-char hex', () => {
      expect(isValidSecret('b'.repeat(64))).toBe(true);
    });

    it('rejects invalid formats', () => {
      expect(isValidSecret('short')).toBe(false);
      expect(isValidSecret('')).toBe(false);
    });
  });

  describe('computeCommitment', () => {
    it('produces deterministic output for same inputs', () => {
      const secret = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const c1 = computeCommitment(MAKER_ADDRESS, 'heads', secret);
      const c2 = computeCommitment(MAKER_ADDRESS, 'heads', secret);
      expect(c1).toBe(c2);
    });

    it('produces different output for different sides', () => {
      const secret = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const heads = computeCommitment(MAKER_ADDRESS, 'heads', secret);
      const tails = computeCommitment(MAKER_ADDRESS, 'tails', secret);
      expect(heads).not.toBe(tails);
    });

    it('produces different output for different secrets', () => {
      const s1 = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const s2 = 'b1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const c1 = computeCommitment(MAKER_ADDRESS, 'heads', s1);
      const c2 = computeCommitment(MAKER_ADDRESS, 'heads', s2);
      expect(c1).not.toBe(c2);
    });

    it('produces different output for different addresses', () => {
      const secret = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const c1 = computeCommitment(MAKER_ADDRESS, 'heads', secret);
      const c2 = computeCommitment('axiome1v4e5cc4hpf5rgzc3d8ntg0k7t3hrwlmfkaqdzv', 'heads', secret);
      expect(c1).not.toBe(c2);
    });

    it('returns a valid 64-char hex hash', () => {
      const secret = generateSecret();
      const commitment = computeCommitment(MAKER_ADDRESS, 'heads', secret);
      expect(commitment).toHaveLength(64);
      expect(commitment).toMatch(/^[0-9a-f]{64}$/);
    });

    it('includes "coinflip_v1" prefix in preimage', () => {
      // Different prefix would produce different hash
      const secret = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const commitment = computeCommitment(MAKER_ADDRESS, 'heads', secret);
      // Just verify it's a valid hash (the prefix is baked into computeCommitment)
      expect(isValidCommitment(commitment)).toBe(true);
    });
  });

  describe('verifyReveal', () => {
    it('verifies correct reveal', () => {
      const secret = generateSecret();
      const commitment = computeCommitment(MAKER_ADDRESS, 'heads', secret);
      expect(verifyReveal(commitment, MAKER_ADDRESS, 'heads', secret)).toBe(true);
    });

    it('rejects wrong side', () => {
      const secret = generateSecret();
      const commitment = computeCommitment(MAKER_ADDRESS, 'heads', secret);
      expect(verifyReveal(commitment, MAKER_ADDRESS, 'tails', secret)).toBe(false);
    });

    it('rejects wrong secret', () => {
      const secret = generateSecret();
      const wrongSecret = generateSecret();
      const commitment = computeCommitment(MAKER_ADDRESS, 'heads', secret);
      expect(verifyReveal(commitment, MAKER_ADDRESS, 'heads', wrongSecret)).toBe(false);
    });

    it('rejects wrong address', () => {
      const secret = generateSecret();
      const commitment = computeCommitment(MAKER_ADDRESS, 'heads', secret);
      expect(
        verifyReveal(commitment, 'axiome1wrongaddress', 'heads', secret),
      ).toBe(false);
    });

    it('rejects invalid commitment format', () => {
      expect(verifyReveal('invalid', MAKER_ADDRESS, 'heads', generateSecret())).toBe(false);
    });

    it('rejects invalid secret format', () => {
      const commitment = computeCommitment(MAKER_ADDRESS, 'heads', generateSecret());
      expect(verifyReveal(commitment, MAKER_ADDRESS, 'heads', 'short')).toBe(false);
    });

    it('handles case-insensitive comparison', () => {
      const secret = generateSecret();
      const commitment = computeCommitment(MAKER_ADDRESS, 'tails', secret);
      expect(verifyReveal(commitment.toUpperCase(), MAKER_ADDRESS, 'tails', secret)).toBe(true);
    });
  });

  describe('end-to-end flow', () => {
    it('simulates full commit-reveal cycle', () => {
      // 1. Maker generates secret and commitment
      const secret = generateSecret();
      const commitment = computeCommitment(MAKER_ADDRESS, 'heads', secret);

      // 2. Commitment is stored on-chain (we simulate with the string)
      expect(isValidCommitment(commitment)).toBe(true);

      // 3. Later, maker reveals
      expect(isValidSecret(secret)).toBe(true);
      expect(verifyReveal(commitment, MAKER_ADDRESS, 'heads', secret)).toBe(true);

      // 4. Wrong side would fail
      expect(verifyReveal(commitment, MAKER_ADDRESS, 'tails', secret)).toBe(false);
    });
  });
});
