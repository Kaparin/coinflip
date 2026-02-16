'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WS_URL } from '@/lib/constants';
import { usePendingBalance } from '@/contexts/pending-balance-context';
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

  // Track balance freeze state — skip vault balance invalidation while pending deductions exist
  const { isFrozen: balanceFrozen } = usePendingBalance();
  const balanceFrozenRef = useRef(balanceFrozen);
  balanceFrozenRef.current = balanceFrozen;

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

  // Update refs on every render (without triggering effects)
  addressRef.current = address;
  enabledRef.current = enabled;
  onEventRef.current = onEvent;

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
      // Skip vault balance invalidation while optimistic deductions are pending.
      // This prevents WS events from overwriting the correct optimistic balance
      // with stale server-cached data.
      if (key === '/api/v1/vault/balance' && balanceFrozenRef.current) continue;
      pendingInvalidations.current.add(key);
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(flushInvalidations, 300);
  }, [flushInvalidations]);

  // Build current WS URL from ref
  const getWsUrl = useCallback(() => {
    const addr = addressRef.current;
    return addr ? `${WS_URL}?address=${encodeURIComponent(addr)}` : WS_URL;
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
        retryCountRef.current = 0;

        // After reconnecting, refetch all critical queries to catch missed events
        if (wasDisconnected && reconnectCountRef.current > 0) {
          scheduleInvalidation(
            '/api/v1/bets',
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

          // Debounced targeted invalidation based on event type
          switch (parsed.type) {
            case 'bet_created':
            case 'bet_confirmed':
            case 'bet_canceled':
              scheduleInvalidation('/api/v1/bets', '/api/v1/vault/balance');
              break;
            case 'bet_accepting':
              // Someone claimed a bet — remove from Open Bets for ALL users
              scheduleInvalidation('/api/v1/bets');
              break;
            case 'bet_reverted':
              // Accept failed — bet is back in Open Bets
              scheduleInvalidation('/api/v1/bets', '/api/v1/vault/balance');
              break;
            case 'bet_accepted':
            case 'bet_revealed':
            case 'bet_timeout_claimed':
              scheduleInvalidation(
                '/api/v1/bets',
                '/api/v1/bets/history',
                '/api/v1/vault/balance',
                'wallet-cw20-balance',
              );
              break;
            case 'bet_create_failed':
            case 'accept_failed':
              scheduleInvalidation('/api/v1/bets', '/api/v1/vault/balance');
              break;
            case 'balance_updated':
              scheduleInvalidation('/api/v1/vault/balance', 'wallet-cw20-balance');
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
    } else if (!enabled && wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
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
