import type { IncomingMessage } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { wsService } from '../services/ws.service.js';
import { logger } from '../lib/logger.js';

export function setupWebSocket(server: HttpServer | ReturnType<typeof import('@hono/node-server').serve>) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade manually — intercept before Hono can respond with 404
  (server as HttpServer).on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      // Not a WS path — destroy the socket
      socket.destroy();
    }
  });

  // Server-side heartbeat: ping every 30s, terminate dead connections
  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if ((ws as WebSocket & { isAlive?: boolean }).isAlive === false) {
        ws.terminate();
        continue;
      }
      (ws as WebSocket & { isAlive?: boolean }).isAlive = false;
      ws.ping();
    }
  }, 30_000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const address = new URL(req.url ?? '/', `http://${req.headers.host}`).searchParams.get('address');
    const clientId = wsService.addClient(ws as never, address ?? undefined);

    // Mark connection as alive
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    ws.on('pong', () => {
      (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      data: { clientId, message: 'Connected to CoinFlip real-time stream' },
      timestamp: Date.now(),
    }));

    ws.on('close', (code: number, reason: Buffer) => {
      logger.info({ clientId, closeCode: code, closeReason: reason.toString() }, 'WS close event');
      wsService.removeClient(clientId);
    });

    ws.on('error', (err) => {
      logger.error({ clientId, err }, 'WebSocket error');
      wsService.removeClient(clientId);
    });

    // Handle incoming messages
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        logger.debug({ clientId, msg }, 'WS message received');
      } catch {
        // Ignore malformed messages
      }
    });
  });

  logger.info('WebSocket server attached');
  return wss;
}
