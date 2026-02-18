/**
 * Shared per-address in-flight transaction guard.
 * Prevents concurrent chain transactions from the same user address
 * (across bet + vault operations) which could cause sequence mismatches.
 */

const inflight = new Map<string, number>();
const COOLDOWN_MS = 2_000;

export function acquireInflight(address: string): void {
  const existing = inflight.get(address);
  if (existing && Date.now() - existing < COOLDOWN_MS) {
    throw Object.assign(new Error('Previous action is still processing. Please wait.'), {
      status: 429,
    });
  }
  inflight.set(address, Date.now());
}

export function releaseInflight(address: string): void {
  inflight.delete(address);
}

// Cleanup stale entries every 30s (handles leaked entries from crashes)
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [addr, ts] of inflight) {
    if (ts < cutoff) inflight.delete(addr);
  }
}, 30_000);
