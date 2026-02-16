'use client';

import { useQuery } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';

export interface LeaderboardEntry {
  rank: number;
  address: string;
  nickname: string | null;
  total_bets: number;
  wins: number;
  total_wagered: string;
  win_rate: number;
}

type SortBy = 'wins' | 'wagered' | 'win_rate';

export function useLeaderboard(sort: SortBy = 'wins', limit = 20) {
  return useQuery({
    queryKey: ['/api/v1/users/leaderboard', sort, limit],
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const res = await fetch(
        `${API_URL}/api/v1/users/leaderboard?sort=${sort}&limit=${limit}`,
      );
      if (!res.ok) throw new Error('Failed to fetch leaderboard');
      const json = await res.json();
      return json.data;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
