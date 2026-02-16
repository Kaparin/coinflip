/**
 * Cosmos Transaction Sequence Manager.
 *
 * Manages account number + sequence (nonce) for the relayer account.
 * Prevents sequence mismatch errors by tracking sequences in-memory
 * with a proper mutex lock for serialized access.
 */

import { StargateClient } from '@cosmjs/stargate';
import { logger } from '../lib/logger.js';

export class SequenceManager {
  private accountNumber: number | null = null;
  private sequence: number | null = null;
  private rpcUrl: string;
  private address: string;

  /** Promise-based mutex: serializes all callers of getAndIncrement / refresh */
  private _lockResolve: (() => void) | null = null;
  private _lockQueue: Promise<void> = Promise.resolve();

  constructor(rpcUrl: string, address: string) {
    this.rpcUrl = rpcUrl;
    this.address = address;
  }

  /** Initialize by fetching current account info from chain */
  async init(): Promise<void> {
    await this.refresh();
    logger.info(
      { address: this.address, accountNumber: this.accountNumber, sequence: this.sequence },
      'SequenceManager initialized',
    );
  }

  /** Refresh account number + sequence from chain (unguarded — call under lock or from init) */
  async refresh(): Promise<void> {
    const client = await StargateClient.connect(this.rpcUrl);
    try {
      const account = await client.getAccount(this.address);
      if (!account) {
        throw new Error(`Account ${this.address} not found on chain`);
      }
      this.accountNumber = account.accountNumber;
      this.sequence = account.sequence;
      logger.debug(
        { accountNumber: this.accountNumber, sequence: this.sequence },
        'Sequence refreshed from chain',
      );
    } finally {
      client.disconnect();
    }
  }

  /**
   * Get the current sequence AND atomically increment the local counter.
   * Safe for concurrent callers — uses an internal mutex.
   */
  async getAndIncrement(): Promise<{ accountNumber: number; sequence: number }> {
    const release = await this.acquireLock();
    try {
      if (this.accountNumber === null || this.sequence === null) {
        await this.refresh();
      }

      const result = {
        accountNumber: this.accountNumber!,
        sequence: this.sequence!,
      };

      this.sequence!++;

      logger.debug(
        { accountNumber: result.accountNumber, sequence: result.sequence },
        'Sequence reserved',
      );

      return result;
    } finally {
      release();
    }
  }

  /**
   * Explicitly set the local sequence to a known value.
   * Used after a sequence mismatch to force the correct value from the error
   * or after a chain re-query.
   */
  async forceSet(seq: number): Promise<void> {
    const release = await this.acquireLock();
    try {
      logger.info({ oldSequence: this.sequence, newSequence: seq }, 'Sequence force-set');
      this.sequence = seq;
    } finally {
      release();
    }
  }

  /**
   * Handle sequence mismatch error.
   * Resets local state and re-fetches from chain.
   */
  async handleSequenceMismatch(): Promise<void> {
    const release = await this.acquireLock();
    try {
      logger.warn('Sequence mismatch detected, refreshing from chain');
      await this.refresh();
    } finally {
      release();
    }
  }

  /**
   * Proper promise-based mutex.
   * Returns a release() function that MUST be called in a finally block.
   */
  private acquireLock(): Promise<() => void> {
    let outerResolve: (release: () => void) => void;
    const result = new Promise<() => void>((resolve) => {
      outerResolve = resolve;
    });

    // Chain onto the queue: when the previous holder releases, we proceed
    const prev = this._lockQueue;
    let releaseFn: () => void;
    this._lockQueue = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });

    prev.then(() => {
      // We now hold the lock — give the caller the release function
      outerResolve!(releaseFn!);
    });

    return result;
  }

  /** Get current state (for debugging/health checks) */
  getState(): { accountNumber: number | null; sequence: number | null; address: string } {
    return {
      accountNumber: this.accountNumber,
      sequence: this.sequence,
      address: this.address,
    };
  }
}
