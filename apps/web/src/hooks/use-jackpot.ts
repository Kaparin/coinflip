'use client';

import { useQuery } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';
import type { JackpotPoolResponse, JackpotEligibilityResponse } from '@coinflip/shared/types';

export function useJackpotActive() {
  return useQuery({
    queryKey: ['/api/v1/jackpot/active'],
    queryFn: async (): Promise<JackpotPoolResponse[]> => {
      const res = await fetch(`${API_URL}/api/v1/jackpot/active`);
      if (!res.ok) throw new Error('Failed to fetch jackpot pools');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useJackpotHistory(limit = 20, offset = 0) {
  return useQuery({
    queryKey: ['/api/v1/jackpot/history', limit, offset],
    queryFn: async (): Promise<JackpotPoolResponse[]> => {
      const res = await fetch(`${API_URL}/api/v1/jackpot/history?limit=${limit}&offset=${offset}`);
      if (!res.ok) throw new Error('Failed to fetch jackpot history');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useJackpotPool(poolId: string | null) {
  return useQuery({
    queryKey: ['/api/v1/jackpot', poolId],
    queryFn: async (): Promise<JackpotPoolResponse | null> => {
      if (!poolId) return null;
      const res = await fetch(`${API_URL}/api/v1/jackpot/${poolId}`);
      if (!res.ok) throw new Error('Failed to fetch jackpot pool');
      const json = await res.json();
      return json.data ?? null;
    },
    enabled: !!poolId,
    staleTime: 15_000,
  });
}

export function useJackpotEligibility(enabled = false) {
  return useQuery({
    queryKey: ['/api/v1/jackpot/eligibility'],
    queryFn: async (): Promise<JackpotEligibilityResponse> => {
      const res = await fetch(`${API_URL}/api/v1/jackpot/eligibility`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch eligibility');
      const json = await res.json();
      return json.data;
    },
    enabled,
    staleTime: 60_000,
  });
}
