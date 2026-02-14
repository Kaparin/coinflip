'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WS_URL } from '@/lib/constants';
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
 * Automatically:
 * - Connects when address is provided
 * - Reconnects on disconnect with exponential backoff
 * - Invalidates React Query caches on relevant events
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
  const queryClient = useQueryClient();

  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const url = address ? `${WS_URL}?address=${encodeURIComponent(address)}` : WS_URL;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        retryCountRef.current = 0;
      };

      ws.onclose = () => {
        setIsConnected(false);

        // Exponential backoff reconnect (max 30s)
        const delay = Math.min(1000 * 2 ** retryCountRef.current, 30_000);
        retryCountRef.current++;

        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      };

      ws.onerror = () => {
        // Will trigger onclose, which handles reconnect
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as WsEvent;
          setLastEvent(parsed);

          // Invalidate relevant queries based on event type
          switch (parsed.type) {
            case 'bet_created':
            case 'bet_canceled':
            case 'bet_accepted':
            case 'bet_revealed':
            case 'bet_timeout_claimed':
              // Refresh bets list and specific bet
              queryClient.invalidateQueries({ queryKey: ['/api/v1/bets'] });
              queryClient.invalidateQueries({ queryKey: ['/api/v1/bets/history'] });
              break;
            case 'balance_updated':
              // Refresh vault balance
              queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
              break;
          }

          onEvent?.(parsed);
        } catch {
          // Ignore malformed messages
        }
      };
    } catch {
      // Connection failed, will retry
    }
  }, [enabled, address, queryClient, onEvent]);

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected, lastEvent, reconnect };
}
