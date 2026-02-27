'use client';

import { useQuery } from '@tanstack/react-query';
import { PRESALE_CONTRACT } from '@/lib/constants';

/** Query a CosmWasm contract via Next.js proxy to avoid CORS */
async function queryContract<T>(contractAddr: string, queryMsg: Record<string, unknown>): Promise<T> {
  const base64Msg = btoa(JSON.stringify(queryMsg));
  const res = await fetch(
    `/chain-rest/cosmwasm/wasm/v1/contract/${contractAddr}/smart/${base64Msg}`,
  );
  if (!res.ok) {
    throw new Error(`Contract query failed: ${res.status}`);
  }
  const json = await res.json();
  return json.data as T;
}

export interface PresaleConfig {
  admin: string;
  coin_cw20: string;
  rate_num: number;
  rate_denom: number;
  enabled: boolean;
  max_per_tx: string;
  total_axm_received: string;
  total_coin_sold: string;
}

export interface PresaleStatus {
  coin_available: string;
  axm_balance: string;
  rate_num: number;
  rate_denom: number;
  enabled: boolean;
}

export function usePresaleConfig() {
  return useQuery({
    queryKey: ['presale', 'config'],
    queryFn: () => queryContract<PresaleConfig>(PRESALE_CONTRACT, { config: {} }),
    enabled: !!PRESALE_CONTRACT,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function usePresaleStatus() {
  return useQuery({
    queryKey: ['presale', 'status'],
    queryFn: () => queryContract<PresaleStatus>(PRESALE_CONTRACT, { status: {} }),
    enabled: !!PRESALE_CONTRACT,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
