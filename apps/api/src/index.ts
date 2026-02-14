import { serve } from '@hono/node-server';
import { app } from './app.js';
import { setupWebSocket } from './routes/ws.js';
import { logger } from './lib/logger.js';
import { env } from './config/env.js';

const port = env.API_PORT;

logger.info(`Starting CoinFlip API server on port ${port}`);

const server = serve({
  fetch: app.fetch,
  port,
}, (info) => {
  logger.info(`CoinFlip API running at http://localhost:${info.port}`);
  logger.info(`Swagger UI at http://localhost:${info.port}/docs`);
  logger.info(`WebSocket at ws://localhost:${info.port}/ws`);
});

// Attach WebSocket server
setupWebSocket(server);
