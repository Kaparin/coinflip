'use client';

import { createContext, useCallback, useContext, useRef } from 'react';

type DepositListener = () => void;

interface DepositTriggerContextValue {
  openDeposit: () => void;
  subscribe: (listener: DepositListener) => () => void;
}

const DepositTriggerContext = createContext<DepositTriggerContextValue | null>(null);

export function DepositTriggerProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = useRef<Set<DepositListener>>(new Set());

  const subscribe = useCallback((listener: DepositListener) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  const openDeposit = useCallback(() => {
    listenersRef.current.forEach((fn) => fn());
  }, []);

  return (
    <DepositTriggerContext.Provider value={{ openDeposit, subscribe }}>
      {children}
    </DepositTriggerContext.Provider>
  );
}

export function useDepositTrigger() {
  const ctx = useContext(DepositTriggerContext);
  if (!ctx) throw new Error('useDepositTrigger must be used within DepositTriggerProvider');
  return ctx;
}
