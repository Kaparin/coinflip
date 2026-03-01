'use client';

import { useQuery } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';

export interface TopWinner {
  address: string;
  nickname: string | null;
  amount: string;
  payout: string;
  resolved_at: string | null;
  vip_tier: string | null;
  vip_customization: { nameGradient: string; frameStyle: string; badgeIcon: string } | null;
}

export function useTopWinner() {
  return useQuery({
    queryKey: ['/api/v1/users/top-winner'],
    queryFn: async (): Promise<TopWinner | null> => {
      const res = await fetch(`${API_URL}/api/v1/users/top-winner`);
      if (!res.ok) throw new Error('Failed to fetch top winner');
      const json = await res.json();
      return json.data ?? null;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
