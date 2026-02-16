'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';
import { useWalletContext } from '@/contexts/wallet-context';

/** Helper: fetch with admin auth header */
async function adminFetch<T>(path: string, address: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'x-wallet-address': address,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message ?? `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

// ---- Types ----

interface TreasuryBalance {
  vault: { available: string; locked: string };
  wallet: { balance: string };
}

interface TreasuryStats {
  totalCommissions: string;
  totalEntries: number;
  last24h: string;
  last7d: string;
}

interface LedgerEntry {
  id: string;
  txhash: string;
  amount: string;
  denom: string;
  source: string;
  createdAt: string;
}

interface LedgerResponse {
  data: LedgerEntry[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

interface PlatformStats {
  totalBets: number;
  totalVolume: string;
  resolvedBets: number;
  activeBets: number;
  canceledBets: number;
  totalUsers: number;
}

interface WithdrawResult {
  status: string;
  txHash: string;
  amount: string;
  message: string;
}

// ---- Hooks ----

export function useAdminTreasuryBalance() {
  const { address, isConnected } = useWalletContext();

  return useQuery({
    queryKey: ['/api/v1/admin/treasury/balance', address],
    queryFn: () => adminFetch<TreasuryBalance>('/api/v1/admin/treasury/balance', address!),
    enabled: isConnected && !!address,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useAdminTreasuryStats() {
  const { address, isConnected } = useWalletContext();

  return useQuery({
    queryKey: ['/api/v1/admin/treasury/stats', address],
    queryFn: () => adminFetch<TreasuryStats>('/api/v1/admin/treasury/stats', address!),
    enabled: isConnected && !!address,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useAdminTreasuryLedger(page = 0, limit = 20) {
  const { address, isConnected } = useWalletContext();
  const offset = page * limit;

  return useQuery({
    queryKey: ['/api/v1/admin/treasury/ledger', address, offset, limit],
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/api/v1/admin/treasury/ledger?limit=${limit}&offset=${offset}`,
        {
          headers: { 'x-wallet-address': address! },
          credentials: 'include',
        },
      );
      if (!res.ok) throw new Error('Failed to fetch ledger');
      return res.json() as Promise<LedgerResponse>;
    },
    enabled: isConnected && !!address,
    staleTime: 10_000,
  });
}

export function useAdminPlatformStats() {
  const { address, isConnected } = useWalletContext();

  return useQuery({
    queryKey: ['/api/v1/admin/platform/stats', address],
    queryFn: () => adminFetch<PlatformStats>('/api/v1/admin/platform/stats', address!),
    enabled: isConnected && !!address,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useAdminWithdraw() {
  const { address } = useWalletContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (amount: string) =>
      adminFetch<WithdrawResult>('/api/v1/admin/treasury/withdraw', address!, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      }),
    onSuccess: () => {
      // Invalidate treasury balance after withdrawal
      queryClient.invalidateQueries({ queryKey: ['/api/v1/admin/treasury/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/v1/admin/treasury/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/v1/admin/treasury/ledger'] });
    },
  });
}
