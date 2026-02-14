/**
 * Chain Indexer Service.
 *
 * Polls Axiome Chain blocks for CoinFlip contract events and syncs them
 * to PostgreSQL. The chain is the source of truth; DB is a fast read cache.
 *
 * Events indexed (emitted by the coinflip-pvp-vault contract):
 *   - coinflip.bet_created     (bet_id, maker, amount)
 *   - coinflip.bet_canceled    (bet_id)
 *   - coinflip.bet_accepted    (bet_id, acceptor, guess)
 *   - coinflip.bet_revealed    (bet_id, side, winner)
 *   - coinflip.bet_timeout_claimed (bet_id, winner)
 *   - coinflip.commission_paid (bet_id, treasury, amount)
 *
 * Axiome REST API (LCD):
 *   GET /cosmos/tx/v1beta1/txs?events=wasm.action='create_bet'&pagination.limit=100
 *   GET /cosmos/base/tendermint/v1beta1/blocks/{height}
 */

import { StargateClient } from '@cosmjs/stargate';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { wsService } from './ws.service.js';
import type { Database } from '@coinflip/db';
import type { WsEventType } from '@coinflip/shared/types';

/** Parsed CoinFlip event from chain */
interface CoinFlipEvent {
  type: string;
  attributes: Record<string, string>;
  txHash: string;
  height: number;
}

export class IndexerService {
  private client: StargateClient | null = null;
  private db: Database | null = null;
  private lastIndexedHeight = 0;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private contractAddress: string;
  private isRunning = false;

  constructor() {
    this.contractAddress = env.COINFLIP_CONTRACT_ADDR;
  }

  /** Initialize with DB connection and start polling */
  async init(db: Database): Promise<void> {
    this.db = db;

    if (!this.contractAddress) {
      logger.warn('COINFLIP_CONTRACT_ADDR not set — indexer disabled');
      return;
    }

    try {
      this.client = await StargateClient.connect(env.AXIOME_RPC_URL);

      // Get current chain height
      const currentHeight = await this.client.getHeight();
      // Start from current height (don't reindex historical blocks)
      this.lastIndexedHeight = currentHeight;

      logger.info(
        { startHeight: this.lastIndexedHeight, contract: this.contractAddress },
        'Indexer initialized',
      );
    } catch (err) {
      logger.error({ err }, 'Failed to initialize indexer');
      throw err;
    }
  }

  /** Start polling for new blocks */
  start(intervalMs = 3000): void {
    if (this.isRunning) return;
    if (!this.client) {
      logger.warn('Indexer not initialized, cannot start');
      return;
    }

    this.isRunning = true;
    this.pollInterval = setInterval(() => void this.pollNewBlocks(), intervalMs);
    logger.info({ intervalMs }, 'Indexer polling started');
  }

