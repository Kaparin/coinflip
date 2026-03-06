/**
 * LAUNCH Staking — contract queries + transaction builders.
 *
 * Queries the staking contract directly via REST API.
 * Transactions are signed locally using the web wallet's CosmJS instance.
 */

import type { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { GasPrice, calculateFee } from '@cosmjs/stargate';
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

// ---- Queries ----

const REST_URL =
  process.env.NEXT_PUBLIC_AXIOME_REST ||
  'https://api-chain.axiomechain.org';

async function queryContract<T>(query: Record<string, unknown>): Promise<T> {
  if (!STAKING_CONTRACT) throw new Error('Staking contract not configured');
  const encoded = btoa(JSON.stringify(query));
  const res = await fetch(
    `${REST_URL}/cosmwasm/wasm/v1/contract/${STAKING_CONTRACT}/smart/${encoded}`,
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
    `${REST_URL}/cosmwasm/wasm/v1/contract/${LAUNCH_CW20}/smart/${encoded}`,
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
    broadcastTimeoutMs: 60_000,
    broadcastPollIntervalMs: 2_000,
  });
}

/** Stake LAUNCH tokens (CW20 Send → staking contract) */
export async function signStake(
  wallet: DirectSecp256k1HdWallet,
  address: string,
  humanAmount: number,
): Promise<{ txHash: string }> {
  const client = await getClient(wallet);
  const microAmount = Math.floor(humanAmount * 10 ** LAUNCH_DECIMALS).toString();
  const fee = calculateFee(STAKING_GAS_LIMIT, GasPrice.fromString(DEFAULT_GAS_PRICE));

  const result = await client.execute(
    address,
    LAUNCH_CW20,
    {
      send: {
        contract: STAKING_CONTRACT,
        amount: microAmount,
        msg: btoa(JSON.stringify({ stake: {} })),
      },
    },
    fee,
    'Stake LAUNCH',
  );

  client.disconnect();
  return { txHash: result.transactionHash };
}

/** Unstake LAUNCH tokens */
export async function signUnstake(
  wallet: DirectSecp256k1HdWallet,
  address: string,
  humanAmount: number,
): Promise<{ txHash: string }> {
  const client = await getClient(wallet);
  const microAmount = Math.floor(humanAmount * 10 ** LAUNCH_DECIMALS).toString();
  const fee = calculateFee(STAKING_GAS_LIMIT, GasPrice.fromString(DEFAULT_GAS_PRICE));

  const result = await client.execute(
    address,
    STAKING_CONTRACT,
    { unstake: { amount: microAmount } },
    fee,
    'Unstake LAUNCH',
  );

  client.disconnect();
  return { txHash: result.transactionHash };
}

/** Claim AXM rewards */
export async function signClaim(
  wallet: DirectSecp256k1HdWallet,
  address: string,
): Promise<{ txHash: string }> {
  const client = await getClient(wallet);
  const fee = calculateFee(STAKING_GAS_LIMIT, GasPrice.fromString(DEFAULT_GAS_PRICE));

  const result = await client.execute(
    address,
    STAKING_CONTRACT,
    { claim: {} },
    fee,
    'Claim staking rewards',
  );

  client.disconnect();
  return { txHash: result.transactionHash };
}

// ---- Helpers ----

export function formatNumber(n: number, decimals = 2): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(decimals)}K`;
  return n.toFixed(decimals);
}
