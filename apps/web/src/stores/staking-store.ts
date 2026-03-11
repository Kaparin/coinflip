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
export type OpPhase = 'signing' | 'broadcasting' | 'confirming' | 'done' | 'error';

export interface StakingOp {
  type: OpType;
  amount?: number;
  phase: OpPhase;
  txHash?: string;
  error?: string;
  errorCode?: string;
  startedAt: number;
}

export interface PendingStakingTx {
  type: OpType;
  amount?: number;
  txHash: string;
  ts: number;
}

// ---- Module-level singleton state ----

interface StakingSnapshot {
  op: StakingOp | null;
  pendingTxs: PendingStakingTx[];
}

let _op: StakingOp | null = null;
let _pendingTxs: PendingStakingTx[] = [];
let _clearTimer: ReturnType<typeof setTimeout> | undefined;
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((l) => l());
}

// ---- Snapshot objects (stable references for useSyncExternalStore) ----

let _snapshot: StakingSnapshot = { op: _op, pendingTxs: _pendingTxs };

function updateSnapshot() {
  _snapshot = { op: _op, pendingTxs: _pendingTxs };
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
  updateSnapshot();
  notify();
}

function setPhase(phase: OpPhase) {
  if (_op) {
    _op = { ..._op, phase };
    updateSnapshot();
    notify();
  }
}

function setTxHash(txHash: string) {
  if (_op) {
    _op = { ..._op, txHash, phase: 'confirming' };
    // Add to pending txs for chain polling
    _pendingTxs = [
      ..._pendingTxs,
      { type: _op.type, amount: _op.amount, txHash, ts: Date.now() },
    ];
    updateSnapshot();
    notify();
  }
}

function setDone() {
  if (_op) {
    _op = { ..._op, phase: 'done' };
    updateSnapshot();
    notify();
    // Auto-clear after 8 seconds
    _clearTimer = setTimeout(() => {
      _op = null;
      updateSnapshot();
      notify();
    }, 8_000);
  }
}

function setError(error: string, errorCode?: string) {
  if (_op) {
    _op = { ..._op, phase: 'error', error, errorCode };
    updateSnapshot();
    notify();
  }
}

function clearOp() {
  if (_clearTimer) {
    clearTimeout(_clearTimer);
    _clearTimer = undefined;
  }
  _op = null;
  updateSnapshot();
  notify();
}

function expirePendingTxs() {
  const before = _pendingTxs.length;
  _pendingTxs = _pendingTxs.filter((tx) => Date.now() - tx.ts < 30_000);
  if (_pendingTxs.length !== before) {
    updateSnapshot();
    notify();
  }
}

function clearPendingTxs() {
  if (_pendingTxs.length > 0) {
    _pendingTxs = [];
    updateSnapshot();
    notify();
  }
}

// ---- React hook ----

export function useStakingStore() {
  const { op, pendingTxs } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const isLocked = !!op && (op.phase === 'signing' || op.phase === 'broadcasting');

  return {
    /** Current operation (null if idle) */
    op,
    /** Pending txs waiting for chain confirmation */
    pendingTxs,
    /** True if user cannot trigger any new staking action */
    isLocked,

    startOp,
    setPhase,
    setTxHash,
    setDone,
    setError,
    clearOp,
    expirePendingTxs,
    clearPendingTxs,
  };
}
