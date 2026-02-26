'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';

export type ActivityType = 'bet_win' | 'bet_loss' | 'referral_reward' | 'jackpot_win';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  amount: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

interface ActivityPage {
  data: ActivityItem[];
  nextCursor: string | null;
}

export function useActivity(options: { enabled?: boolean; types?: string } = {}) {
  return useInfiniteQuery({
    queryKey: ['/api/v1/activity', options.types],
    queryFn: async ({ pageParam }): Promise<ActivityPage> => {
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', pageParam as string);
      if (options.types) params.set('types', options.types);

      const res = await fetch(`${API_URL}/api/v1/activity?${params}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch activity');
      return res.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: options.enabled ?? true,
    staleTime: 15_000,
  });
}
