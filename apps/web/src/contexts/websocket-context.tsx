'use client';

import { createContext, useContext, useRef, useCallback } from 'react';
import { useWalletContext } from '@/contexts/wallet-context';
import { useWebSocket } from '@/hooks/use-websocket';
import type { WsEvent } from '@coinflip/shared/types';

type WsEventListener = (event: WsEvent) => void;

interface WebSocketContextValue {
  isConnected: boolean;
  reconnect: () => void;
  /** Subscribe to WS events. Returns unsubscribe function. */
  subscribe: (listener: WsEventListener) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  isConnected: false,
  reconnect: () => {},
  subscribe: () => () => {},
});

export function useWebSocketContext() {
  return useContext(WebSocketContext);
}

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected: walletConnected } = useWalletContext();
  const listenersRef = useRef<Set<WsEventListener>>(new Set());

  const handleEvent = useCallback((event: WsEvent) => {
    for (const listener of listenersRef.current) {
      listener(event);
    }
  }, []);

  const { isConnected, reconnect } = useWebSocket({
    address,
    enabled: walletConnected,
    onEvent: handleEvent,
  });

  const subscribe = useCallback((listener: WsEventListener) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  return (
    <WebSocketContext.Provider value={{ isConnected, reconnect, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}
