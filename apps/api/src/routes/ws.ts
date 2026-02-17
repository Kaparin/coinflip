import type { IncomingMessage } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { wsService } from '../services/ws.service.js';
import { logger } from '../lib/logger.js';
import { verifySessionToken, SESSION_COOKIE_NAME } from '../services/session.service.js';
import { env } from '../config/env.js';

// ─── Per-IP connection limit ────────────────────────────────────
const MAX_WS_CONNECTIONS_PER_IP = 10;
const wsConnectionCounts = new Map<string, number>();

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? 'unknown';
}

/** Parse session cookie from raw Cookie header */
function parseSessionCookie(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split('=');
    if (name === SESSION_COOKIE_NAME) return rest.join('=');
  }
  return null;
}

export function setupWebSocket(server: HttpServer | ReturnType<typeof import('@hono/node-server').serve>) {
  const wss = new WebSocketServer({ noServer: true });
  const isProd = env.NODE_ENV === 'production';

  // Handle upgrade manually — intercept before Hono can respond with 404
  (server as HttpServer).on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    // ─── Rate limit: max connections per IP ───
    const ip = getClientIp(req);
    const currentCount = wsConnectionCounts.get(ip) ?? 0;
    if (currentCount >= MAX_WS_CONNECTIONS_PER_IP) {
      logger.warn({ ip, count: currentCount }, 'WS connection limit exceeded — rejecting');
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    // ─── Auth: verify session token in production ───
    let authenticatedAddress: string | undefined;
    const queryAddress = url.searchParams.get('address') ?? undefined;

    const sessionToken = parseSessionCookie(req.headers.cookie ?? '');
    if (sessionToken) {
      const session = verifySessionToken(sessionToken);
      if (session) {
        authenticatedAddress = session.address;
      }
    }

    // In production, require authentication. In dev, allow query param fallback.
    if (isProd && !authenticatedAddress) {
      logger.warn({ ip, queryAddress }, 'WS connection rejected — no valid session token');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const finalAddress = authenticatedAddress ?? queryAddress;

    wss.handleUpgrade(req, socket, head, (ws) => {
      // Track connection count
      wsConnectionCounts.set(ip, currentCount + 1);
      (ws as WebSocket & { _clientIp?: string })._clientIp = ip;

      wss.emit('connection', ws, req, finalAddress);
    });
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

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, address?: string) => {
    const clientId = wsService.addClient(ws as never, address ?? undefined);
    const ip = (ws as WebSocket & { _clientIp?: string })._clientIp;

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
      // Decrement IP connection counter
      if (ip) {
        const count = wsConnectionCounts.get(ip) ?? 1;
        if (count <= 1) wsConnectionCounts.delete(ip);
        else wsConnectionCounts.set(ip, count - 1);
      }
    });

    ws.on('error', (err) => {
      logger.error({ clientId, err }, 'WebSocket error');
      wsService.removeClient(clientId);
      if (ip) {
        const count = wsConnectionCounts.get(ip) ?? 1;
        if (count <= 1) wsConnectionCounts.delete(ip);
        else wsConnectionCounts.set(ip, count - 1);
      }
    });

    // Handle incoming messages (with rate limiting)
    let messageCount = 0;
    const messageResetInterval = setInterval(() => { messageCount = 0; }, 10_000);

    ws.on('message', (raw) => {
      messageCount++;
      if (messageCount > 50) {
        // 50 messages per 10 seconds — way too many
        logger.warn({ clientId, messageCount }, 'WS message flood detected — closing');
        clearInterval(messageResetInterval);
        ws.close(1008, 'Message rate limit exceeded');
        return;
      }
      try {
        const msg = JSON.parse(raw.toString());
        logger.debug({ clientId, msg }, 'WS message received');
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => clearInterval(messageResetInterval));
  });

  logger.info('WebSocket server attached');
  return wss;
}
