/**
 * Deposit grace period — prevents stale refetches from overwriting
 * the optimistic balance update after a deposit.
 *
 * After deposit, the server's chain cache may briefly hold a stale value
 * (REST node lags 1 block behind RPC). WS-triggered invalidation during
 * this window would overwrite the optimistic setQueryData with stale data.
 *
 * Usage:
 *   balance-display.tsx → setBalanceGracePeriod(8000) after optimistic update
 *   use-websocket.ts   → isInBalanceGracePeriod() to skip vault invalidation
 */

let _graceUntil = 0;

/** Set a grace period (ms) during which vault balance invalidations are skipped. */
export function setBalanceGracePeriod(ms: number): void {
  _graceUntil = Date.now() + ms;
}

/** Returns true if currently within a deposit grace period. */
export function isInBalanceGracePeriod(): boolean {
  return Date.now() < _graceUntil;
}
