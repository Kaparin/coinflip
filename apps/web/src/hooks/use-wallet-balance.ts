'use client';

import { useQuery } from '@tanstack/react-query';
import { LAUNCH_CW20_CONTRACT } from '@/lib/constants';

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
 * Hook to get the CW20 LAUNCH balance of the connected wallet.
 * Returns the balance in micro-LAUNCH (raw chain units).
 */
export function useWalletBalance(address?: string | null) {
  return useQuery({
    queryKey: ['wallet-cw20-balance', address],
    queryFn: () => fetchCw20Balance(address!),
    enabled: !!address && !!LAUNCH_CW20_CONTRACT,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