  /** Stop polling */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
    logger.info('Indexer polling stopped');
  }

  /** Poll for new blocks and process events */
  private async pollNewBlocks(): Promise<void> {
    if (!this.client) return;

    try {
      const currentHeight = await this.client.getHeight();

      if (currentHeight <= this.lastIndexedHeight) return;

      // Process blocks one by one (bounded to prevent huge catch-up)
      const maxBlocksPerPoll = 10;
      const endHeight = Math.min(
        currentHeight,
        this.lastIndexedHeight + maxBlocksPerPoll,
      );

      for (let height = this.lastIndexedHeight + 1; height <= endHeight; height++) {
        await this.processBlock(height);
      }

      this.lastIndexedHeight = endHeight;
    } catch (err) {
      logger.error({ err }, 'Error polling blocks');
    }
  }

  /** Process a single block: fetch txs and extract contract events */
  private async processBlock(height: number): Promise<void> {
    try {
      // Use REST API to search for txs at this height that interact with our contract
      const response = await fetch(
        `${env.AXIOME_REST_URL}/cosmos/tx/v1beta1/txs?events=tx.height=${height}&events=wasm._contract_address='${this.contractAddress}'&pagination.limit=100`,
      );

      if (!response.ok) {
        // No txs at this height, or REST error — skip quietly
        return;
      }

      const data = await response.json() as {
        tx_responses?: Array<{
          txhash: string;
          height: string;
          code: number;
          logs?: Array<{
            events?: Array<{
              type: string;
              attributes: Array<{ key: string; value: string }>;
            }>;
          }>;
        }>;
      };

      const txResponses = data.tx_responses ?? [];

      for (const txResponse of txResponses) {
        if (txResponse.code !== 0) continue; // Skip failed txs

        const events = this.extractCoinFlipEvents(
          txResponse.txhash,
          Number(txResponse.height),
          txResponse.logs ?? [],
        );

        for (const event of events) {
          await this.handleEvent(event);
        }
      }
    } catch (err) {
      // Silently skip blocks with no data (common during low-activity periods)
      logger.debug({ height, err }, 'Block processing skipped');
    }
  }

  /** Extract CoinFlip-specific events from tx logs */
  private extractCoinFlipEvents(
    txHash: string,
    height: number,
    logs: Array<{
      events?: Array<{
        type: string;
        attributes: Array<{ key: string; value: string }>;
      }>;
    }>,
  ): CoinFlipEvent[] {
    const coinflipEvents: CoinFlipEvent[] = [];

    for (const log of logs) {
      for (const event of log.events ?? []) {
        // Look for wasm events with our contract address
        if (event.type !== 'wasm') continue;

        const attrs: Record<string, string> = {};
        let isOurContract = false;

        for (const attr of event.attributes) {
          if (attr.key === '_contract_address' && attr.value === this.contractAddress) {
            isOurContract = true;
          }
          attrs[attr.key] = attr.value;
        }

        if (!isOurContract) continue;

        // Determine event type from 'action' attribute
        const action = attrs.action;
        if (action) {
          coinflipEvents.push({
            type: `coinflip.${action}`,
            attributes: attrs,
            txHash,
            height,
          });
        }
      }
    }

    return coinflipEvents;
  }

  /** Handle a parsed CoinFlip event — update DB and notify via WebSocket */
  private async handleEvent(event: CoinFlipEvent): Promise<void> {
    logger.info(
      {
        type: event.type,
        txHash: event.txHash,
        height: event.height,
        betId: event.attributes.bet_id,
      },
      'Processing chain event',
    );

    // Store event in tx_events table
    if (this.db) {
      try {
        const { txEvents } = await import('@coinflip/db/schema');
        await this.db.insert(txEvents).values({
          txhash: event.txHash,
          height: BigInt(event.height),
          eventType: event.type,
          attributes: event.attributes,
        });
      } catch (err) {
        logger.error({ err, event }, 'Failed to insert tx_event');
      }
    }

    // Map event type to WS event and broadcast
    const wsEventMap: Record<string, WsEventType> = {
      'coinflip.bet_created': 'bet_created',       // changed from create_bet
      'coinflip.create_bet': 'bet_created',
      'coinflip.bet_canceled': 'bet_canceled',
      'coinflip.cancel_bet': 'bet_canceled',
      'coinflip.bet_accepted': 'bet_accepted',
      'coinflip.accept_bet': 'bet_accepted',
      'coinflip.bet_revealed': 'bet_revealed',
      'coinflip.reveal': 'bet_revealed',
      'coinflip.bet_timeout_claimed': 'bet_timeout_claimed',
      'coinflip.claim_timeout': 'bet_timeout_claimed',
    };

    const wsType = wsEventMap[event.type];
    if (wsType) {
      // Broadcast to all connected WebSocket clients
      wsService.broadcast({
        type: wsType,
        data: {
          bet_id: event.attributes.bet_id,
          ...event.attributes,
          txHash: event.txHash,
          height: event.height,
        },
      });

      // Also notify specific addresses if we can identify them
      const makerAddr = event.attributes.maker;
      const acceptorAddr = event.attributes.acceptor;
      if (makerAddr) {
        wsService.sendToAddress(makerAddr, {
          type: wsType,
          data: { bet_id: event.attributes.bet_id, ...event.attributes },
        });
      }
      if (acceptorAddr) {
        wsService.sendToAddress(acceptorAddr, {
          type: wsType,
          data: { bet_id: event.attributes.bet_id, ...event.attributes },
        });
      }
    }

    // TODO: Update bet status in DB based on event type
    // This is where we sync chain state -> DB for each event
    await this.syncBetFromEvent(event);
  }

  /** Sync bet state in DB based on chain event */
  private async syncBetFromEvent(event: CoinFlipEvent): Promise<void> {
    if (!this.db) return;

    const betId = event.attributes.bet_id;
    if (!betId) return;

    try {
      const { bets } = await import('@coinflip/db/schema');
      const { eq } = await import('drizzle-orm');

      switch (event.type) {
        case 'coinflip.create_bet':
        case 'coinflip.bet_created': {
          // Bet already created via API; update txhash if needed
          break;
        }

        case 'coinflip.accept_bet':
        case 'coinflip.bet_accepted': {
          await this.db
            .update(bets)
            .set({
              status: 'accepted',
              acceptedTime: new Date(),
              acceptedHeight: BigInt(event.height),
              txhashAccept: event.txHash,
            })
            .where(eq(bets.betId, BigInt(betId)));
          break;
        }

        case 'coinflip.reveal':
        case 'coinflip.bet_revealed': {
          await this.db
            .update(bets)
            .set({
              status: 'revealed',
              resolvedTime: new Date(),
              resolvedHeight: BigInt(event.height),
              txhashResolve: event.txHash,
            })
            .where(eq(bets.betId, BigInt(betId)));
          break;
        }

        case 'coinflip.cancel_bet':
        case 'coinflip.bet_canceled': {
          await this.db
            .update(bets)
            .set({
              status: 'canceled',
              resolvedTime: new Date(),
              resolvedHeight: BigInt(event.height),
              txhashResolve: event.txHash,
            })
            .where(eq(bets.betId, BigInt(betId)));
          break;
        }

        case 'coinflip.claim_timeout':
        case 'coinflip.bet_timeout_claimed': {
          await this.db
            .update(bets)
            .set({
              status: 'timeout_claimed',
              resolvedTime: new Date(),
              resolvedHeight: BigInt(event.height),
              txhashResolve: event.txHash,
            })
            .where(eq(bets.betId, BigInt(betId)));
          break;
        }
      }
    } catch (err) {
      logger.error({ err, event }, 'Failed to sync bet from event');
    }
  }

  /** Get indexer health status */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastIndexedHeight: this.lastIndexedHeight,
      contractAddress: this.contractAddress,
    };
  }

  /** Disconnect */
  async disconnect(): Promise<void> {
    this.stop();
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }
}

/** Singleton indexer instance */
export const indexerService = new IndexerService();
