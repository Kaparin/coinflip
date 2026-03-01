/**
 * CometBFT WebSocket client for real-time chain event subscriptions.
 *
 * Connects to the CometBFT /websocket endpoint, subscribes to tx events
 * using a JSON-RPC query filter, and emits parsed events via callback.
 * Auto-reconnects with exponential backoff on disconnection.
 *
 * Used by the indexer in WS mode (INDEXER_WS_MODE=true) for instant
 * event processing instead of 3-second polling intervals.
 */

import { logger } from './logger.js';

export interface CometBFTTxEvent {
  txHash: string;
  height: number;
  events: Array<{
    type: string;
    attributes: Array<{ key: string; value: string }>;
  }>;
}

type EventCallback = (event: CometBFTTxEvent) => void;
type StatusCallback = (connected: boolean) => void;

export class ChainWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30_000;
  private destroyed = false;
  private subscriptionQuery: string | null = null;
  private onEvent: EventCallback | null = null;
  private onStatusChange: StatusCallback | null = null;

  constructor(private readonly wsUrl: string) {}

  /** Start connection and subscribe to events */
  start(opts: {
    query: string;
    onEvent: EventCallback;
    onStatusChange?: StatusCallback;
  }): void {
    this.subscriptionQuery = opts.query;
    this.onEvent = opts.onEvent;
    this.onStatusChange = opts.onStatusChange ?? null;
    this.destroyed = false;
    this.connect();
  }

  /** Stop and clean up */
  stop(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  private connect(): void {
    if (this.destroyed) return;

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        logger.info({ url: this.wsUrl }, 'CometBFT WebSocket connected');
        this.reconnectDelay = 1000;
        this.onStatusChange?.(true);
        this.subscribe();
      };

      this.ws.onmessage = (ev: MessageEvent) => {
        try {
          const raw = typeof ev.data === 'string' ? ev.data : String(ev.data);
          const data = JSON.parse(raw) as Record<string, unknown>;
          this.handleMessage(data);
        } catch (err) {
          logger.debug({ err }, 'CometBFT WS: failed to parse message');
        }
      };

      this.ws.onclose = () => {
        logger.warn('CometBFT WebSocket disconnected');
        this.ws = null;
        this.onStatusChange?.(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // onclose fires after onerror — reconnect handled there
      };
    } catch (err) {
      logger.error({ err }, 'Failed to create CometBFT WebSocket');
      this.scheduleReconnect();
    }
  }

  private subscribe(): void {
    if (!this.ws || !this.subscriptionQuery) return;

    this.ws.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'subscribe',
      id: 1,
      params: { query: this.subscriptionQuery },
    }));

    logger.info({ query: this.subscriptionQuery }, 'CometBFT WS: subscribed');
  }

  private handleMessage(data: Record<string, unknown>): void {
    // Skip subscription confirmation and error responses
    const result = data.result as Record<string, unknown> | undefined;
    if (!result?.data) return;

    const resultData = result.data as Record<string, unknown>;
    if (!resultData.value) return;

    const value = resultData.value as Record<string, unknown>;
    const txResult = value.TxResult as Record<string, unknown> | undefined;
    if (!txResult) return;

    try {
      const height = Number(txResult.height);

      // Extract tx hash from the events map
      const eventsMap = result.events as Record<string, string[]> | undefined;
      const txHash = eventsMap?.['tx.hash']?.[0] ?? '';

      // Parse result events
      const txResultBody = txResult.result as Record<string, unknown> | undefined;
      const rawEvents = (txResultBody?.events ?? []) as Array<{
        type: string;
        attributes: Array<{ key: string; value: string; index?: boolean }>;
      }>;

      const events: CometBFTTxEvent['events'] = [];
      for (const ev of rawEvents) {
        const attrs: Array<{ key: string; value: string }> = [];
        for (const attr of ev.attributes ?? []) {
          attrs.push({
            key: decodeAttrValue(attr.key),
            value: decodeAttrValue(attr.value),
          });
        }
        events.push({ type: ev.type, attributes: attrs });
      }

      if (events.length > 0 && txHash) {
        this.onEvent?.({ txHash, height, events });
      }
    } catch (err) {
      logger.debug({ err }, 'CometBFT WS: failed to parse tx event');
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      logger.info({ delayMs: this.reconnectDelay }, 'CometBFT WS: reconnecting...');
      this.connect();
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }
}

/**
 * Decode a CometBFT event attribute value.
 * CometBFT < v0.38 base64-encodes attribute keys/values.
 * CometBFT >= v0.38 sends plain text. This handles both.
 */
function decodeAttrValue(val: string | undefined): string {
  if (!val) return '';
  // If it looks like base64 (only base64 chars, min length, multiple of 4 or padded)
  if (/^[A-Za-z0-9+/]+=*$/.test(val) && val.length >= 4) {
    try {
      const decoded = Buffer.from(val, 'base64').toString('utf-8');
      // Only use decoded if all chars are printable ASCII
      if (/^[\x20-\x7E]+$/.test(decoded)) {
        return decoded;
      }
    } catch { /* not base64 */ }
  }
  return val;
}

/** Convert HTTP(S) RPC URL to CometBFT WebSocket URL */
export function rpcUrlToWsUrl(rpcUrl: string): string {
  return rpcUrl
    .replace(/^https:/, 'wss:')
    .replace(/^http:/, 'ws:')
    .replace(/\/?$/, '/websocket');
}
