import { serve } from '@hono/node-server';
import { app } from './app.js';
import { setupWebSocket } from './routes/ws.js';
import { logger } from './lib/logger.js';
import { env } from './config/env.js';
import { relayerService } from './services/relayer.js';
import { indexerService } from './services/indexer.js';
import { startBackgroundSweep } from './services/background-tasks.js';
import { getDb } from './lib/db.js';

const port = env.API_PORT;

logger.info(`Starting CoinFlip API server on port ${port}`);

// Initialize backend services
async function initServices() {
  try {
    // Initialize relayer (chain transaction submission)
    await relayerService.init();
    logger.info('Relayer service initialized');
  } catch (err) {
    logger.warn({ err }, 'Relayer service failed to initialize — chain operations disabled');
  }

  const enableIndexer = env.ENABLE_INDEXER === 'true';
  const enableSweep = env.ENABLE_BACKGROUND_SWEEP === 'true';

  if (enableIndexer) {
    try {
      // Initialize indexer (chain event polling)
      const db = getDb();
      await indexerService.init(db);
      indexerService.start(3000); // Poll every 3 seconds
      logger.info('Indexer service started');
    } catch (err) {
      logger.warn({ err }, 'Indexer service failed to initialize — event sync disabled');
    }
  } else {
    logger.info('Indexer disabled (ENABLE_INDEXER != "true"). Set ENABLE_INDEXER=true to enable.');
  }

  if (enableSweep) {
    // Start background sweep (auto-reveal + auto-claim-timeout, every 30s)
    startBackgroundSweep();
  } else {
    logger.info('Background sweep disabled (ENABLE_BACKGROUND_SWEEP != "true"). Set ENABLE_BACKGROUND_SWEEP=true to enable.');
  }
}

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

// Initialize services (non-blocking)
initServices().catch((err) => {
  logger.error({ err }, 'Fatal: service initialization failed');
});
