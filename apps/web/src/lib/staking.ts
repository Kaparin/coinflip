/**
 * LAUNCH Staking — contract queries + transaction builders.
 *
 * Queries the staking contract directly via REST API.
 * Transactions are signed locally using the web wallet's CosmJS instance.
 */

import type { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { GasPrice, calculateFee } from '@cosmjs/stargate';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { DEFAULT_GAS_PRICE } from '@coinflip/shared/chain';

// ---- Constants ----

export const STAKING_CONTRACT =
  process.env.NEXT_PUBLIC_STAKING_CONTRACT ||
  'axm1kqwc604nvrqd53zyt5nu93yrcfl6qzpc8as35emysk2slgwsv6eqhznhue';

export const LAUNCH_CW20 =
  process.env.NEXT_PUBLIC_LAUNCH_CW20 ||
  'axm1zvjnc08uy0zz43m0nlh9f5aetpa3amn6a034yqvmsgvzshk9clds375xx9';

export const LAUNCH_DECIMALS = 6;
export const AXM_DECIMALS = 6;

// ---- Error types ----

export type StakingErrorCode =
  | 'network'
  | 'insufficient_funds'
  | 'insufficient_gas'
  | 'not_staked'
  | 'no_rewards'
  | 'rejected'
  | 'timeout'
  | 'signing_failed'
  | 'unknown';

export class StakingError extends Error {
  code: StakingErrorCode;
  rawLog: string;

  constructor(code: StakingErrorCode, rawLog: string, message?: string) {
    super(message ?? rawLog);
    this.name = 'StakingError';
    this.code = code;
    this.rawLog = rawLog;
  }
}

function parseChainError(log: string): StakingErrorCode {
  const l = log.toLowerCase();
  if (l.includes('insufficient funds') || l.includes('overflow: cannot sub')) return 'insufficient_funds';
  if (l.includes('out of gas') || l.includes('insufficient fee')) return 'insufficient_gas';
  if (l.includes('nothing staked') || l.includes('no stake found')) return 'not_staked';
  if (l.includes('no rewards') || l.includes('nothing to claim') || l.includes('no pending rewards')) return 'no_rewards';
  if (l.includes('request rejected') || l.includes('user rejected') || l.includes('rejected')) return 'rejected';
  if (l.includes('timeout') || l.includes('timed out')) return 'timeout';
  return 'unknown';
}

// ---- Types ----

export interface StakingState {
  total_staked: string;
  reward_per_token: string;
  total_distributed: string;
  total_claimed: string;
  total_stakers: number;
  axm_balance: string;
}

export interface StakerInfo {
  staked: string;
  pending_rewards: string;
  total_claimed: string;
}

export interface StakingStats {
  totalStaked: number;
  totalDistributed: number;
  totalClaimed: number;
  totalStakers: number;
  axmBalance: number;
}

export interface UserStakingInfo {
  staked: number;
  pendingRewards: number;
  totalClaimed: number;
  launchBalance: number;
}

/** Callback fired during sign/broadcast phases */
export type PhaseCallback = (phase: 'signing' | 'broadcasting') => void;

// ---- Queries ----

// Use Next.js proxy to avoid CORS issues (direct chain REST blocks browser requests)
function getRestUrl(): string {
  if (typeof window !== 'undefined') return '/chain-rest';
  return process.env.NEXT_PUBLIC_CHAIN_REST_URL || 'https://api-idx.axiomechain.pro';
}

async function queryContract<T>(query: Record<string, unknown>): Promise<T> {
  if (!STAKING_CONTRACT) throw new Error('Staking contract not configured');
  const encoded = btoa(JSON.stringify(query));
  const res = await fetch(
    `${getRestUrl()}/cosmwasm/wasm/v1/contract/${STAKING_CONTRACT}/smart/${encoded}`,
  );
  if (!res.ok) throw new Error(`Contract query failed: ${res.status}`);
  const json = await res.json();
  if (typeof json.data === 'string') {
    return JSON.parse(atob(json.data));
  }
  return json.data as T;
}

async function queryCw20Balance(address: string): Promise<string> {
  const encoded = btoa(JSON.stringify({ balance: { address } }));
  const res = await fetch(
    `${getRestUrl()}/cosmwasm/wasm/v1/contract/${LAUNCH_CW20}/smart/${encoded}`,
  );
  if (!res.ok) return '0';
  const json = await res.json();
  return json.data?.balance ?? '0';
}

export async function getStakingState(): Promise<StakingState> {
  return queryContract<StakingState>({ state: {} });
}

export async function getStakerInfo(address: string): Promise<StakerInfo> {
  return queryContract<StakerInfo>({ staker_info: { address } });
}

/** Fetch combined staking stats (human-readable numbers) */
export async function fetchStakingStats(): Promise<StakingStats> {
  const state = await getStakingState();
  return {
    totalStaked: Number(state.total_staked) / 10 ** LAUNCH_DECIMALS,
    totalDistributed: Number(state.total_distributed) / 10 ** AXM_DECIMALS,
    totalClaimed: Number(state.total_claimed) / 10 ** AXM_DECIMALS,
    totalStakers: state.total_stakers,
    axmBalance: Number(state.axm_balance) / 10 ** AXM_DECIMALS,
  };
}

/** Fetch user staking info (human-readable) */
export async function fetchUserStaking(address: string): Promise<UserStakingInfo> {
  const [info, balance] = await Promise.all([
    getStakerInfo(address),
    queryCw20Balance(address),
  ]);
  return {
    staked: Number(info.staked) / 10 ** LAUNCH_DECIMALS,
    pendingRewards: Number(info.pending_rewards) / 10 ** AXM_DECIMALS,
    totalClaimed: Number(info.total_claimed) / 10 ** AXM_DECIMALS,
    launchBalance: Number(balance) / 10 ** LAUNCH_DECIMALS,
  };
}

// ---- Transactions ----
//
// All staking transactions use sign() + broadcast_tx_sync for instant response.
// Does NOT wait for block inclusion — avoids 60s timeout through Vercel proxy.

const STAKING_GAS_LIMIT = 500_000;

function getRpcUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/chain-rpc`;
  }
  return process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:26657';
}

async function getClient(wallet: DirectSecp256k1HdWallet): Promise<SigningCosmWasmClient> {
  return SigningCosmWasmClient.connectWithSigner(getRpcUrl(), wallet, {
    gasPrice: GasPrice.fromString(DEFAULT_GAS_PRICE),
  });
}

/** Sign + broadcast_tx_sync — returns txHash as soon as mempool accepts */
async function broadcastSync(txRaw: TxRaw): Promise<string> {
  const txBytes = TxRaw.encode(txRaw).finish();
  const rpcUrl = getRpcUrl();
  const hexTx = Array.from(txBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  let res: Response;
  try {
    res = await fetch(`${rpcUrl}/broadcast_tx_sync?tx=0x${hexTx}`);
  } catch {
    throw new StakingError('network', 'fetch failed');
  }

  if (!res.ok) {
    throw new StakingError('network', `HTTP ${res.status}`);
  }

  const data = await res.json() as {
    result?: { hash?: string; code?: number; log?: string };
  };

  if (!data.result?.hash) {
    throw new StakingError('network', 'no hash in response');
  }

  if (data.result.code !== 0) {
    const log = data.result.log || `code ${data.result.code}`;
    throw new StakingError(parseChainError(log), log);
  }

  return data.result.hash;
}

/** Stake LAUNCH tokens (CW20 Send → staking contract) */
export async function signStake(
  wallet: DirectSecp256k1HdWallet,
  address: string,
  humanAmount: number,
  onPhase?: PhaseCallback,
): Promise<{ txHash: string }> {
  onPhase?.('signing');

  let client: SigningCosmWasmClient;
  try {
    client = await getClient(wallet);
  } catch {
    throw new StakingError('signing_failed', 'Failed to connect wallet');
  }

  const microAmount = Math.floor(humanAmount * 10 ** LAUNCH_DECIMALS).toString();
  const fee = calculateFee(STAKING_GAS_LIMIT, GasPrice.fromString(DEFAULT_GAS_PRICE));

  const msg = {
    typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
    value: {
      sender: address,
      contract: LAUNCH_CW20,
      msg: new TextEncoder().encode(JSON.stringify({
        send: {
          contract: STAKING_CONTRACT,
          amount: microAmount,
          msg: btoa(JSON.stringify({ stake: {} })),
        },
      })),
      funds: [],
    },
  };

  let txRaw: TxRaw;
  try {
    txRaw = await client.sign(address, [msg], fee, 'Stake LAUNCH');
  } catch (err) {
    client.disconnect();
    const msg = err instanceof Error ? err.message : 'sign failed';
    if (msg.toLowerCase().includes('rejected')) {
      throw new StakingError('rejected', msg);
    }
    throw new StakingError('signing_failed', msg);
  }
  client.disconnect();

  onPhase?.('broadcasting');
  const txHash = await broadcastSync(txRaw);
  return { txHash };
}

/** Unstake LAUNCH tokens */
export async function signUnstake(
  wallet: DirectSecp256k1HdWallet,
  address: string,
  humanAmount: number,
  onPhase?: PhaseCallback,
): Promise<{ txHash: string }> {
  onPhase?.('signing');

  let client: SigningCosmWasmClient;
  try {
    client = await getClient(wallet);
  } catch {
    throw new StakingError('signing_failed', 'Failed to connect wallet');
  }

  const microAmount = Math.floor(humanAmount * 10 ** LAUNCH_DECIMALS).toString();
  const fee = calculateFee(STAKING_GAS_LIMIT, GasPrice.fromString(DEFAULT_GAS_PRICE));

  const msg = {
    typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
    value: {
      sender: address,
      contract: STAKING_CONTRACT,
      msg: new TextEncoder().encode(JSON.stringify({ unstake: { amount: microAmount } })),
      funds: [],
    },
  };

  let txRaw: TxRaw;
  try {
    txRaw = await client.sign(address, [msg], fee, 'Unstake LAUNCH');
  } catch (err) {
    client.disconnect();
    const msg = err instanceof Error ? err.message : 'sign failed';
    if (msg.toLowerCase().includes('rejected')) {
      throw new StakingError('rejected', msg);
    }
    throw new StakingError('signing_failed', msg);
  }
  client.disconnect();

  onPhase?.('broadcasting');
  const txHash = await broadcastSync(txRaw);
  return { txHash };
}

/** Claim AXM rewards */
export async function signClaim(
  wallet: DirectSecp256k1HdWallet,
  address: string,
  onPhase?: PhaseCallback,
): Promise<{ txHash: string }> {
  onPhase?.('signing');

  let client: SigningCosmWasmClient;
  try {
    client = await getClient(wallet);
  } catch {
    throw new StakingError('signing_failed', 'Failed to connect wallet');
  }

  const fee = calculateFee(STAKING_GAS_LIMIT, GasPrice.fromString(DEFAULT_GAS_PRICE));

  const msg = {
    typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
    value: {
      sender: address,
      contract: STAKING_CONTRACT,
      msg: new TextEncoder().encode(JSON.stringify({ claim: {} })),
      funds: [],
    },
  };

  let txRaw: TxRaw;
  try {
    txRaw = await client.sign(address, [msg], fee, 'Claim staking rewards');
  } catch (err) {
    client.disconnect();
    const msg = err instanceof Error ? err.message : 'sign failed';
    if (msg.toLowerCase().includes('rejected')) {
      throw new StakingError('rejected', msg);
    }
    throw new StakingError('signing_failed', msg);
  }
  client.disconnect();

  onPhase?.('broadcasting');
  const txHash = await broadcastSync(txRaw);
  return { txHash };
}

// ---- Helpers ----

export function formatNumber(n: number, decimals = 2): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(decimals)}K`;
  return n.toFixed(decimals);
}
