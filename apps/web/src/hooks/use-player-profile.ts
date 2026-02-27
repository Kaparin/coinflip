'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';

export interface PlayerBet {
  id: string;
  amount: string;
  payout_amount: string;
  status: string;
  resolved_at: string | null;
  created_at: string | null;
  winner_user_id: string | null;
  maker_user_id: string;
  maker: string;
  maker_nickname: string | null;
  maker_vip_tier: string | null;
  acceptor: string | null;
  acceptor_nickname: string | null;
  acceptor_vip_tier: string | null;
  is_win: boolean;
}

export interface HeadToHead {
  total_games: number;
  your_wins: number;
  their_wins: number;
}

export interface AchievementProgress {
  total_bets: number;
  wins: number;
  total_wagered: string;
  total_won: string;
  max_bet: string;
  max_win_payout: string;
  max_win_streak: number;
}

export interface Achievements {
  earned: string[];
  progress: AchievementProgress;
}

export interface ReactionCount {
  emoji: string;
  count: number;
}

export interface TelegramInfo {
  username: string;
}

export interface JackpotWin {
  tierName: string;
  amount: string;
  wonAt: string | null;
  cycle: number;
}

export interface PlayerProfile {
  address: string;
  nickname: string | null;
  avatar_url: string | null;
  vip_tier: string | null;
  created_at: string;
  stats: {
    total_bets: number;
    wins: number;
    losses: number;
    total_wagered: string;
    total_won: string;
  };
  recent_bets: PlayerBet[];
  recent_bets_total: number;
  h2h: HeadToHead | null;
  achievements: Achievements;
  reactions: ReactionCount[];
  my_reaction: string | null;
  jackpot_wins: JackpotWin[];
  telegram: TelegramInfo | null;
}

export function usePlayerProfile(address: string | null, page = 0, pageSize = 10) {
  return useQuery({
    queryKey: ['/api/v1/users', address, page, pageSize],
    queryFn: async (): Promise<PlayerProfile> => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      const res = await fetch(`${API_URL}/api/v1/users/${address}?${params}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch player profile');
      const json = await res.json();
      return json.data;
    },
    enabled: !!address,
    staleTime: 15_000,
    // Keep previous page data visible while fetching next page (no flash/reload)
    placeholderData: keepPreviousData,
  });
}
