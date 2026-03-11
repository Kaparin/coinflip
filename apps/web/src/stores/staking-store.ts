/**
 * Global staking operation store.
 *
 * Persists across StakingSheet open/close cycles so the user always
 * sees the current operation state when they reopen the modal.
 *
 * Uses useSyncExternalStore for zero-dependency React integration.
 */

import { useSyncExternalStore } from 'react';

// ---- Types ----

export type OpType = 'stake' | 'unstake' | 'claim';
export type OpPhase = 'signing' | 'broadcasting' | 'pending' | 'error';

export interface StakingOp {
  type: OpType;
  amount?: number;
  phase: OpPhase;
  txHash?: string;
  error?: string;
  errorCode?: string;
  startedAt: number;
}

// ---- Module-level singleton state ----

let _op: StakingOp | null = null;
let _clearTimer: ReturnType<typeof setTimeout> | undefined;
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((l) => l());
}

function getSnapshot(): StakingOp | null {
  return _op;
}

function subscribe(listener: () => void) {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

// ---- Actions ----

function startOp(type: OpType, amount?: number) {
  if (_clearTimer) {
    clearTimeout(_clearTimer);
    _clearTimer = undefined;
  }
  _op = { type, amount, phase: 'signing', startedAt: Date.now() };
  notify();
}

function setPhase(phase: OpPhase) {
  if (_op) {
    _op = { ..._op, phase };
    notify();
  }
}

function setPending(txHash: string) {
  if (_op) {
    _op = { ..._op, txHash, phase: 'pending' };
    notify();
    // Auto-clear after 8s — by then chain should have confirmed
    _clearTimer = setTimeout(() => {
      _op = null;
      notify();
    }, 8_000);
  }
}

function setError(error: string, errorCode?: string) {
  if (_op) {
    _op = { ..._op, phase: 'error', error, errorCode };
    notify();
    // Auto-dismiss all errors after 8s
    _clearTimer = setTimeout(() => {
      _op = null;
      notify();
    }, 8_000);
  }
}

function clearOp() {
  if (_clearTimer) {
    clearTimeout(_clearTimer);
    _clearTimer = undefined;
  }
  _op = null;
  notify();
}

// ---- React hook ----

export function useStakingStore() {
  const op = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // ALL phases block new operations. Only null (idle) allows new ops.
  const isLocked = op !== null;

  return {
    op,
    isLocked,
    startOp,
    setPhase,
    setPending,
    setError,
    clearOp,
  };
}
