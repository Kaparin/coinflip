/**
 * Shared per-address in-flight transaction guard.
 * Prevents concurrent chain transactions from the same user address
 * (across bet + vault operations) which could cause sequence mismatches.
 *
 * Uses a boolean lock — the guard is held for the entire duration of the
 * operation (until releaseInflight is called), not a fixed cooldown window.
 */

const inflight = new Map<string, number>();

export function acquireInflight(address: string): void {
  if (inflight.has(address)) {
    throw Object.assign(new Error('Previous action is still processing. Please wait.'), {
      status: 429,
    });
  }
  inflight.set(address, Date.now());
}

export function releaseInflight(address: string): void {
  inflight.delete(address);
}

// Cleanup stale entries every 30s (handles leaked entries from crashes/timeouts)
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [addr, ts] of inflight) {
    if (ts < cutoff) inflight.delete(addr);
  }
}, 30_000);
