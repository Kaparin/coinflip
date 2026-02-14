import type { IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { wsService } from '../services/ws.service.js';
import { logger } from '../lib/logger.js';

export function setupWebSocket(server: ReturnType<typeof import('@hono/node-server').serve>) {
  const wss = new WebSocketServer({ server: server as never });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const address = new URL(req.url ?? '/', `http://${req.headers.host}`).searchParams.get('address');
    const clientId = wsService.addClient(ws as never, address ?? undefined);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      data: { clientId, message: 'Connected to CoinFlip real-time stream' },
      timestamp: Date.now(),
    }));

    ws.on('close', () => {
      wsService.removeClient(clientId);
    });

    ws.on('error', (err) => {
      logger.error({ clientId, err }, 'WebSocket error');
      wsService.removeClient(clientId);
    });

    // Handle incoming messages (e.g., subscription changes)
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        logger.debug({ clientId, msg }, 'WS message received');
        // Future: handle subscribe/unsubscribe to specific bet IDs, etc.
      } catch {
        // Ignore malformed messages
      }
    });
  });

  logger.info('WebSocket server attached');
  return wss;
}
