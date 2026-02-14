/**
 * Cosmos Transaction Sequence Manager.
 *
 * Manages account number + sequence (nonce) for the relayer account.
 * Prevents sequence mismatch errors by tracking sequences in-memory
 * and retrying with fresh values on mismatch.
 */

import { StargateClient } from '@cosmjs/stargate';
import { logger } from '../lib/logger.js';

export class SequenceManager {
  private accountNumber: number | null = null;
  private sequence: number | null = null;
  private rpcUrl: string;
  private address: string;
  private lock: Promise<void> = Promise.resolve();

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

  /** Refresh account number + sequence from chain */
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
   * Reserve the next sequence number for a transaction.
   * Thread-safe: uses a lock to serialize access.
   */
  async getNextSequence(): Promise<{ accountNumber: number; sequence: number }> {
    // Chain the lock to serialize concurrent requests
    const releaseLock = this.acquireLock();
    try {
      await releaseLock;

      if (this.accountNumber === null || this.sequence === null) {
        await this.refresh();
      }

      const result = {
        accountNumber: this.accountNumber!,
        sequence: this.sequence!,
      };

      // Increment local sequence for the next tx
      this.sequence!++;

      logger.debug(
        { accountNumber: result.accountNumber, sequence: result.sequence },
        'Sequence reserved',
      );

      return result;
    } finally {
      // Lock is released automatically by promise chain
    }
  }

  /**
   * Handle sequence mismatch error.
   * Resets local state and re-fetches from chain.
   */
  async handleSequenceMismatch(): Promise<void> {
    logger.warn('Sequence mismatch detected, refreshing from chain');
    await this.refresh();
  }

  /** Simple promise-based lock for serialized access */
  private acquireLock(): Promise<void> {
    let release: () => void;
    const prev = this.lock;
    this.lock = new Promise((resolve) => {
      release = resolve;
    });
    return prev.then(() => {
      // Lock acquired; caller's finally block should call nothing
      // (lock is released when the new promise resolves)
      setTimeout(() => release(), 0);
    });
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
