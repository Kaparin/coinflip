'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WS_URL } from '@/lib/constants';
import { usePendingBalance } from '@/contexts/pending-balance-context';
import { isInBalanceGracePeriod } from '@/lib/balance-grace';
import type { WsEvent } from '@coinflip/shared/types';

interface UseWebSocketOptions {
  /** Axiome address to subscribe with */
  address?: string | null;
  /** Whether to connect automatically */
  enabled?: boolean;
  /** Callback for incoming events */
  onEvent?: (event: WsEvent) => void;
}

interface UseWebSocketReturn {
  /** Whether the WebSocket is connected */
  isConnected: boolean;
  /** Last received event */
  lastEvent: WsEvent | null;
  /** Reconnect manually */
  reconnect: () => void;
}

/**
 * Global WS connection state — components can read this to decide polling intervals.
 * When WS is connected, polling can be slowed down dramatically (fallback only).
 */
let _globalWsConnected = false;

/** Returns true if the global WebSocket is currently connected. */
export function isWsConnected(): boolean {
  return _globalWsConnected;
}

/** Polling interval when WS is connected (slow fallback) */
export const POLL_INTERVAL_WS_CONNECTED = 30_000;
/** Polling interval when WS is disconnected (fallback — keep moderate to avoid 429) */
export const POLL_INTERVAL_WS_DISCONNECTED = 15_000;

/**
 * WebSocket hook for real-time CoinFlip updates.
 *
 * Features:
 * - Stable connection — won't reconnect due to re-renders
 * - Reconnects on disconnect with exponential backoff
 * - Debounced React Query cache invalidation
 * - Cleans up on unmount
 */
