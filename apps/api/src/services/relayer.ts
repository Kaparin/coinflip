/**
 * Relayer Service — Delegated Execution via Cosmos x/authz.
 *
 * The Relayer holds a hot wallet key (grantee) and submits MsgExec
 * transactions on behalf of users who have granted Authz permissions.
 *
 * Transaction structure:
 *   MsgExec {
 *     grantee: relayer_address,
 *     msgs: [MsgExecuteContract { sender: user, contract: coinflip, msg: {...} }]
 *   }
 * Fee payer: Treasury (via feegranter field)
 *
 * Sequence management:
 *   Uses explicit sign() + broadcastTx() with signerData to control
 *   the account sequence locally. This avoids the overhead of reconnecting
 *   the client for every transaction and eliminates stale-sequence races.
 */

import { DirectSecp256k1HdWallet, Registry } from '@cosmjs/proto-signing';
import { SigningStargateClient, GasPrice, StdFee, SignerData } from '@cosmjs/stargate';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
import { MsgExec } from 'cosmjs-types/cosmos/authz/v1beta1/tx';
import { toUtf8, fromHex, toBase64 } from '@cosmjs/encoding';
import { stringToPath } from '@cosmjs/crypto';
import { AXIOME_PREFIX, AXIOME_HD_PATH, FEE_DENOM, DEFAULT_EXEC_GAS_LIMIT } from '@coinflip/shared/chain';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { SequenceManager } from './sequence-manager.js';
import { relayerTxLogService } from './relayer-tx-log.service.js';

/** Custom registry with authz + cosmwasm message types */
function createRegistry(): Registry {
  const registry = new Registry();
  registry.register('/cosmos.authz.v1beta1.MsgExec', MsgExec);
  registry.register('/cosmwasm.wasm.v1.MsgExecuteContract', MsgExecuteContract);
  return registry;
}

/** Relayer tx result */
export interface RelayResult {
  success: boolean;
  txHash?: string;
  height?: number;
  code?: number;
  rawLog?: string;
  error?: string;
  /** True when tx was broadcast but confirmation timed out (tx may still succeed) */
  timeout?: boolean;
  events?: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
}

/**
 * CoinFlip contract execute message types that the relayer can submit.
 * Must match the Authz grant's AcceptedMessageKeysFilter.
 */
export type ContractAction =
  | { deposit: {} }
  | { withdraw: { amount: string } }
  | { create_bet: { amount: string; commitment: string } }
  | { accept_bet: { bet_id: number; guess: 'heads' | 'tails' } }
  | { accept_and_reveal: { bet_id: number; guess: 'heads' | 'tails'; side: 'heads' | 'tails'; secret: string } }
  | { reveal: { bet_id: number; side: 'heads' | 'tails'; secret: string } }
  | { cancel_bet: { bet_id: number } }
  | { claim_timeout: { bet_id: number } };

/** Parse "expected X, got Y" from a sequence mismatch error */
function parseExpectedSequence(errorMsg: string): number | null {
  // Cosmos SDK: "account sequence mismatch, expected 42, got 40: incorrect account sequence"
  const m = errorMsg.match(/expected\s+(\d+)/);
  return m?.[1] ? parseInt(m[1], 10) : null;
}

export class RelayerService {
  private client: SigningStargateClient | null = null;
  private wallet: DirectSecp256k1HdWallet | null = null;
  private sequenceManager: SequenceManager;
  private relayerAddress: string;
  private contractAddress: string;
  private treasuryAddress: string;
  private chainId: string;
  private initialized = false;

