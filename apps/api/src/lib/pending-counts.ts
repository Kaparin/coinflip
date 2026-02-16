/**
 * In-memory counter tracking pending bet-create operations per user.
 * Incremented when a create_bet tx enters mempool.
 * Decremented when the bet is confirmed/failed in background tasks.
 *
 * Extracted into its own module to avoid circular dependencies between
 * routes/bets.ts and services/background-tasks.ts.
 */

const pendingBetCounts = new Map<string, number>();

export function getPendingBetCount(userId: string): number {
  return pendingBetCounts.get(userId) ?? 0;
}

export function incrementPendingBetCount(userId: string): void {
  pendingBetCounts.set(userId, (pendingBetCounts.get(userId) ?? 0) + 1);
}

export function decrementPendingBetCount(userId: string): void {
  const current = pendingBetCounts.get(userId) ?? 0;
  if (current <= 1) {
    pendingBetCounts.delete(userId);
  } else {
    pendingBetCounts.set(userId, current - 1);
  }
}
