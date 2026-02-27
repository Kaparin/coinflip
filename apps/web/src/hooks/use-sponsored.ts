'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';

export interface SponsoredConfig {
  price: string;
  isActive: boolean;
  minDelayMin: number;
  maxTitle: number;
  maxMessage: number;
}

export function useSponsoredConfig() {
  return useQuery({
    queryKey: ['/api/v1/announcements/sponsored/config'],
    queryFn: async (): Promise<SponsoredConfig> => {
      const res = await fetch(`${API_URL}/api/v1/announcements/sponsored/config`);
      if (!res.ok) throw new Error('Failed to fetch sponsored config');
      const json = await res.json();
      return json.data;
    },
    staleTime: 60_000,
  });
}

export function useSubmitSponsored() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { title: string; message: string; scheduledAt?: string }) => {
      const res = await fetch(`${API_URL}/api/v1/announcements/sponsored`, {
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
      queryClient.invalidateQueries({ queryKey: ['/api/v1/announcements'] });
    },
  });
}
