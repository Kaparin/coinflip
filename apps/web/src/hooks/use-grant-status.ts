'use client';

import { useQuery } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';
import { useWalletContext } from '@/contexts/wallet-context';

interface GrantStatus {
  authz_granted: boolean;
  authz_expires_at: string | null;
  fee_grant_active: boolean;
  relayer_address: string;
  contract_address: string;
}

export function useGrantStatus() {
  const { address, isConnected } = useWalletContext();

  return useQuery({
    queryKey: ['/api/v1/auth/grants', address],
    queryFn: async (): Promise<GrantStatus> => {
      const res = await fetch(`${API_URL}/api/v1/auth/grants`, {
        headers: { 'x-wallet-address': address! },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch grant status');
      const json = await res.json();
      return json.data;
    },
    enabled: isConnected && !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
