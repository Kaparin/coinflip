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

// ---- Constants ----

/** Cooldown after a successful tx broadcast — prevents nonce collisions */
export const COOLDOWN_MS = 20_000;

// ---- Module-level singleton state ----

interface StakingSnapshot {
  op: StakingOp | null;
  lastTxAt: number;
}

let _op: StakingOp | null = null;
let _lastTxAt = 0;
let _clearTimer: ReturnType<typeof setTimeout> | undefined;
const _listeners = new Set<() => void>();

let _snapshot: StakingSnapshot = { op: null, lastTxAt: 0 };

function updateSnapshot() {
  _snapshot = { op: _op, lastTxAt: _lastTxAt };
}

function notify() {
  updateSnapshot();
  _listeners.forEach((l) => l());
}

function getSnapshot(): StakingSnapshot {
  return _snapshot;
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
    _lastTxAt = Date.now();
    notify();
    // Auto-clear op after 8s (cooldown continues independently)
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
  const { op, lastTxAt } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // ALL phases block new operations. Only null (idle) allows new ops.
  const isLocked = op !== null;

  return {
    op,
    lastTxAt,
    isLocked,
    startOp,
    setPhase,
    setPending,
    setError,
    clearOp,
  };
}