export function useWebSocket({
  address,
  enabled = true,
  onEvent,
}: UseWebSocketOptions = {}): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  // Store mutable refs for values used inside connect (avoids stale closures & re-renders)
  const addressRef = useRef(address);
  const enabledRef = useRef(enabled);
  const onEventRef = useRef(onEvent);

  // Debounced invalidation
  const pendingInvalidations = useRef<Set<string>>(new Set());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const isConnectedRef = useRef(false);
  const reconnectCountRef = useRef(0);

  // Wire up pending balance context — isFrozen guards vault balance invalidation.
  // When frontend deductions are active, GET /balance returns server-adjusted data
  // (chain - pending locks) which overlaps with the frontend pendingDeduction overlay,
  // causing double-subtraction. Skipping vault refetch during this window prevents that.
  const { isFrozen } = usePendingBalance();
  const isFrozenRef = useRef(false);

  // Update refs on every render (without triggering effects)
  addressRef.current = address;
  enabledRef.current = enabled;
  onEventRef.current = onEvent;
  isFrozenRef.current = isFrozen;

  const flushInvalidations = useCallback(() => {
    const keys = pendingInvalidations.current;
    if (keys.size === 0) return;
    for (const key of keys) {
      queryClientRef.current.invalidateQueries({ queryKey: [key] });
    }
    keys.clear();
  }, []);

  const scheduleInvalidation = useCallback((...queryKeys: string[]) => {
    for (const key of queryKeys) {
      // Skip vault balance invalidation while pending deductions are active
      // or during a balance grace period (after deposit/accept 202 response).
      // The frontend pendingDeduction overlay already shows accurate values;
      // a server refetch during this window returns data adjusted for server-side
      // pending locks that overlap with frontend deductions → double-subtraction.
      if (
        (key === '/api/v1/vault/balance' || key === 'wallet-cw20-balance') &&
        (isFrozenRef.current || isInBalanceGracePeriod())
      ) {
        continue;
      }
      pendingInvalidations.current.add(key);
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(flushInvalidations, 800);
  }, [flushInvalidations]);

  // Build current WS URL from ref (includes auth token for iOS Safari where cookies are blocked)
  const getWsUrl = useCallback(() => {
    const addr = addressRef.current;
    const params = new URLSearchParams();
    if (addr) params.set('address', addr);
    // iOS Safari blocks third-party cookies (ITP) — pass token as query param
    const token = typeof window !== 'undefined'
      ? sessionStorage.getItem('coinflip_auth_token')
      : null;
    if (token) params.set('token', token);
    const qs = params.toString();
    return qs ? `${WS_URL}?${qs}` : WS_URL;
  }, []);

  // Stable connect function — does NOT depend on any changing state
  const connectWs = useCallback(() => {
    if (!enabledRef.current || !mountedRef.current) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const url = getWsUrl();

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        const wasDisconnected = !isConnectedRef.current;
        setIsConnected(true);
        isConnectedRef.current = true;
        _globalWsConnected = true;
        retryCountRef.current = 0;

        // After reconnecting, refetch all critical queries to catch missed events
        if (wasDisconnected && reconnectCountRef.current > 0) {
          scheduleInvalidation(
            '/api/v1/bets',
            '/api/v1/bets/mine',
            '/api/v1/bets/history',
            '/api/v1/vault/balance',
            'wallet-cw20-balance',
          );
        }
        reconnectCountRef.current++;
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        isConnectedRef.current = false;
        _globalWsConnected = false;
        wsRef.current = null;

        // Exponential backoff reconnect (min 3s, max 30s)
        const delay = Math.min(3000 * 2 ** retryCountRef.current, 30_000);
        retryCountRef.current++;

        reconnectTimerRef.current = setTimeout(connectWs, delay);
      };

      ws.onerror = () => {
        // Will trigger onclose, which handles reconnect
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as WsEvent;
          setLastEvent(parsed);

          // Debounced targeted invalidation based on event type.
          // IMPORTANT: '/api/v1/bets/mine' has a DIFFERENT query key than '/api/v1/bets'
          // so it must be invalidated separately (React Query uses array prefix matching).
          switch (parsed.type) {
            case 'bet_created':
            case 'bet_confirmed':
              scheduleInvalidation('/api/v1/bets', '/api/v1/bets/mine', '/api/v1/vault/balance');
              break;
            case 'bet_canceling': {
              // Instantly remove from open bets for all clients
              const cancelingBetId = String((parsed.data as any)?.id);
              if (cancelingBetId) {
                queryClientRef.current.setQueriesData(
                  { queryKey: ['/api/v1/bets'] },
                  (old: any) => {
                    if (!old?.data) return old;
                    return { ...old, data: old.data.filter((b: any) => String(b.id) !== cancelingBetId) };
                  },
                );
                // Update my-bets to show 'canceling' status
                queryClientRef.current.setQueriesData(
                  { queryKey: ['/api/v1/bets/mine'] },
                  (old: any) => {
                    if (!old?.data) return old;
                    return {
                      ...old,
                      data: old.data.map((b: any) =>
                        String(b.id) === cancelingBetId ? { ...b, status: 'canceling' } : b,
                      ),
                    };
                  },
                );
              }
              scheduleInvalidation('/api/v1/bets', '/api/v1/bets/mine');
              break;
            }
            case 'bet_canceled': {
              // Instantly remove from open bets and my-bets caches
              const canceledBetId = String((parsed.data as any)?.id);
              if (canceledBetId) {
                queryClientRef.current.setQueriesData(
                  { queryKey: ['/api/v1/bets'] },
                  (old: any) => {
                    if (!old?.data) return old;
                    return { ...old, data: old.data.filter((b: any) => String(b.id) !== canceledBetId) };
                  },
                );
                queryClientRef.current.setQueriesData(
                  { queryKey: ['/api/v1/bets/mine'] },
                  (old: any) => {
                    if (!old?.data) return old;
                    return {
                      ...old,
                      data: old.data.map((b: any) =>
                        String(b.id) === canceledBetId ? { ...b, status: 'canceled' } : b,
                      ),
                    };
                  },
                );
              }
              scheduleInvalidation('/api/v1/bets', '/api/v1/bets/mine', '/api/v1/vault/balance');
              break;
            }
            case 'bet_accepting': {
              // Instantly remove the bet from open bets cache for ALL clients
              // so the card disappears immediately — don't wait for debounced refetch.
              const acceptingBet = parsed.data as any;
              const acceptingBetId = String(acceptingBet?.id);
              if (acceptingBetId) {
                queryClientRef.current.setQueriesData(
                  { queryKey: ['/api/v1/bets'] },
                  (old: any) => {
                    if (!old?.data) return old;
                    return { ...old, data: old.data.filter((b: any) => String(b.id) !== acceptingBetId) };
                  },
                );
                // Add or update in my-bets cache for involved parties.
                // The old .map() only updated existing entries — if the acceptor didn't have
                // this bet in their my-bets cache, it was invisible until the next refetch.
                // Now we ADD it if not found (for the acceptor) or UPDATE it (for the maker).
                const addr = addressRef.current?.toLowerCase();
                const isMaker = acceptingBet.maker?.toLowerCase() === addr;
                const isAcceptor = acceptingBet.acceptor?.toLowerCase() === addr;
                if (isMaker || isAcceptor) {
                  queryClientRef.current.setQueriesData(
                    { queryKey: ['/api/v1/bets/mine'] },
                    (old: any) => {
                      const entry = { ...acceptingBet, status: 'accepting' };
                      if (!old?.data) return { data: [entry] };
                      const exists = old.data.some((b: any) => String(b.id) === acceptingBetId);
                      if (exists) {
                        return { ...old, data: old.data.map((b: any) =>
                          String(b.id) === acceptingBetId ? { ...b, ...entry } : b,
                        ) };
                      }
                      return { ...old, data: [entry, ...old.data] };
                    },
                  );
                }
              }
              // Still schedule background refetch to sync any missed data
              scheduleInvalidation('/api/v1/bets', '/api/v1/bets/mine');
              break;
            }
            case 'bet_reverted':
              scheduleInvalidation('/api/v1/bets', '/api/v1/bets/mine', '/api/v1/vault/balance');
              break;
            case 'bet_accepted':
            case 'bet_revealed':
            case 'bet_timeout_claimed': {
              // Instantly update my-bets cache for involved parties — no wait for refetch.
              // This makes win/loss results appear immediately in "My Bets" tab.
              const resolvedBet = parsed.data as any;
              const resolvedBetId = String(resolvedBet?.id);
              if (resolvedBetId) {
                const addr = addressRef.current?.toLowerCase();
                const isInvolved = addr && (
                  resolvedBet?.maker?.toLowerCase() === addr ||
                  resolvedBet?.acceptor?.toLowerCase() === addr
                );
                if (isInvolved) {
                  queryClientRef.current.setQueriesData(
                    { queryKey: ['/api/v1/bets/mine'] },
                    (old: any) => {
                      if (!old?.data) return { data: [resolvedBet] };
                      const exists = old.data.some((b: any) => String(b.id) === resolvedBetId);
                      if (exists) {
                        return { ...old, data: old.data.map((b: any) =>
                          String(b.id) === resolvedBetId ? { ...b, ...resolvedBet } : b,
                        ) };
                      }
                      return { ...old, data: [resolvedBet, ...old.data] };
                    },
                  );
                }
              }
              scheduleInvalidation(
                '/api/v1/bets',
                '/api/v1/bets/mine',
                '/api/v1/bets/history',
                '/api/v1/vault/balance',
                'wallet-cw20-balance',
                '/api/v1/users/top-winner',
              );
              break;
            }
            case 'bet_create_failed':
            case 'accept_failed':
              scheduleInvalidation('/api/v1/bets', '/api/v1/bets/mine', '/api/v1/vault/balance');
              break;
            case 'balance_updated':
              // Skip vault balance invalidation during deposit/withdraw grace period.
              // The optimistic setQueryData has the correct value; a refetch now would
              // overwrite it with stale data from the server's chain cache.
              if (!isInBalanceGracePeriod()) {
                scheduleInvalidation('/api/v1/vault/balance', 'wallet-cw20-balance');
              }
              break;
            case 'event_started':
            case 'event_ended':
            case 'event_results_published':
            case 'event_canceled':
            case 'event_archived':
              scheduleInvalidation('/api/v1/events/active', '/api/v1/events/completed', '/api/v1/events');
              break;
            case 'jackpot_updated':
            case 'jackpot_won':
            case 'jackpot_reset':
              scheduleInvalidation('/api/v1/jackpot/active', '/api/v1/jackpot/history');
              break;
          }

          onEventRef.current?.(parsed);
        } catch {
          // Ignore malformed messages
        }
      };
    } catch {
      // Connection failed, will retry via reconnect timer
    }
  }, [getWsUrl, scheduleInvalidation]);

  // Main effect: connect once on mount, reconnect when address changes
  // We track addressRef changes via a separate mechanism
  const prevAddressRef = useRef(address);
  const prevEnabledRef = useRef(enabled);

  useEffect(() => {
    mountedRef.current = true;

    connectWs();

    return () => {
      mountedRef.current = false;
      _globalWsConnected = false; // Reset global flag on unmount
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ONLY on mount/unmount

  // Reconnect when address or enabled ACTUALLY changes (by comparing prev values)
  useEffect(() => {
    if (prevAddressRef.current === address && prevEnabledRef.current === enabled) return;
    prevAddressRef.current = address;
    prevEnabledRef.current = enabled;

    // Address or enabled changed — reconnect
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    retryCountRef.current = 0;

    if (enabled && address) {
      connectWs();
    } else if (enabled && !address && wsRef.current) {
      // Wallet disconnected but WS still enabled — close stale connection
      // (was previously bound to old address; will reconnect when new address arrives)
      wsRef.current.close();
      wsRef.current = null;
      _globalWsConnected = false;
    } else if (!enabled && wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      _globalWsConnected = false;
    }
  }, [address, enabled, connectWs]);

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    connectWs();
  }, [connectWs]);

  return { isConnected, lastEvent, reconnect };
}