  /** Promise-chain mutex: serializes the entire sign+broadcast+retry cycle */
  private _broadcastQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.relayerAddress = env.RELAYER_ADDRESS;
    this.contractAddress = env.COINFLIP_CONTRACT_ADDR;
    this.treasuryAddress = env.TREASURY_ADDRESS;
    this.chainId = env.AXIOME_CHAIN_ID;
    this.sequenceManager = new SequenceManager(env.AXIOME_RPC_URL, this.relayerAddress);
  }

  /** Initialize wallet, client, and sequence manager */
  async init(): Promise<void> {
    if (this.initialized) return;

    if (!env.RELAYER_MNEMONIC) {
      logger.warn('RELAYER_MNEMONIC not set — relayer service disabled');
      return;
    }

    if (!this.contractAddress) {
      logger.warn('COINFLIP_CONTRACT_ADDR not set — relayer service disabled');
      return;
    }

    try {
      // Create wallet from mnemonic with Axiome prefix and coin type 546
      this.wallet = await DirectSecp256k1HdWallet.fromMnemonic(env.RELAYER_MNEMONIC, {
        prefix: AXIOME_PREFIX,
        hdPaths: [stringToPath(AXIOME_HD_PATH)],
      });

      const [account] = await this.wallet.getAccounts();
      if (account!.address !== this.relayerAddress) {
        logger.warn(
          { expected: this.relayerAddress, got: account!.address },
          'Relayer address mismatch — check RELAYER_MNEMONIC and RELAYER_ADDRESS',
        );
        this.relayerAddress = account!.address;
      }

      // Create signing client — kept persistently (no reconnect per-tx)
      const registry = createRegistry();
      this.client = await SigningStargateClient.connectWithSigner(
        env.AXIOME_RPC_URL,
        this.wallet,
        {
          registry,
          gasPrice: GasPrice.fromString(`0.025${FEE_DENOM}`),
        },
      );

      // Initialize sequence manager (fetches fresh sequence from chain)
      await this.sequenceManager.init();

      this.initialized = true;
      logger.info(
        {
          relayer: this.relayerAddress,
          contract: this.contractAddress,
          chainId: this.chainId,
        },
        'Relayer service initialized',
      );
    } catch (err) {
      logger.error({ err }, 'Failed to initialize relayer service');
      throw err;
    }
  }

  /** Check if relayer is ready */
  isReady(): boolean {
    return this.initialized && this.client !== null;
  }

  /**
   * Submit a MsgExec transaction on behalf of a user.
   *
   * Serialized by broadcast queue — each sign+broadcast+retry cycle runs
   * one at a time to guarantee strict nonce ordering on chain.
   *
   * @param asyncMode — if true, return immediately after broadcastTxSync
   *   (skip the 25s poll for block inclusion). The tx is confirmed in the background
   *   by the caller. This brings response time from ~25s down to ~2s.
   */
  async submitExec(
    userAddress: string,
    action: ContractAction,
    memo = '',
    asyncMode = false,
  ): Promise<RelayResult> {
    if (!this.isReady()) {
      return { success: false, error: 'Relayer not initialized' };
    }

    return this._submitExecInner(userAddress, action, memo, asyncMode);
  }

  /** Build the MsgAny + fee for a given user action */
  private buildTxPayload(
    userAddress: string,
    action: ContractAction | Record<string, unknown>,
    contractAddr?: string,
  ) {
    const innerMsg: MsgExecuteContract = {
      sender: userAddress,
      contract: contractAddr ?? this.contractAddress,
      msg: toUtf8(JSON.stringify(action)),
      funds: [],
    };
    const execMsg: MsgExec = {
      grantee: this.relayerAddress,
      msgs: [{
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
        value: MsgExecuteContract.encode(innerMsg).finish(),
      }],
    };
    const msgAny = {
      typeUrl: '/cosmos.authz.v1beta1.MsgExec',
      value: execMsg,
    };
    const fee: StdFee = {
      amount: [{ denom: FEE_DENOM, amount: '12500' }],
      gas: String(DEFAULT_EXEC_GAS_LIMIT),
      ...(this.treasuryAddress ? { granter: this.treasuryAddress } : {}),
    };
    return { msgAny, fee };
  }

  /**
   * Promise-chain mutex for broadcast serialization.
   * Ensures sign+broadcast+retry cycles execute one at a time in strict nonce order.
   * Each broadcastTxSync takes ~100ms, so throughput is ~10 tx/sec — more than sufficient.
   */
  private acquireBroadcastLock(): Promise<() => void> {
    let outerResolve: (release: () => void) => void;
    const result = new Promise<() => void>((resolve) => {
      outerResolve = resolve;
    });

    const prev = this._broadcastQueue;
    let releaseFn: () => void;
    this._broadcastQueue = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });

    prev.then(() => {
      outerResolve!(releaseFn!);
    });

    return result;
  }

  /**
   * Internal: sign + broadcast with explicit sequence tracking.
   * Up to 3 attempts: on sequence mismatch, parse the expected sequence and retry.
   * Serialized by broadcast lock — only one tx goes through sign+broadcast at a time.
   */
  private async _submitExecInner(
    userAddress: string,
    action: ContractAction | Record<string, unknown>,
    memo: string,
    asyncMode = false,
    contractOverride?: string,
  ): Promise<RelayResult> {
    const actionKey = Object.keys(action)[0]!;
    const targetContract = contractOverride ?? this.contractAddress;
    logger.info(
      { user: userAddress, action: actionKey, contract: targetContract },
      'Submitting MsgExec',
    );

    const { msgAny, fee } = this.buildTxPayload(userAddress, action, contractOverride);

    // Log tx start (before broadcast)
    const startTime = Date.now();
    const logId = await relayerTxLogService.logStart({
      userAddress,
      contractAddress: targetContract,
      action: actionKey,
      actionPayload: action,
      memo: memo || undefined,
    });

    const release = await this.acquireBroadcastLock();
    let result: RelayResult;
    try {
    let lastAttempt = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      lastAttempt = attempt;
      try {
        // 1. Get next sequence from our local manager
        const { accountNumber, sequence } = await this.sequenceManager.getAndIncrement();
        const signerData: SignerData = {
          accountNumber,
          sequence,
          chainId: this.chainId,
        };

        logger.debug(
          { accountNumber, sequence, attempt, action: actionKey },
          'Signing tx with explicit signerData',
        );

        // 2. Sign with explicit signerData (no chain query needed)
        const txRaw = await this.client!.sign(
          this.relayerAddress,
          [msgAny],
          fee,
          memo,
          signerData,
        );
        const txBytes = TxRaw.encode(txRaw).finish();

        // 3. Broadcast SYNC (instant mempool acceptance) + poll for result
        //    Step 1: broadcastTxSync — returns tx hash instantly if CheckTx passes
        //    Step 2: poll chain for tx result — wait until tx is in a block (max ~12s)
        const txHashHex = await this.client!.broadcastTxSync(txBytes);
        const txHash = typeof txHashHex === 'string'
          ? txHashHex
          : Buffer.from(txHashHex).toString('hex').toUpperCase();

        logger.info(
          { txHash, action: actionKey, sequence, asyncMode },
          'Tx in mempool (sync)',
        );

        // In async mode, return immediately — caller handles confirmation in background
        if (asyncMode) {
          result = { success: true, txHash, code: 0 };
          await relayerTxLogService.logComplete(logId, { txHash, success: true, code: 0, durationMs: Date.now() - startTime, attempt: lastAttempt });
          return result;
        }

        // Step 2: Poll for tx inclusion with timeout
        const pollStartTime = Date.now();
        const maxPollMs = 25_000; // 25 seconds — covers 3+ Axiome blocks
        const pollIntervalMs = 2_000;
        let txResult: { code: number; rawLog: string; height: number; events: unknown[] } | null = null;

        while (Date.now() - pollStartTime < maxPollMs) {
          await new Promise(r => setTimeout(r, pollIntervalMs));
          try {
            const txRes = await fetch(
              `${env.AXIOME_REST_URL}/cosmos/tx/v1beta1/txs/${txHash}`,
              { signal: AbortSignal.timeout(5000) },
            );
            if (txRes.ok) {
              const txData = await txRes.json() as {
                tx_response?: {
                  code: number;
                  raw_log?: string;
                  height?: string;
                  events?: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
                };
              };
              if (txData.tx_response) {
                txResult = {
                  code: txData.tx_response.code,
                  rawLog: txData.tx_response.raw_log ?? '',
                  height: Number(txData.tx_response.height ?? 0),
                  events: txData.tx_response.events ?? [],
                };
                break;
              }
            }
          } catch {
            // tx not yet indexed — keep polling
          }
        }

        if (!txResult) {
          // Timeout — tx is in mempool but not yet in block
          logger.warn({ txHash, action: actionKey }, 'Tx poll timeout — tx still in mempool');
          result = { success: true, txHash, code: 0, timeout: true };
          await relayerTxLogService.logComplete(logId, { txHash, success: true, code: 0, durationMs: Date.now() - startTime, attempt: lastAttempt });
          return result;
        }

        if (txResult.code !== 0) {
          const rawLog = txResult.rawLog;

          // Sequence mismatch — retry (allow retries on all attempts except the last)
          if (
            attempt < 2 &&
            (rawLog.includes('account sequence mismatch') ||
             rawLog.includes('incorrect account sequence'))
          ) {
            const expected = parseExpectedSequence(rawLog);
            if (expected !== null) {
              await this.sequenceManager.forceSet(expected);
            } else {
              await this.sequenceManager.handleSequenceMismatch();
            }
            continue;
          }

          logger.error({ code: txResult.code, rawLog, txHash }, 'MsgExec failed on chain');
          result = {
            success: false,
            txHash,
            code: txResult.code,
            rawLog,
            error: rawLog || `Tx failed with code ${txResult.code}`,
          };
          await relayerTxLogService.logComplete(logId, { txHash, success: false, code: txResult.code, rawLog, height: txResult.height, durationMs: Date.now() - startTime, attempt: lastAttempt });
          return result;
        }

        // Success
        logger.info(
          { txHash, height: txResult.height, action: actionKey, sequence },
          'MsgExec succeeded',
        );

        result = {
          success: true,
          txHash,
          height: txResult.height,
          code: 0,
          events: txResult.events as RelayResult['events'],
        };
        await relayerTxLogService.logComplete(logId, { txHash, success: true, code: 0, height: txResult.height, durationMs: Date.now() - startTime, attempt: lastAttempt });
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err, user: userAddress, action: actionKey, attempt }, 'MsgExec submission error');

        // Sequence mismatch in catch — parse expected, force-set, retry
        if (
          attempt < 2 &&
          (errorMsg.includes('account sequence mismatch') ||
           errorMsg.includes('incorrect account sequence'))
        ) {
          const expected = parseExpectedSequence(errorMsg);
          if (expected !== null) {
            logger.warn({ errorMsg, expected }, 'Sequence mismatch (catch) — force-setting and retrying');
            await this.sequenceManager.forceSet(expected);
          } else {
            logger.warn('Sequence mismatch (catch) — refreshing from chain and retrying');
            await this.sequenceManager.handleSequenceMismatch();
          }
          continue;
        }

        // "tx already exists in cache" — tx was sent before and is pending in mempool
        if (errorMsg.includes('tx already exists in cache')) {
          logger.warn(
            { user: userAddress, action: actionKey },
            'Tx already in mempool — treating as pending',
          );
          result = {
            success: false,
            timeout: true,
            error: 'Transaction is already pending in the mempool. Please wait for it to be included.',
          };
          await relayerTxLogService.logComplete(logId, { success: false, durationMs: Date.now() - startTime, attempt: lastAttempt });
          return result;
        }

        // Detect timeout errors
        if (
          errorMsg.includes('was submitted but was not yet found on the chain') ||
          errorMsg.includes('TimeoutError') ||
          errorMsg.includes('BROADCAST_TIMEOUT') ||
          (err instanceof Error && err.constructor.name === 'TimeoutError')
        ) {
          const txHashMatch = errorMsg.match(/Transaction with ID ([A-F0-9]+)/);
          const pendingTxHash = txHashMatch?.[1];
          logger.warn(
            { txHash: pendingTxHash, user: userAddress, action: actionKey },
            'MsgExec broadcast timeout — tx may still be included in a future block',
          );
          result = {
            success: false,
            timeout: true,
            txHash: pendingTxHash,
            error: 'Transaction was submitted but not yet confirmed. It may still succeed.',
          };
          await relayerTxLogService.logComplete(logId, { txHash: pendingTxHash, success: false, durationMs: Date.now() - startTime, attempt: lastAttempt });
          return result;
        }

        result = { success: false, error: errorMsg };
        await relayerTxLogService.logComplete(logId, { success: false, durationMs: Date.now() - startTime, attempt: lastAttempt });
        return result;
      }
    }

    // Should not reach here, but just in case
    result = { success: false, error: 'Max retry attempts reached' };
    await relayerTxLogService.logComplete(logId, { success: false, durationMs: Date.now() - startTime, attempt: 2 });
    return result;
    } finally {
      release();
    }
  }

  // ---- Custom contract execution (for CW20 transfers, etc.) ----

  /**
   * Execute an action on ANY contract via authz MsgExec.
   * The user must have granted GenericAuthorization for MsgExecuteContract.
   */
  async submitExecOnContract(
    userAddress: string,
    contractAddress: string,
    action: Record<string, unknown>,
    memo = '',
  ): Promise<RelayResult> {
    if (!this.isReady()) {
      return { success: false, error: 'Relayer not initialized' };
    }
    return this._submitExecInner(userAddress, action, memo, false, contractAddress);
  }

  /**
   * Transfer CW20 tokens from user to recipient via authz.
   * Executes `transfer { recipient, amount }` on the CW20 contract on behalf of the user.
   */
  async relayCw20Transfer(
    userAddress: string,
    cw20Contract: string,
    recipient: string,
    amount: string,
    memo = '',
  ): Promise<RelayResult> {
    return this.submitExecOnContract(
      userAddress,
      cw20Contract,
      { transfer: { recipient, amount } },
      memo || 'CoinFlip fee transfer',
    );
  }

  // ---- Convenience methods for CoinFlip contract actions ----

  async relayDeposit(userAddress: string): Promise<RelayResult> {
    return this.submitExec(userAddress, { deposit: {} });
  }

  async relayWithdraw(userAddress: string, amount: string, asyncMode = false): Promise<RelayResult> {
    return this.submitExec(userAddress, { withdraw: { amount } }, '', asyncMode);
  }

  async relayCreateBet(
    userAddress: string,
    amount: string,
    commitmentHex: string,
    asyncMode = false,
  ): Promise<RelayResult> {
    const commitmentBase64 = toBase64(fromHex(commitmentHex));
    return this.submitExec(userAddress, { create_bet: { amount, commitment: commitmentBase64 } }, '', asyncMode);
  }

  async relayAcceptBet(
    userAddress: string,
    betId: number,
    guess: 'heads' | 'tails',
    asyncMode = false,
  ): Promise<RelayResult> {
    return this.submitExec(userAddress, { accept_bet: { bet_id: betId, guess } }, '', asyncMode);
  }

  async relayAcceptAndReveal(
    acceptorAddress: string,
    betId: number,
    guess: 'heads' | 'tails',
    makerSide: 'heads' | 'tails',
    makerSecretHex: string,
    asyncMode = false,
  ): Promise<RelayResult> {
    const secretBase64 = toBase64(fromHex(makerSecretHex));
    return this.submitExec(
      acceptorAddress,
      { accept_and_reveal: { bet_id: betId, guess, side: makerSide, secret: secretBase64 } },
      '',
      asyncMode,
    );
  }

  async relayReveal(
    userAddress: string,
    betId: number,
    side: 'heads' | 'tails',
    secretHex: string,
    asyncMode = false,
  ): Promise<RelayResult> {
    const secretBase64 = toBase64(fromHex(secretHex));
    return this.submitExec(userAddress, { reveal: { bet_id: betId, side, secret: secretBase64 } }, '', asyncMode);
  }

  async relayCancelBet(userAddress: string, betId: number, asyncMode = false): Promise<RelayResult> {
    return this.submitExec(userAddress, { cancel_bet: { bet_id: betId } }, '', asyncMode);
  }

  async relayClaimTimeout(userAddress: string, betId: number, asyncMode = false): Promise<RelayResult> {
    return this.submitExec(userAddress, { claim_timeout: { bet_id: betId } }, '', asyncMode);
  }

  /** Get relayer account balance (for monitoring) */
  async getRelayerBalance(): Promise<string> {
    if (!this.client) return '0';
    const balance = await this.client.getBalance(this.relayerAddress, FEE_DENOM);
    return balance.amount;
  }

  /** Get sequence manager state (for health checks) */
  getSequenceState() {
    return this.sequenceManager.getState();
  }

  /** Disconnect client */
  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
      this.initialized = false;
    }
  }
}

/** Singleton relayer instance */
export const relayerService = new RelayerService();
