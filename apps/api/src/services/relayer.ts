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
 * Axiome Chain specifics:
 *   - Chain ID: axiome-1
 *   - Address prefix: axm (addresses: axm1...)
 *   - Cosmos SDK v0.50.3, wasmd v0.50.0, cosmwasm_1_4
 *   - CW20 LAUNCH token for vault operations
 *   - REST gateway: https://api-chain.axiomechain.org
 *   - Node source: https://github.com/axiome-pro/axm-node
 */

import { DirectSecp256k1HdWallet, Registry } from '@cosmjs/proto-signing';
import { SigningStargateClient, GasPrice, StdFee } from '@cosmjs/stargate';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
import { MsgExec } from 'cosmjs-types/cosmos/authz/v1beta1/tx';
import { toUtf8 } from '@cosmjs/encoding';
import { stringToPath } from '@cosmjs/crypto';
import { AXIOME_PREFIX, AXIOME_HD_PATH, FEE_DENOM, DEFAULT_EXEC_GAS_LIMIT, GAS_ADJUSTMENT } from '@coinflip/shared/chain';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { SequenceManager } from './sequence-manager.js';

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
  | { reveal: { bet_id: number; side: 'heads' | 'tails'; secret: string } }
  | { cancel_bet: { bet_id: number } }
  | { claim_timeout: { bet_id: number } };

export class RelayerService {
  private client: SigningStargateClient | null = null;
  private wallet: DirectSecp256k1HdWallet | null = null;
  private sequenceManager: SequenceManager;
  private relayerAddress: string;
  private contractAddress: string;
  private treasuryAddress: string;
  private initialized = false;

  constructor() {
    this.relayerAddress = env.RELAYER_ADDRESS;
    this.contractAddress = env.COINFLIP_CONTRACT_ADDR;
    this.treasuryAddress = env.TREASURY_ADDRESS;
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

      // Create signing client with custom registry
      const registry = createRegistry();
      this.client = await SigningStargateClient.connectWithSigner(
        env.AXIOME_RPC_URL,
        this.wallet,
        {
          registry,
          gasPrice: GasPrice.fromString(`0.025${FEE_DENOM}`),
        },
      );

      // Initialize sequence manager
      await this.sequenceManager.init();

      this.initialized = true;
      logger.info(
        {
          relayer: this.relayerAddress,
          contract: this.contractAddress,
          chainId: env.AXIOME_CHAIN_ID,
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
   * @param userAddress - The user's Axiome address (granter)
   * @param action - The contract execute message to relay
   * @param memo - Optional tx memo
   * @returns Relay result with txHash on success
   */
  async submitExec(
    userAddress: string,
    action: ContractAction,
    memo = '',
  ): Promise<RelayResult> {
    if (!this.isReady()) {
      return { success: false, error: 'Relayer not initialized' };
    }

    const actionKey = Object.keys(action)[0]!;
    logger.info(
      { user: userAddress, action: actionKey, contract: this.contractAddress },
      'Submitting MsgExec',
    );

    try {
      // Build the inner MsgExecuteContract (sender = user, executed via authz)
      const innerMsg: MsgExecuteContract = {
        sender: userAddress,
        contract: this.contractAddress,
        msg: toUtf8(JSON.stringify(action)),
        funds: [],
      };

      // Build MsgExec wrapping the inner message
      const execMsg: MsgExec = {
        grantee: this.relayerAddress,
        msgs: [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: MsgExecuteContract.encode(innerMsg).finish(),
          },
        ],
      };

      const msgAny = {
        typeUrl: '/cosmos.authz.v1beta1.MsgExec',
        value: execMsg,
      };

      // Fee with feegranter (treasury pays gas)
      const fee: StdFee = {
        amount: [{ denom: FEE_DENOM, amount: '12500' }],
        gas: String(DEFAULT_EXEC_GAS_LIMIT),
        granter: this.treasuryAddress || undefined,
      };

      // Get sequence
      const { accountNumber, sequence } = await this.sequenceManager.getNextSequence();

      // Sign and broadcast
      const result = await this.client!.signAndBroadcast(
        this.relayerAddress,
        [msgAny],
        fee,
        memo,
      );

      if (result.code !== 0) {
        // Check for sequence mismatch
        if (
          result.rawLog?.includes('account sequence mismatch') ||
          result.rawLog?.includes('incorrect account sequence')
        ) {
          logger.warn(
            { txHash: result.transactionHash, rawLog: result.rawLog },
            'Sequence mismatch — retrying once',
          );
          await this.sequenceManager.handleSequenceMismatch();

          // Retry once
          const retryResult = await this.client!.signAndBroadcast(
            this.relayerAddress,
            [msgAny],
            fee,
            memo,
          );

          if (retryResult.code !== 0) {
            logger.error(
              {
                code: retryResult.code,
                rawLog: retryResult.rawLog,
                txHash: retryResult.transactionHash,
              },
              'MsgExec retry failed',
            );
            return {
              success: false,
              txHash: retryResult.transactionHash,
              code: retryResult.code,
              rawLog: retryResult.rawLog,
              error: `Tx failed with code ${retryResult.code}`,
            };
          }

          logger.info(
            {
              txHash: retryResult.transactionHash,
              height: retryResult.height,
              action: actionKey,
            },
            'MsgExec retry succeeded',
          );

          return {
            success: true,
            txHash: retryResult.transactionHash,
            height: retryResult.height,
            code: retryResult.code,
          };
        }

        logger.error(
          { code: result.code, rawLog: result.rawLog, txHash: result.transactionHash },
          'MsgExec failed',
        );
        return {
          success: false,
          txHash: result.transactionHash,
          code: result.code,
          rawLog: result.rawLog,
          error: `Tx failed with code ${result.code}`,
        };
      }

      logger.info(
        { txHash: result.transactionHash, height: result.height, action: actionKey },
        'MsgExec succeeded',
      );

      return {
        success: true,
        txHash: result.transactionHash,
        height: result.height,
        code: result.code,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err, user: userAddress, action: actionKey }, 'MsgExec submission error');

      // Handle sequence mismatch from signing errors
      if (errorMsg.includes('account sequence mismatch')) {
        await this.sequenceManager.handleSequenceMismatch();
      }

      return { success: false, error: errorMsg };
    }
  }

  // ---- Convenience methods for each contract action ----

  async relayDeposit(userAddress: string): Promise<RelayResult> {
    return this.submitExec(userAddress, { deposit: {} });
  }

  async relayWithdraw(userAddress: string, amount: string): Promise<RelayResult> {
    return this.submitExec(userAddress, { withdraw: { amount } });
  }

  async relayCreateBet(
    userAddress: string,
    amount: string,
    commitment: string,
  ): Promise<RelayResult> {
    return this.submitExec(userAddress, { create_bet: { amount, commitment } });
  }

  async relayAcceptBet(
    userAddress: string,
    betId: number,
    guess: 'heads' | 'tails',
  ): Promise<RelayResult> {
    return this.submitExec(userAddress, { accept_bet: { bet_id: betId, guess } });
  }

  async relayReveal(
    userAddress: string,
    betId: number,
    side: 'heads' | 'tails',
    secret: string,
  ): Promise<RelayResult> {
    return this.submitExec(userAddress, { reveal: { bet_id: betId, side, secret } });
  }

  async relayCancelBet(userAddress: string, betId: number): Promise<RelayResult> {
    return this.submitExec(userAddress, { cancel_bet: { bet_id: betId } });
  }

  async relayClaimTimeout(userAddress: string, betId: number): Promise<RelayResult> {
    return this.submitExec(userAddress, { claim_timeout: { bet_id: betId } });
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
