/**
 * Tiny event bus for deposit confirmation signals.
 *
 * When DEPOSIT_ASYNC_MODE is enabled, the API returns 202 immediately.
 * The BalanceDisplay component shows a "pending" state and subscribes
 * to these events. When the WebSocket delivers deposit_confirmed or
 * deposit_failed, page.tsx fires the corresponding event here, and
 * BalanceDisplay transitions to success/error.
 */

type DepositEvent =
  | { type: 'confirmed'; txHash: string }
  | { type: 'failed'; txHash: string; reason: string };

type Listener = (event: DepositEvent) => void;

const listeners = new Set<Listener>();

export function onDepositEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitDepositEvent(event: DepositEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}
