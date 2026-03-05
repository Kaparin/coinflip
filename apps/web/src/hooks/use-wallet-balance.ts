'use client';

import { useQuery } from '@tanstack/react-query';
import { LAUNCH_CW20_CONTRACT, isAxmMode, AXM_DENOM } from '@/lib/constants';
import { isWsConnected, POLL_INTERVAL_WS_CONNECTED, POLL_INTERVAL_WS_DISCONNECTED } from './use-websocket';

/**
 * Fetch CW20 LAUNCH token balance for a given wallet address.
 * Uses the Next.js proxy (/chain-rest) to avoid CORS issues with the chain REST API.
 */
async function fetchCw20Balance(address: string): Promise<string> {
  if (!address || !LAUNCH_CW20_CONTRACT) return '0';

  const query = btoa(JSON.stringify({ balance: { address } }));
  // Use the Next.js rewrite proxy to avoid CORS
  const url = `/chain-rest/cosmwasm/wasm/v1/contract/${LAUNCH_CW20_CONTRACT}/smart/${query}`;

  const res = await fetch(url);
  if (!res.ok) return '0';

  const data = (await res.json()) as { data: { balance: string } };
  return data.data?.balance ?? '0';
}

/**
 * Fetch native AXM balance for a given wallet address.
 * Uses the Next.js proxy (/chain-rest) to avoid CORS issues.
 */
async function fetchNativeBalance(address: string, denom = 'uaxm'): Promise<string> {
  if (!address) return '0';
  const url = `/chain-rest/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=${denom}`;
  const res = await fetch(url);
  if (!res.ok) return '0';
  const data = (await res.json()) as { balance: { amount: string } };
  return data.balance?.amount ?? '0';
}

/**
 * Hook to get the game token balance of the connected wallet.
 * AXM mode: returns native AXM balance. COIN mode: returns CW20 balance.
 * Both return micro-units (raw chain units, 6 decimals).
 */
export function useWalletBalance(address?: string | null) {
  const axmMode = isAxmMode();

  return useQuery({
    queryKey: axmMode ? ['wallet-game-balance', address, 'native'] : ['wallet-cw20-balance', address],
    queryFn: () => axmMode
      ? fetchNativeBalance(address!, AXM_DENOM)
      : fetchCw20Balance(address!),
    enabled: !!address && (axmMode || !!LAUNCH_CW20_CONTRACT),
    refetchInterval: () => isWsConnected() ? POLL_INTERVAL_WS_CONNECTED : POLL_INTERVAL_WS_DISCONNECTED,
    staleTime: 10_000,
  });
}

/**
 * Hook to get the native AXM balance of the connected wallet.
 * Returns the balance in uaxm (raw chain units, 1 AXM = 1_000_000 uaxm).
 * In AXM mode this is the same as useWalletBalance, but kept for gas display.
 */
export function useNativeBalance(address?: string | null) {
  return useQuery({
    queryKey: ['wallet-native-balance', address],
    queryFn: () => fetchNativeBalance(address!),
    enabled: !!address,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Returns the React Query key used by useWalletBalance for cache manipulation */
export function walletBalanceQueryKey(address?: string | null): unknown[] {
  return isAxmMode()
    ? ['wallet-game-balance', address, 'native']
    : ['wallet-cw20-balance', address];
}
