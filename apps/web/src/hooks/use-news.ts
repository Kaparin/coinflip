'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { API_URL } from '@/lib/constants';

export type NewsFeedType = 'news_post' | 'announcement' | 'big_win' | 'jackpot_win';

export interface NewsFeedItem {
  id: string;
  type: NewsFeedType;
  title: string;
  content: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

interface NewsFeedPage {
  data: NewsFeedItem[];
  nextCursor: string | null;
}

export function useNewsFeed(types?: string) {
  return useInfiniteQuery({
    queryKey: ['/api/v1/news', types],
    queryFn: async ({ pageParam }): Promise<NewsFeedPage> => {
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', pageParam as string);
      if (types) params.set('types', types);

      const res = await fetch(`${API_URL}/api/v1/news?${params}`);
      if (!res.ok) throw new Error('Failed to fetch news');
      return res.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30_000,
  });
}

export interface UserAnnouncement {
  id: string;
  title: string;
  message: string;
  priority: string;
  createdAt: string;
}

export function useUserAnnouncements(address: string) {
  return useQuery({
    queryKey: ['/api/v1/users', address, 'announcements'],
    queryFn: async (): Promise<UserAnnouncement[]> => {
      const res = await fetch(`${API_URL}/api/v1/users/${address}/announcements`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
  });
}
