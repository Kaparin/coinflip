'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useWalletContext } from '@/contexts/wallet-context';

interface Deduction {
  microAmount: bigint;
  /** Whether this is a "create bet" deduction (counts toward open bets limit) */
  isBetCreate: boolean;
}

interface PendingBalanceContextType {
  /** Total pending deduction in micro-units (available balance) */
  pendingDeduction: bigint;
  /** Number of pending bet-create operations (for open bets counter) */
  pendingBetCount: number;
  /** Add a pending deduction (returns an ID to remove it later) */
  addDeduction: (microAmount: string, isBetCreate?: boolean) => string;
  /** Remove a deduction by ID (confirmed on server or reverted) */
  removeDeduction: (id: string) => void;
  /** Whether balance refetching should be paused (true while any deductions exist) */
  isFrozen: boolean;
}

const PendingBalanceContext = createContext<PendingBalanceContextType>({
  pendingDeduction: 0n,
  pendingBetCount: 0,
  addDeduction: () => '',
  removeDeduction: () => {},
  isFrozen: false,
});

export function usePendingBalance() {
  return useContext(PendingBalanceContext);
}

let nextId = 0;

export function PendingBalanceProvider({ children }: { children: React.ReactNode }) {
  const { address } = useWalletContext();
  const [deductions, setDeductions] = useState<Map<string, Deduction>>(new Map());
  const expiryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Reset pending deductions when the connected wallet changes.
  // Deductions belong to a specific wallet and must not carry over.
  const prevAddrRef = useRef(address);
  useEffect(() => {
    if (prevAddrRef.current !== address) {
      prevAddrRef.current = address;
      for (const t of expiryTimersRef.current.values()) clearTimeout(t);
      expiryTimersRef.current.clear();
      setDeductions(new Map());
    }
  }, [address]);

  const addDeduction = useCallback((microAmount: string, isBetCreate = false): string => {
    const id = `pd_${++nextId}_${Date.now()}`;
    const amount = BigInt(microAmount);

    setDeductions(prev => {
      const next = new Map(prev);
      next.set(id, { microAmount: amount, isBetCreate });
      return next;
    });

    // Auto-expire deduction after 30 seconds as absolute safety net
    const timer = setTimeout(() => {
      expiryTimersRef.current.delete(id);
      setDeductions(prev => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }, 30_000);
    expiryTimersRef.current.set(id, timer);

    return id;
  }, []);

  const removeDeduction = useCallback((id: string) => {
    const timer = expiryTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      expiryTimersRef.current.delete(id);
    }
    setDeductions(prev => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Compute aggregates — isFrozen = true whenever we have any deductions
  let pendingDeduction = 0n;
  let pendingBetCount = 0;
  for (const d of deductions.values()) {
    pendingDeduction += d.microAmount;
    if (d.isBetCreate) pendingBetCount++;
  }
  const isFrozen = deductions.size > 0;

  return (
    <PendingBalanceContext.Provider value={{ pendingDeduction, pendingBetCount, addDeduction, removeDeduction, isFrozen }}>
      {children}
    </PendingBalanceContext.Provider>
  );
}
