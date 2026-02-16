import type { WebSocket } from 'ws';
import { logger } from '../lib/logger.js';

type WsClient = {
  ws: WebSocket | { send: (data: string) => void; readyState: number };
  address?: string; // wallet address if authenticated
};

class WsService {
  private clients = new Map<string, WsClient>();
  private idCounter = 0;

  addClient(ws: WsClient['ws'], address?: string): string {
    const id = `ws_${++this.idCounter}`;
    this.clients.set(id, { ws, address });
    logger.info({ clientId: id, address, total: this.clients.size }, 'WS client connected');
    return id;
  }

  removeClient(id: string) {
    this.clients.delete(id);
    logger.info({ clientId: id, total: this.clients.size }, 'WS client disconnected');
  }

  /** Broadcast to all connected clients */
  broadcast(event: { type: string; data: Record<string, unknown> }) {
    const message = JSON.stringify({ ...event, timestamp: Date.now() });
    let sent = 0;

    for (const [id, client] of this.clients) {
      try {
        if (client.ws.readyState === 1) { // OPEN
          client.ws.send(message);
          sent++;
        }
      } catch (err) {
        logger.error({ clientId: id, err }, 'Failed to send WS message');
        this.clients.delete(id);
      }
    }

    logger.debug({ type: event.type, sent, total: this.clients.size }, 'WS broadcast');
  }

  /** Send to a specific wallet address */
  sendToAddress(address: string, event: { type: string; data: Record<string, unknown> }) {
    const message = JSON.stringify({ ...event, timestamp: Date.now() });

    for (const [id, client] of this.clients) {
      if (client.address === address) {
        try {
          if (client.ws.readyState === 1) {
            client.ws.send(message);
          }
        } catch {
          this.clients.delete(id);
        }
      }
    }
  }

  /** Emit bet-related events */
  emitBetCreated(bet: Record<string, unknown>) {
    this.broadcast({ type: 'bet_created', data: bet });
  }

  emitBetAccepted(bet: Record<string, unknown>) {
    this.broadcast({ type: 'bet_accepted', data: bet });
  }

  emitBetRevealed(bet: Record<string, unknown>) {
    this.broadcast({ type: 'bet_revealed', data: bet });
  }

  emitBetCanceled(bet: Record<string, unknown>) {
    this.broadcast({ type: 'bet_canceled', data: bet });
  }

  emitBetTimeoutClaimed(bet: Record<string, unknown>) {
    this.broadcast({ type: 'bet_timeout_claimed', data: bet });
  }

  emitBalanceUpdated(address: string, balance: Record<string, unknown>) {
    this.sendToAddress(address, { type: 'balance_updated', data: balance });
  }

  /** Bet confirmed on chain — bet_id resolved, bet is now "open" */
  emitBetConfirmed(bet: Record<string, unknown>) {
    this.broadcast({ type: 'bet_confirmed', data: bet });
  }

  /** Bet is being accepted — removes from Open Bets for all users */
  emitBetAccepting(bet: Record<string, unknown>) {
    this.broadcast({ type: 'bet_accepting', data: bet });
  }

  /** Accept failed — bet reverts to "open" */
  emitBetReverted(bet: Record<string, unknown>) {
    this.broadcast({ type: 'bet_reverted', data: bet });
  }

  /** Bet creation failed on chain (DeliverTx error) */
  emitBetCreateFailed(address: string, data: Record<string, unknown>) {
    this.sendToAddress(address, { type: 'bet_create_failed', data });
  }

  /** Accept bet failed on chain (DeliverTx error) — bet reverted to "open" */
  emitAcceptFailed(address: string, data: Record<string, unknown>) {
    this.sendToAddress(address, { type: 'accept_failed', data });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const wsService = new WsService();
