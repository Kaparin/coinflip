/**
 * Balance grace period — prevents stale refetches from overwriting
 * the accurate balance set via setQueryData after operations.
 *
 * Used after: deposits, bet accepts (202 response), bet creates (202 response).
 * The server's chain cache may briefly hold a stale value (REST node lags
 * 1 block behind RPC). WS-triggered invalidation during this window would
 * overwrite the accurate setQueryData value with stale chain data.
 *
 * Usage:
 *   balance-display.tsx  → setBalanceGracePeriod(8000) after deposit
 *   bet-list.tsx          → setBalanceGracePeriod(5000) after accept 202
 *   create-bet-form.tsx   → setBalanceGracePeriod(5000) after create 202
 *   use-websocket.ts      → isInBalanceGracePeriod() to skip vault invalidation
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
