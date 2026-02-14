'use client';

import { useState, useCallback } from 'react';
import { generateSecret, computeCommitment } from '@/lib/crypto';

interface CommitmentState {
  /** The generated secret (keep private!) */
  secret: string | null;
  /** The SHA256 commitment hash */
  commitment: string | null;
  /** The chosen side */
  side: 'heads' | 'tails' | null;
  /** Whether generation is in progress */
  isGenerating: boolean;
}

interface UseCommitmentReturn extends CommitmentState {
  /**
   * Generate a new commitment for the given side and address.
   * IMPORTANT: Store the returned secret in memory ONLY.
   * Never persist to localStorage or send to API before reveal.
   */
  generate: (makerAddress: string, side: 'heads' | 'tails') => Promise<void>;
  /** Clear the current commitment (e.g., after successful bet creation) */
  clear: () => void;
}

/**
 * Hook for managing commit-reveal state on the client side.
 *
 * Security:
 * - Secret is stored ONLY in React state (memory)
 * - Never persisted to localStorage
 * - Never sent to backend until reveal
 */
export function useCommitment(): UseCommitmentReturn {
  const [state, setState] = useState<CommitmentState>({
    secret: null,
    commitment: null,
    side: null,
    isGenerating: false,
  });

  const generate = useCallback(async (makerAddress: string, side: 'heads' | 'tails') => {
    setState((prev) => ({ ...prev, isGenerating: true }));

    try {
      const secret = generateSecret();
      const commitment = await computeCommitment(makerAddress, side, secret);

      setState({
        secret,
        commitment,
        side,
        isGenerating: false,
      });
    } catch {
      setState((prev) => ({ ...prev, isGenerating: false }));
      throw new Error('Failed to generate commitment');
    }
  }, []);

  const clear = useCallback(() => {
    setState({
      secret: null,
      commitment: null,
      side: null,
      isGenerating: false,
    });
  }, []);

  return {
    ...state,
    generate,
    clear,
  };
}
