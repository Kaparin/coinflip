'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useWebSocketContext } from '@/contexts/websocket-context';
import type { WsEvent } from '@coinflip/shared/types';

// ─── Types ────────────────────────────────────────────────

export interface SocialUser {
  address: string;
  nickname: string | null;
  vip_tier: string | null;
  vip_customization: {
    nameGradient: string;
    frameStyle: string;
    badgeIcon: string;
  } | null;
  total_bets: number;
  is_online: boolean;
}

export interface ChatMessage {
  id: string;
  userId: string;
  address: string;
  nickname: string | null;
  vipTier: string | null;
  message: string;
  createdAt: string;
}

// ─── Online Count ─────────────────────────────────────────

export function useOnlineCount() {
  const [count, setCount] = useState(0);
  const { subscribe } = useWebSocketContext();

  useEffect(() => {
    // Fetch initial count
    fetch(`${API_URL}/api/v1/social/online-count`)
      .then((r) => r.json())
      .then((d) => setCount(d.data?.count ?? 0))
      .catch(() => {});

    const unsub = subscribe((event: WsEvent) => {
      if (event.type === 'online_count') {
        setCount((event.data as any).count ?? 0);
      }
    });
    return unsub;
  }, [subscribe]);

  return count;
}

// ─── Online Users ─────────────────────────────────────────

export function useOnlineUsers(enabled: boolean) {
  const [users, setUsers] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    fetch(`${API_URL}/api/v1/social/online`)
      .then((r) => r.json())
      .then((d) => setUsers(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enabled]);

  return { users, loading };
}

// ─── Favorites ────────────────────────────────────────────

export function useFavorites(enabled: boolean) {
  const [users, setUsers] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/api/v1/social/favorites`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((d) => setUsers(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refetch();
  }, [enabled, refetch]);

  return { users, loading, refetch };
}

// ─── All Users (paginated) ────────────────────────────────

export function useAllUsers(enabled: boolean, search: string) {
  const [users, setUsers] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: '20' });
    if (search.trim().length >= 2) params.set('q', search.trim());
    fetch(`${API_URL}/api/v1/social/users?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setUsers(d.data ?? []);
        setNextCursor(d.nextCursor ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enabled, search]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const params = new URLSearchParams({ limit: '20', cursor: nextCursor });
    if (search.trim().length >= 2) params.set('q', search.trim());
    fetch(`${API_URL}/api/v1/social/users?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setUsers((prev) => [...prev, ...(d.data ?? [])]);
        setNextCursor(d.nextCursor ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [nextCursor, loadingMore, search]);

  return { users, loading, nextCursor, loadMore, loadingMore };
}

// ─── Chat ─────────────────────────────────────────────────

export function useChat(enabled: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const { subscribe } = useWebSocketContext();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch initial messages
  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    fetch(`${API_URL}/api/v1/social/chat`)
      .then((r) => r.json())
      .then((d) => setMessages(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enabled]);

  // Listen for new chat messages via WS
  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribe((event: WsEvent) => {
      if (event.type === 'chat_message') {
        const msg = event.data as unknown as ChatMessage;
        setMessages((prev) => {
          // Deduplicate
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    });
    return unsub;
  }, [enabled, subscribe]);

  const sendMessage = useCallback(async (message: string): Promise<{ waitMs?: number }> => {
    const res = await fetch(`${API_URL}/api/v1/social/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (res.status === 429) {
      const data = await res.json();
      return { waitMs: data.error?.waitMs ?? 3000 };
    }
    if (!res.ok) throw new Error('Failed to send');
    return {};
  }, []);

  return { messages, loading, sendMessage, messagesEndRef };
}

// ─── Favorite check/toggle ────────────────────────────────

export function useFavoriteStatus(address: string | undefined) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    fetch(`${API_URL}/api/v1/social/favorites/check/${address}`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((d) => setIsFavorite(d.data?.isFavorite ?? false))
      .catch(() => {});
  }, [address]);

  const toggle = useCallback(async () => {
    if (!address || loading) return;
    setLoading(true);
    try {
      const method = isFavorite ? 'DELETE' : 'POST';
      await fetch(`${API_URL}/api/v1/social/favorites/${address}`, {
        method,
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      setIsFavorite(!isFavorite);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [address, isFavorite, loading]);

  return { isFavorite, toggle, loading };
}
