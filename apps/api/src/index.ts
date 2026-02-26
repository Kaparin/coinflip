import { serve } from '@hono/node-server';
import { app } from './app.js';
import { setupWebSocket } from './routes/ws.js';
import { logger } from './lib/logger.js';
import { env, validateProductionEnv } from './config/env.js';
import { relayerService } from './services/relayer.js';
import { indexerService } from './services/indexer.js';
import { startBackgroundSweep, stopBackgroundSweep } from './services/background-tasks.js';
import { jackpotService } from './services/jackpot.service.js';
import { getDb } from './lib/db.js';

// ─── Startup validation ──────────────────────────────────────────
// Crash immediately if critical env vars are missing in production.
validateProductionEnv();

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

  // Ensure all jackpot tiers have active pools BEFORE indexer starts
  // (indexer's startup sync processes pending bets → jackpot contributions need pools to exist)
  try {
    await jackpotService.ensureActivePoolsExist();
    logger.info('Jackpot pools initialized');
    // Backfill contributions for any resolved bets that were missed
    await jackpotService.backfillContributions();
  } catch (err) {
    logger.warn({ err }, 'Jackpot pool initialization failed');
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
const wss = setupWebSocket(server);

// Initialize services (non-blocking)
initServices().catch((err) => {
  logger.error({ err }, 'Fatal: service initialization failed');
});

// ─── Graceful Shutdown ──────────────────────────────────────────
// On SIGTERM/SIGINT: stop accepting new requests, drain existing connections,
// shut down background services, and exit cleanly.

let shuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Received shutdown signal — starting graceful shutdown');

  const SHUTDOWN_TIMEOUT_MS = 15_000;
  const shutdownTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    // 1. Stop accepting new connections
    (server as import('node:http').Server).close(() => {
      logger.info('HTTP server closed');
    });

    // 2. Close all WebSocket connections
    if (wss) {
      for (const client of wss.clients) {
        client.close(1001, 'Server shutting down');
      }
      wss.close(() => {
        logger.info('WebSocket server closed');
      });
    }

    // 3. Stop background sweep
    stopBackgroundSweep();
    logger.info('Background sweep stopped');

    // 4. Stop indexer
    indexerService.stop();
    logger.info('Indexer stopped');

    // 5. Disconnect relayer
    await relayerService.disconnect();
    logger.info('Relayer disconnected');

    // 6. Allow a moment for in-flight requests to complete
    await new Promise(r => setTimeout(r, 2000));

    clearTimeout(shutdownTimer);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during graceful shutdown');
    clearTimeout(shutdownTimer);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Catch unhandled rejections — log them instead of crashing
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise: String(promise) }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception — shutting down');
  gracefulShutdown('uncaughtException');
});
