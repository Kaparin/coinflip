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
 */

import { StargateClient } from '@cosmjs/stargate';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { wsService } from './ws.service.js';
import { eventService } from './event.service.js';
import { referralService } from './referral.service.js';
import { vaultService } from './vault.service.js';
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

      // Sync any bets that may be out of sync with chain state
      await this.syncAllBetsWithChain();
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
        try {
          await this.processBlock(height);
        } catch (err) {
          logger.error({ err, height }, 'Failed to process block — will retry next poll');
          this.lastIndexedHeight = height - 1;
          return;
        }
      }

      this.lastIndexedHeight = endHeight;
    } catch (err) {
      logger.error({ err }, 'Error polling blocks');
      // Reconnect client if the connection was lost
      try {
        this.client?.disconnect();
        this.client = await StargateClient.connect(env.AXIOME_RPC_URL);
      } catch (reconnectErr) {
        logger.error({ reconnectErr }, 'Failed to reconnect indexer client');
      }
    }
  }

  /** Process a single block: fetch txs and extract contract events */
  private async processBlock(height: number): Promise<void> {
    try {
      // Use REST API to search for txs at this height.
      // Cosmos SDK v0.47+ uses `query` param instead of `events`.
      // We filter for our contract in code after fetching all txs at this height.
      const queryStr = encodeURIComponent(`tx.height=${height}`);
      const response = await fetch(
        `${env.AXIOME_REST_URL}/cosmos/tx/v1beta1/txs?query=${queryStr}&pagination.limit=100`,
        { signal: AbortSignal.timeout(5000) },
      );

      if (!response.ok) return;

      const data = await response.json() as {
        tx_responses?: Array<{
          txhash: string;
          height: string;
          code: number;
          // Modern Cosmos SDK: events are at top level, not in logs
          events?: Array<{
            type: string;
            attributes: Array<{ key: string; value: string }>;
          }>;
          // Legacy Cosmos SDK: events in logs
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
        if (txResponse.code !== 0) continue;

        const events = this.extractCoinFlipEvents(txResponse);

        for (const event of events) {
          await this.handleEvent(event);
        }
      }
    } catch (err) {
      logger.debug({ height, err }, 'Block processing skipped');
    }
  }

  /**
   * Extract CoinFlip-specific events from tx response.
   * 
   * IMPORTANT: Modern Cosmos SDK (v0.47+) puts events in tx_response.events[]
   * directly, NOT in tx_response.logs[].events[]. We check both.
   */
  private extractCoinFlipEvents(
    txResponse: {
      txhash: string;
      height: string;
      events?: Array<{
        type: string;
        attributes: Array<{ key: string; value: string }>;
      }>;
      logs?: Array<{
        events?: Array<{
          type: string;
          attributes: Array<{ key: string; value: string }>;
        }>;
      }>;
    },
  ): CoinFlipEvent[] {
    const coinflipEvents: CoinFlipEvent[] = [];
    const txHash = txResponse.txhash;
    const height = Number(txResponse.height);

    // Collect all event arrays from both sources
    const allEventArrays: Array<{
      type: string;
      attributes: Array<{ key: string; value: string }>;
    }>[] = [];

    // Source 1: tx_response.events[] (modern Cosmos SDK)
    if (txResponse.events && txResponse.events.length > 0) {
      allEventArrays.push(txResponse.events);
    }

    // Source 2: tx_response.logs[].events[] (legacy)
    if (txResponse.logs) {
      for (const log of txResponse.logs) {
        if (log.events && log.events.length > 0) {
          allEventArrays.push(log.events);
        }
      }
    }

    for (const eventArray of allEventArrays) {
      for (const event of eventArray) {
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

        const action = attrs.action;
        if (action) {
          coinflipEvents.push({
            type: action.startsWith('coinflip.') ? action : `coinflip.${action}`,
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

    // Deduplication: check if we already processed this exact tx+event combination
    if (this.db) {
      try {
        const { txEvents } = await import('@coinflip/db/schema');
        const { and, eq: drizzleEq } = await import('drizzle-orm');
        const existing = await this.db
          .select({ id: txEvents.id })
          .from(txEvents)
          .where(and(
            drizzleEq(txEvents.txhash, event.txHash),
            drizzleEq(txEvents.eventType, event.type),
          ))
          .limit(1);
        if (existing.length > 0) {
          logger.debug({ txHash: event.txHash, type: event.type }, 'Event already indexed — skipping');
          return;
        }
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
      'coinflip.bet_created': 'bet_created',
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
      wsService.broadcast({
        type: wsType,
        data: {
          bet_id: event.attributes.bet_id,
          ...event.attributes,
          txHash: event.txHash,
          height: event.height,
        },
      });
    }

    // Record commission in treasury_ledger
    if (
      event.type === 'coinflip.commission_paid' ||
      event.attributes.action === 'commission_paid'
    ) {
      const amount = event.attributes.amount;
      if (amount && BigInt(amount) > 0n) {
        try {
          await eventService.recordCommission({
            txhash: event.txHash,
            amount,
            source: `bet:${event.attributes.bet_id ?? 'unknown'}`,
          });
        } catch {
          // May be duplicate — ignore
        }
      }
    }

    // Update bet status in DB based on event type
    await this.syncBetFromEvent(event);
  }

  /** Sync bet state in DB based on chain event */
  private async syncBetFromEvent(event: CoinFlipEvent): Promise<void> {
    if (!this.db) return;

    const betId = event.attributes.bet_id;
    if (!betId) return;

    try {
      const { bets, users } = await import('@coinflip/db/schema');
      const { eq, and, inArray } = await import('drizzle-orm');

      switch (event.type) {
        case 'coinflip.create_bet':
        case 'coinflip.bet_created': {
          // Bet was created via API and saved to DB.
          // If the DB bet has a wrong betId (timestamp fallback), fix it now.
          const chainBetId = BigInt(betId);
          const maker = event.attributes.maker;
          const txHash = event.txHash;

          // Find DB bet by txhash_create
          const existing = await this.db
            .select()
            .from(bets)
            .where(eq(bets.txhashCreate, txHash))
            .limit(1);

          if (existing.length > 0 && existing[0]!.betId !== chainBetId) {
            logger.info(
              { oldBetId: existing[0]!.betId.toString(), newBetId: chainBetId.toString(), txHash },
              'Fixing bet_id from chain event',
            );
            await this.db
              .update(bets)
              .set({ betId: chainBetId })
              .where(eq(bets.txhashCreate, txHash));
          }
          break;
        }

        case 'coinflip.accept_bet':
        case 'coinflip.bet_accepted': {
          // Extract acceptor and guess from event attributes
          const acceptorAddress = event.attributes.acceptor;
          const guess = event.attributes.guess;

          // Resolve acceptor user ID from address
          let acceptorUserId: string | null = null;
          if (acceptorAddress) {
            const userRow = await this.db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.address, acceptorAddress))
              .limit(1);
            if (userRow.length > 0) {
              acceptorUserId = userRow[0]!.id;
            }
          }

          await this.db
            .update(bets)
            .set({
              status: 'accepted',
              ...(acceptorUserId ? { acceptorUserId } : {}),
              ...(guess ? { acceptorGuess: guess } : {}),
              acceptedTime: new Date(),
              acceptedHeight: BigInt(event.height),
              txhashAccept: event.txHash,
            })
            .where(and(
              eq(bets.betId, BigInt(betId)),
              inArray(bets.status, ['open', 'accepting']),
            ));

          logger.info({ betId, acceptorAddress, acceptorUserId, guess }, 'Bet accepted — DB synced');
          break;
        }

        case 'coinflip.reveal':
        case 'coinflip.bet_revealed': {
          const commissionAmount = event.attributes.commission_amount ?? null;
          const payoutAmount = event.attributes.payout_amount ?? null;
          const winnerAddress = event.attributes.winner ?? null;

          let winnerUserId: string | null = null;
          if (winnerAddress) {
            const winnerUser = await this.db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.address, winnerAddress))
              .limit(1);
            if (winnerUser.length > 0) {
              winnerUserId = winnerUser[0]!.id;
            }
          }

          // Fetch bet BEFORE update to get maker/acceptor info for vault unlock
          const betBeforeReveal = await this.db
            .select({ makerUserId: bets.makerUserId, acceptorUserId: bets.acceptorUserId, amount: bets.amount, status: bets.status })
            .from(bets)
            .where(eq(bets.betId, BigInt(betId)))
            .limit(1);

          await this.db
            .update(bets)
            .set({
              status: 'revealed',
              resolvedTime: new Date(),
              resolvedHeight: BigInt(event.height),
              txhashResolve: event.txHash,
              ...(commissionAmount ? { commissionAmount } : {}),
              ...(payoutAmount ? { payoutAmount } : {}),
              ...(winnerUserId ? { winnerUserId } : {}),
            })
            .where(and(
              eq(bets.betId, BigInt(betId)),
              inArray(bets.status, ['accepted', 'accepting']),
            ));

          // Unlock vault funds for both maker and acceptor (chain contract handles actual payout)
          if (betBeforeReveal.length > 0) {
            const prev = betBeforeReveal[0]!;
            if (['accepted', 'accepting'].includes(prev.status)) {
              await vaultService.unlockFunds(prev.makerUserId, prev.amount).catch(err =>
                logger.warn({ err, betId }, 'bet_revealed: unlockFunds maker failed'));
              if (prev.acceptorUserId) {
                await vaultService.unlockFunds(prev.acceptorUserId, prev.amount).catch(err =>
                  logger.warn({ err, betId }, 'bet_revealed: unlockFunds acceptor failed'));
              }
            }
          }

          // Distribute referral rewards (idempotent — safe if already called by background task)
          await this.distributeReferralRewardsForBet(BigInt(betId));

          logger.info({ betId, winnerAddress, winnerUserId }, 'Bet revealed — DB synced');
          break;
        }

        case 'coinflip.cancel_bet':
        case 'coinflip.bet_canceled': {
          // Fetch bet BEFORE update to get maker/acceptor info for vault unlock
          const betBeforeCancel = await this.db
            .select({ makerUserId: bets.makerUserId, acceptorUserId: bets.acceptorUserId, amount: bets.amount, status: bets.status })
            .from(bets)
            .where(eq(bets.betId, BigInt(betId)))
            .limit(1);

          await this.db
            .update(bets)
            .set({
              status: 'canceled',
              resolvedTime: new Date(),
              resolvedHeight: BigInt(event.height),
              txhashResolve: event.txHash,
            })
            .where(and(
              eq(bets.betId, BigInt(betId)),
              inArray(bets.status, ['open', 'canceling']),
            ));

          // Unlock vault funds for maker (and acceptor if exists)
          if (betBeforeCancel.length > 0) {
            const prev = betBeforeCancel[0]!;
            if (['open', 'canceling'].includes(prev.status)) {
              await vaultService.unlockFunds(prev.makerUserId, prev.amount).catch(err =>
                logger.warn({ err, betId }, 'bet_canceled: unlockFunds maker failed'));
              if (prev.acceptorUserId) {
                await vaultService.unlockFunds(prev.acceptorUserId, prev.amount).catch(err =>
                  logger.warn({ err, betId }, 'bet_canceled: unlockFunds acceptor failed'));
              }
            }
          }
          break;
        }

        case 'coinflip.claim_timeout':
        case 'coinflip.bet_timeout_claimed': {
          const winnerAddress = event.attributes.winner ?? null;
          let winnerUserId: string | null = null;
          if (winnerAddress) {
            const winnerUser = await this.db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.address, winnerAddress))
              .limit(1);
            if (winnerUser.length > 0) {
              winnerUserId = winnerUser[0]!.id;
            }
          }

          // Fetch bet BEFORE update to get maker/acceptor info for vault unlock
          const betBeforeTimeout = await this.db
            .select({ makerUserId: bets.makerUserId, acceptorUserId: bets.acceptorUserId, amount: bets.amount, status: bets.status })
            .from(bets)
            .where(eq(bets.betId, BigInt(betId)))
            .limit(1);

          await this.db
            .update(bets)
            .set({
              status: 'timeout_claimed',
              resolvedTime: new Date(),
              resolvedHeight: BigInt(event.height),
              txhashResolve: event.txHash,
              ...(winnerUserId ? { winnerUserId } : {}),
            })
            .where(and(
              eq(bets.betId, BigInt(betId)),
              inArray(bets.status, ['accepted']),
            ));

          // Unlock vault funds for both maker and acceptor (chain contract handles actual payout)
          if (betBeforeTimeout.length > 0) {
            const prev = betBeforeTimeout[0]!;
            if (prev.status === 'accepted') {
              await vaultService.unlockFunds(prev.makerUserId, prev.amount).catch(err =>
                logger.warn({ err, betId }, 'timeout_claimed: unlockFunds maker failed'));
              if (prev.acceptorUserId) {
                await vaultService.unlockFunds(prev.acceptorUserId, prev.amount).catch(err =>
                  logger.warn({ err, betId }, 'timeout_claimed: unlockFunds acceptor failed'));
              }
            }
          }

          // Distribute referral rewards (idempotent — safe if already called by background task)
          await this.distributeReferralRewardsForBet(BigInt(betId));

          break;
        }
      }
    } catch (err) {
      logger.error({ err, event }, 'Failed to sync bet from event');
    }
  }

  /**
   * Startup sync: query ALL bets from chain and reconcile with DB.
   * This fixes any drift that occurred while the server was down.
   */
  private async syncAllBetsWithChain(): Promise<void> {
    if (!this.db || !this.contractAddress) return;

    logger.info('Starting full bet sync with chain...');

    try {
      const { bets, users } = await import('@coinflip/db/schema');
      const { eq, inArray } = await import('drizzle-orm');

      // Get all non-resolved bets from DB (open, accepted, accepting)
      const pendingBets = await this.db
        .select()
        .from(bets)
        .where(inArray(bets.status, ['open', 'accepted', 'accepting']));

      if (pendingBets.length === 0) {
        logger.info('No pending bets to sync');
        return;
      }

      // Fix orphaned bets with timestamp-based betIds (> 1 million)
      // These were created when broadcastTxSync was used and chain bet_id wasn't resolved
      const orphanedBets = pendingBets.filter(b => Number(b.betId) > 1_000_000);
      if (orphanedBets.length > 0) {
        logger.info({ count: orphanedBets.length }, 'Found orphaned bets with timestamp IDs — fixing...');
        try {
          // Fetch all open bets from chain to match by commitment
          const openQuery = JSON.stringify({ open_bets: { limit: 100 } });
          const openEncoded = Buffer.from(openQuery).toString('base64');
          const openRes = await fetch(
            `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${this.contractAddress}/smart/${openEncoded}`,
            { signal: AbortSignal.timeout(5000) },
          );
          if (openRes.ok) {
            const openData = await openRes.json() as { data: { bets: Array<{ id: number; commitment: string; status: string }> } };
            const chainBets = openData.data.bets;

            for (const orphan of orphanedBets) {
              // Convert DB commitment (hex) to base64 for comparison
              const commitBase64 = Buffer.from(orphan.commitment, 'hex').toString('base64');
              const match = chainBets.find(cb => cb.commitment === commitBase64);
              if (match) {
                logger.info(
                  { oldBetId: orphan.betId.toString(), newBetId: match.id, commitment: orphan.commitment.substring(0, 16) },
                  'Fixing orphan bet_id',
                );
                await this.db!
                  .update(bets)
                  .set({ betId: BigInt(match.id) })
                  .where(eq(bets.betId, orphan.betId));
              } else {
                // Not found in open_bets — query chain directly for this bet's commitment
                // to check if it was accepted/resolved rather than blindly canceling
                let shouldCancel = true;
                try {
                  // Search in a wider range of recent chain bets
                  const allQuery = JSON.stringify({ open_bets: { limit: 200 } });
                  const allEncoded = Buffer.from(allQuery).toString('base64');
                  const allRes = await fetch(
                    `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${this.contractAddress}/smart/${allEncoded}`,
                    { signal: AbortSignal.timeout(5000) },
                  );
                  if (allRes.ok) {
                    const allData = await allRes.json() as { data: { bets: Array<{ id: number; commitment: string }> } };
                    const commitBase64 = Buffer.from(orphan.commitment, 'hex').toString('base64');
                    const widerMatch = allData.data.bets.find((cb: { commitment: string }) => cb.commitment === commitBase64);
                    if (widerMatch) {
                      logger.info(
                        { oldBetId: orphan.betId.toString(), newBetId: widerMatch.id },
                        'Orphan found in wider query — fixing bet_id instead of canceling',
                      );
                      await this.db!
                        .update(bets)
                        .set({ betId: BigInt(widerMatch.id) })
                        .where(eq(bets.betId, orphan.betId));
                      shouldCancel = false;
                    }
                  }
                } catch (err) {
                  logger.warn({ err, betId: orphan.betId.toString() }, 'Orphan: wider query failed — will cancel');
                }

                if (shouldCancel) {
                  logger.warn({ betId: orphan.betId.toString() }, 'Orphaned bet not found on chain — marking as canceled');
                  await this.db!
                    .update(bets)
                    .set({ status: 'canceled', resolvedTime: new Date() })
                    .where(eq(bets.betId, orphan.betId));

                  // Unlock vault funds for maker (and acceptor if exists)
                  await vaultService.unlockFunds(orphan.makerUserId, orphan.amount).catch(err =>
                    logger.warn({ err, betId: orphan.betId.toString() }, 'Orphan cancel: unlockFunds maker failed'));
                  if (orphan.acceptorUserId) {
                    await vaultService.unlockFunds(orphan.acceptorUserId, orphan.amount).catch(err =>
                      logger.warn({ err, betId: orphan.betId.toString() }, 'Orphan cancel: unlockFunds acceptor failed'));
                  }
                }
              }
            }
          }
        } catch (err) {
          logger.warn({ err }, 'Failed to fix orphaned bets');
        }
      }

      // Re-fetch pending bets after orphan fix
      const activeBets = await this.db
        .select()
        .from(bets)
        .where(inArray(bets.status, ['open', 'accepted', 'accepting']));

      let synced = 0;
      for (const bet of activeBets) {
        try {
          // Query chain for current state of this bet
          const query = JSON.stringify({ bet: { bet_id: Number(bet.betId) } });
          const encoded = Buffer.from(query).toString('base64');
          const res = await fetch(
            `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${this.contractAddress}/smart/${encoded}`,
            { signal: AbortSignal.timeout(5000) },
          );
          if (!res.ok) continue;

          const chainData = await res.json() as {
            data?: {
              id: number;
              status: string;
              acceptor?: string | null;
              acceptor_guess?: string | null;
              winner?: string | null;
              payout_amount?: string | null;
              commission_paid?: string | null;
            };
          };

          const chainBet = chainData.data;
          if (!chainBet) continue;

          // Check if DB status matches chain status
          if (bet.status === chainBet.status) {
            // Status matches — but still check if acceptor is missing in DB
            if (chainBet.status === 'accepted' && !bet.acceptorUserId && chainBet.acceptor) {
              const userRow = await this.db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.address, chainBet.acceptor))
                .limit(1);
              if (userRow.length > 0) {
                await this.db
                  .update(bets)
                  .set({
                    acceptorUserId: userRow[0]!.id,
                    acceptorGuess: chainBet.acceptor_guess ?? undefined,
                  })
                  .where(eq(bets.betId, bet.betId));
                synced++;
                logger.info({ betId: bet.betId.toString(), acceptor: chainBet.acceptor }, 'Synced missing acceptor');
              }
            }
            continue;
          }

          // Status mismatch — sync from chain
          // Map chain status to DB status (chain uses "timeoutclaimed", DB uses "timeout_claimed")
          const mappedStatus = chainBet.status === 'timeoutclaimed' ? 'timeout_claimed' : chainBet.status;
          const updateData: Record<string, unknown> = {
            status: mappedStatus,
            resolvedTime: new Date(),
          };

          // Resolve acceptor
          if (chainBet.acceptor && !bet.acceptorUserId) {
            const userRow = await this.db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.address, chainBet.acceptor))
              .limit(1);
            if (userRow.length > 0) {
              updateData.acceptorUserId = userRow[0]!.id;
            }
            if (chainBet.acceptor_guess) {
              updateData.acceptorGuess = chainBet.acceptor_guess;
            }
          }

          // Resolve winner
          if (chainBet.winner) {
            const winnerRow = await this.db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.address, chainBet.winner))
              .limit(1);
            if (winnerRow.length > 0) {
              updateData.winnerUserId = winnerRow[0]!.id;
            }
          }

          if (chainBet.payout_amount) updateData.payoutAmount = chainBet.payout_amount;
          if (chainBet.commission_paid) updateData.commissionAmount = chainBet.commission_paid;

          await this.db
            .update(bets)
            .set(updateData)
            .where(eq(bets.betId, bet.betId));

          // If bet was resolved (revealed/timeout_claimed), distribute referral rewards
          if (mappedStatus === 'revealed' || mappedStatus === 'timeout_claimed') {
            await this.distributeReferralRewardsForBet(bet.betId);
          }

          synced++;
          logger.info(
            { betId: bet.betId.toString(), dbStatus: bet.status, chainStatus: chainBet.status },
            'Bet synced from chain',
          );
        } catch (err) {
          logger.warn({ err, betId: bet.betId.toString() }, 'Failed to sync single bet');
        }
      }

      logger.info({ total: pendingBets.length, synced }, 'Full bet sync complete');
    } catch (err) {
      logger.error({ err }, 'Failed to run full bet sync');
    }
  }

  /**
   * Distribute referral rewards for a resolved bet.
   * Looks up maker/acceptor from DB, then delegates to referralService.
   * Idempotent — referralService.distributeRewards checks for existing rewards.
   */
  private async distributeReferralRewardsForBet(betId: bigint): Promise<void> {
    if (!this.db) return;

    try {
      const { bets } = await import('@coinflip/db/schema');
      const { eq } = await import('drizzle-orm');

      const [bet] = await this.db
        .select({
          amount: bets.amount,
          makerUserId: bets.makerUserId,
          acceptorUserId: bets.acceptorUserId,
        })
        .from(bets)
        .where(eq(bets.betId, betId))
        .limit(1);

      if (!bet || !bet.acceptorUserId) return;

      const totalPot = BigInt(bet.amount) * 2n;
      await referralService.distributeRewards(betId, totalPot, bet.makerUserId, bet.acceptorUserId);
    } catch (err) {
      logger.warn({ err, betId: betId.toString() }, 'Indexer: referral reward distribution failed');
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
