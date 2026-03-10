'use client';

import { useQuery } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';

export interface AxmRates {
  axm_usd: number | null;
  axm_rub: number | null;
  axm_eur: number | null;
  updated_at: string;
}

export function useAxmRates() {
  return useQuery({
    queryKey: ['/api/v1/users/rates'],
    queryFn: async (): Promise<AxmRates> => {
      const res = await fetch(`${API_URL}/api/v1/users/rates`);
      if (!res.ok) throw new Error('Failed to fetch AXM rates');
      const json = await res.json();
      return json.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
