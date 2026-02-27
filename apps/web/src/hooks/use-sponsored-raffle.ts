'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';

export interface SponsoredRaffleConfig {
  price: string;
  isActive: boolean;
  maxTitle: number;
  maxDesc: number;
  minDurationHours: number;
  maxDurationHours: number;
}

export function useSponsoredRaffleConfig() {
  return useQuery({
    queryKey: ['/api/v1/events/sponsored/config'],
    queryFn: async (): Promise<SponsoredRaffleConfig> => {
      const res = await fetch(`${API_URL}/api/v1/events/sponsored/config`);
      if (!res.ok) throw new Error('Failed to fetch sponsored raffle config');
      const json = await res.json();
      return json.data;
    },
    staleTime: 60_000,
  });
}

export function useSubmitSponsoredRaffle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      title: string;
      description: string;
      prizeAmount: string;
      startsAt: string;
      endsAt: string;
    }) => {
      const res = await fetch(`${API_URL}/api/v1/events/sponsored`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(err.error?.message ?? `Request failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/events'] });
      queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
    },
  });
}
