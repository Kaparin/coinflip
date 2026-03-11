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

export interface CoinDropInfo {
  dropId: string;
  amount: string;
  claimedBy: string | null;
  claimedByNickname: string | null;
}

export interface ChatMessage {
  id: string;
  userId: string;
  address: string;
  nickname: string | null;
  vipTier: string | null;
  message: string;
  style: 'highlighted' | 'pinned' | 'coin_drop' | 'ai_bot' | null;
  /** For AI bot messages — localized text */
  textRu?: string;
  textEn?: string;
  effect: 'confetti' | 'coins' | 'fire' | null;
  createdAt: string;
  coinDrop?: CoinDropInfo;
}

export interface ChatPrices {
  highlighted: number;
  pinned: number;
  effect: number;
  coinDropMin: number;
}

export interface CoinTransfer {
  id: string;
  type: 'sent' | 'received';
  amount: string;
  fee: string;
  currency: 'coin' | 'axm';
  message: string | null;
  counterparty: {
    address: string;
    nickname: string | null;
  };
  createdAt: string;
}

export interface TransferNotification {
  fromAddress: string;
  fromNickname: string | null;
  amount: string;
  fee: string;
  currency: 'coin' | 'axm';
  message: string | null;
}

// ─── Online Count ─────────────────────────────────────────

export function useOnlineCount() {
  const [count, setCount] = useState(0);
  const { subscribe } = useWebSocketContext();

  useEffect(() => {
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
  const { subscribe } = useWebSocketContext();

  const fetchOnline = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/api/v1/social/online`)
      .then((r) => r.json())
      .then((d) => setUsers(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchOnline();
  }, [enabled, fetchOnline]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribe((event: WsEvent) => {
      if (event.type === 'online_count') {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(fetchOnline, 2000);
      }
    });
    return () => {
      unsub();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, subscribe, fetchOnline]);

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

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    fetch(`${API_URL}/api/v1/social/chat`)
      .then((r) => r.json())
      .then((d) => setMessages(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enabled]);

  // Listen for new chat messages + coin drop claims via WS
  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribe((event: WsEvent) => {
      if (event.type === 'chat_message') {
        const msg = event.data as unknown as ChatMessage;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
      if (event.type === 'coin_drop_claimed') {
        const claim = event.data as { messageId: string; claimedByAddress: string; claimedByNickname: string | null };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === claim.messageId && m.coinDrop
              ? { ...m, coinDrop: { ...m.coinDrop, claimedBy: claim.claimedByAddress, claimedByNickname: claim.claimedByNickname } }
              : m,
          ),
        );
      }
    });
    return unsub;
  }, [enabled, subscribe]);

  const sendMessage = useCallback(async (
    message: string,
    style?: 'highlighted' | 'pinned' | null,
    effect?: 'confetti' | 'coins' | 'fire' | null,
  ): Promise<{ waitMs?: number; error?: string }> => {
    const res = await fetch(`${API_URL}/api/v1/social/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, style: style ?? null, effect: effect ?? null }),
    });
    if (res.status === 429) {
      const data = await res.json();
      return { waitMs: data.error?.waitMs ?? 3000 };
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.error?.code === 'INSUFFICIENT_BALANCE') {
        return { error: 'INSUFFICIENT_BALANCE' };
      }
      throw new Error('Failed to send');
    }
    return {};
  }, []);

  const sendCoinDrop = useCallback(async (
    amount: number,
    message?: string,
  ): Promise<{ waitMs?: number; error?: string }> => {
    const res = await fetch(`${API_URL}/api/v1/social/chat/coin-drop`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, message }),
    });
    if (res.status === 429) {
      const data = await res.json();
      return { waitMs: data.error?.waitMs ?? 3000 };
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.error?.code === 'INSUFFICIENT_BALANCE') {
        return { error: 'INSUFFICIENT_BALANCE' };
      }
      throw new Error('Failed to send coin drop');
    }
    return {};
  }, []);

  const claimCoinDrop = useCallback(async (
    messageId: string,
  ): Promise<{ success: boolean; amount?: string; error?: string }> => {
    const res = await fetch(`${API_URL}/api/v1/social/chat/coin-drop/${messageId}/claim`, {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error?.code ?? 'FAILED' };
    }
    const data = await res.json();
    return { success: true, amount: data.data?.amount };
  }, []);

  return { messages, loading, sendMessage, sendCoinDrop, claimCoinDrop, messagesEndRef };
}

// ─── Chat Prices ─────────────────────────────────────────

export function useChatPrices() {
  const [prices, setPrices] = useState<ChatPrices | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/social/chat/prices`)
      .then((r) => r.json())
      .then((d) => setPrices(d.data ?? null))
      .catch(() => {});
  }, []);

  return prices;
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

// ─── P2P Transfer ─────────────────────────────────────────

export function useTransfer() {
  const [loading, setLoading] = useState(false);

  const transfer = useCallback(async (
    recipientAddress: string,
    amount: number,
    currency: 'coin' | 'axm' = 'coin',
    message?: string,
  ): Promise<{ success: boolean; error?: string; fee?: string }> => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/social/transfer`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientAddress, amount, currency, message }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, error: data.error?.code ?? 'FAILED' };
      }
      const data = await res.json();
      return { success: true, fee: data.data?.fee };
    } catch {
      return { success: false, error: 'NETWORK_ERROR' };
    } finally {
      setLoading(false);
    }
  }, []);

  return { transfer, loading };
}

// ─── Transfer History ─────────────────────────────────────

export function useTransferHistory(enabled: boolean) {
  const [transfers, setTransfers] = useState<CoinTransfer[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/api/v1/social/transfers`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((d) => setTransfers(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refetch();
  }, [enabled, refetch]);

  return { transfers, loading, refetch };
}
