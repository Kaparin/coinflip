/**
 * Background Tasks — Async bet creation & acceptance confirmation.
 *
 * These tasks run fire-and-forget after the API returns a fast 202 response.
 * They poll the chain for tx inclusion and update the DB + notify via WebSocket.
 */

import { sql } from 'drizzle-orm';
import { betService } from './bet.service.js';
import { vaultService } from './vault.service.js';
import { wsService } from './ws.service.js';
import { relayerService } from './relayer.js';
import { formatBetResponse } from '../lib/format.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { decrementPendingBetCount } from '../lib/pending-counts.js';
import { removePendingLock, invalidateBalanceCache } from '../routes/vault.js';
import { referralService } from './referral.service.js';
import { chainCached } from '../lib/chain-cache.js';
import { pendingSecretsService } from './pending-secrets.service.js';
import { CHAIN_OPEN_BETS_LIMIT } from '@coinflip/shared/constants';

// ─── Helpers ────────────────────────────────────────────────────

interface TxPollResult {
  found: boolean;
  code: number;
  rawLog: string;
  height: number;
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
}

/** Poll chain REST API for tx inclusion by hash. Returns result or null.
 *  Uses progressive intervals: starts fast (500ms) and backs off to cap. */
async function pollForTx(
  txHash: string,
  maxMs = 25_000,
  startIntervalMs = 500,
): Promise<TxPollResult | null> {
  const start = Date.now();
  let interval = startIntervalMs;
  const MAX_INTERVAL = 2_000;
  let first = true;

  while (Date.now() - start < maxMs) {
    if (!first) {
      await new Promise(r => setTimeout(r, interval));
      interval = Math.min(interval * 1.5, MAX_INTERVAL);
    }
    first = false;

    try {
      const res = await fetch(`${env.AXIOME_REST_URL}/cosmos/tx/v1beta1/txs/${txHash}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json() as {
          tx_response?: {
            code: number;
            raw_log?: string;
            height?: string;
            events?: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
          };
        };
        if (data.tx_response) {
          return {
            found: true,
            code: data.tx_response.code,
            rawLog: data.tx_response.raw_log ?? '',
            height: Number(data.tx_response.height ?? 0),
            events: data.tx_response.events ?? [],
          };
        }
      }
    } catch {
      // Not indexed yet — keep polling
    }
  }

  return null;
}

/** Extract a wasm event attribute from tx events */
function extractWasmAttr(
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>,
  key: string,
): string | undefined {
  for (const ev of events) {
    if (ev.type === 'wasm' || ev.type.startsWith('wasm-')) {
      for (const attr of ev.attributes) {
        if (attr.key === key) return attr.value;
      }
    }
  }
  return undefined;
}

// ─── Background Create Bet Resolution ───────────────────────────

export interface CreateBetTask {
  txHash: string;
  commitment: string;
  commitmentBase64: string;
  makerUserId: string;
  amount: string;
  address: string;
  makerSide: 'heads' | 'tails';
  makerSecret: string;
  pendingLockId?: string;
}

/**
 * Resolve chain bet_id for a newly created bet.
 * Runs in background after API returns 202.
 *
 * 1. Poll for tx inclusion (up to 35s)
 * 2. Extract bet_id from events
 * 3. Fallback: query open_bets by commitment
 * 4. Save bet to DB
 * 5. Notify via WS
 */
export function resolveCreateBetInBackground(task: CreateBetTask): void {
  (async () => {
    const { txHash, commitment, commitmentBase64, makerUserId, amount, address, makerSide, makerSecret, pendingLockId } = task;
    const tag = `bg:create_bet`;

    let chainBetId: string | undefined;

    try {
      // Step 1: Poll for tx result
      const txResult = await pollForTx(txHash);

      if (txResult && txResult.code !== 0) {
        // Transaction failed on chain (contract error)
        logger.error({ txHash, code: txResult.code, rawLog: txResult.rawLog }, `${tag} — tx failed on chain`);
        if (pendingLockId) removePendingLock(address, pendingLockId);
        invalidateBalanceCache(address);
        decrementPendingBetCount(makerUserId);
        await vaultService.unlockFunds(makerUserId, amount).catch(err => logger.warn({ err, makerUserId }, `${tag} — unlockFunds failed`));
        wsService.emitBetCreateFailed(address, {
          txHash,
          reason: txResult.rawLog || 'Transaction failed on chain',
        });
        return;
      }

      // Step 2: Extract bet_id from events

      if (txResult) {
        chainBetId = extractWasmAttr(txResult.events, 'bet_id');
        if (chainBetId) {
          logger.info({ chainBetId, source: 'events', txHash }, `${tag} — resolved bet_id`);
        }
      }

      // Step 3: Fallback — query open_bets by commitment
      if (!chainBetId) {
        const maxRetries = 5;
        const retryDelays = [500, 1_000, 1_500, 2_000, 3_000];

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          if (attempt > 0) {
            await new Promise(r => setTimeout(r, retryDelays[attempt] ?? 2_000));
          }
          try {
            const query = JSON.stringify({ open_bets: { limit: CHAIN_OPEN_BETS_LIMIT } });
            const encoded = Buffer.from(query).toString('base64');
            const res = await fetch(
              `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${encoded}`,
              { signal: AbortSignal.timeout(5000) },
            );
            if (res.ok) {
              const data = await res.json() as {
                data: { bets: Array<{ id: number; commitment: string }> };
              };
              const match = data.data.bets.find(b => b.commitment === commitmentBase64);
              if (match) {
                chainBetId = String(match.id);
                logger.info({ chainBetId, source: 'open_bets', attempt, txHash }, `${tag} — resolved bet_id`);
                break;
              }
            }
          } catch (err) {
            logger.warn({ err, attempt }, `${tag} — open_bets query failed`);
          }
        }
      }

      if (!chainBetId) {
        // Could not resolve bet_id, but the tx WAS broadcast successfully.
        // The bet very likely exists on chain — DO NOT unlock funds.
        // The reconciliation sweep (reconcileOrphanedChainBets) will find it
        // within 2 minutes and import it into the DB automatically.
        logger.warn({ txHash, commitment }, `${tag} — failed to resolve bet_id after all retries. Funds stay locked; reconciliation sweep will handle.`);
        decrementPendingBetCount(makerUserId);
        if (pendingLockId) removePendingLock(address, pendingLockId);
        // DON'T unlock — the bet is almost certainly on chain.
        // DON'T emit betCreateFailed — it would confuse the user.
        // The bet will appear once the reconciliation sweep imports it.
        return;
      }

      // Step 4: Save bet to DB (with secret for auto-reveal)
      const betId = BigInt(chainBetId);
      const bet = await betService.createBet({
        betId,
        makerUserId,
        amount,
        commitment,
        txhashCreate: txHash,
        makerSide,
        makerSecret,
      });

      // Bet is now in DB with secret — clean up pending_bet_secrets
      await pendingSecretsService.delete(commitment).catch(() => {});

      // Decrement pending counter, clear pending lock
      decrementPendingBetCount(makerUserId);
      if (pendingLockId) removePendingLock(address, pendingLockId);
      invalidateBalanceCache(address);

      logger.info({ betId: chainBetId, txHash }, `${tag} — bet saved to DB`);

      // Step 5: Notify all clients
      const addressMap = await betService.buildAddressMap([bet]);
      wsService.emitBetConfirmed(formatBetResponse(bet, addressMap) as unknown as Record<string, unknown>);
    } catch (err) {
      logger.error({ err, txHash }, `${tag} — unexpected error`);
      decrementPendingBetCount(makerUserId);
      if (pendingLockId) removePendingLock(address, pendingLockId);

      // Check if the bet already exists in DB (e.g. saved by indexer race)
      const existingBetInDb = chainBetId
        ? await betService.getBetById(BigInt(chainBetId)).catch(() => null)
        : null;

      if (existingBetInDb) {
        logger.info({ betId: chainBetId, txHash }, `${tag} — bet exists in DB despite error, skipping unlock`);
      } else if (txHash) {
        // Tx was broadcast — bet likely exists on chain even if we hit an error.
        // DON'T unlock. The reconciliation sweep will find and import it.
        logger.warn({ txHash }, `${tag} — error after broadcast, funds stay locked; reconciliation sweep will handle`);
      } else {
        // Tx was never broadcast — safe to unlock
        await vaultService.unlockFunds(makerUserId, amount).catch(unlockErr =>
          logger.warn({ err: unlockErr, makerUserId, amount }, `${tag} — unlockFunds failed`));
        wsService.emitBetCreateFailed(address, {
          txHash: txHash ?? '',
          reason: 'An unexpected error occurred. Please try again.',
        });
      }
      invalidateBalanceCache(address);
    }
  })();
}

// ─── Background Cancel Bet Confirmation ─────────────────────────

export interface CancelBetTask {
  betId: bigint;
  txHash: string;
  makerUserId: string;
  address: string;
  amount: string;
}

/**
 * Confirm cancel bet tx on chain.
 * Runs in background after API returns 202.
 *
 * 1. Poll for tx inclusion (up to 60s)
 * 2. If success: finalize cancel in DB, unlock funds, WS broadcast
 * 3. If failure: revert bet to "open", WS notify
 */
export function confirmCancelBetInBackground(task: CancelBetTask): void {
  (async () => {
    const { betId, txHash, makerUserId, address, amount } = task;
    const tag = `bg:cancel_bet`;

    try {
      const txResult = await pollForTx(txHash);

      if (!txResult) {
        // Timeout — schedule cleanup check
        logger.warn({ txHash, betId: betId.toString() }, `${tag} — poll timeout, scheduling cleanup`);
        setTimeout(async () => {
          try {
            const bet = await betService.getBetById(betId);
            if (bet && bet.status === 'canceling') {
              // Try syncing from chain
              const synced = await syncBetFromChain(betId);
              if (!synced) {
                // Revert to open
                await betService.updateBetStatus(betId, 'open');
                const reverted = await betService.getBetById(betId);
                if (reverted) {
                  const addressMap = await betService.buildAddressMap([reverted]);
                  wsService.emitBetReverted(formatBetResponse(reverted, addressMap) as unknown as Record<string, unknown>);
                }
              }
            }
          } catch (err) {
            logger.error({ err, betId: betId.toString() }, `${tag} — cleanup check failed`);
          }
        }, 30_000); // 30s safety timeout (was 2min)
        return;
      }

      if (txResult.code !== 0) {
        // Transaction failed on chain — revert to "open"
        logger.error({ txHash, betId: betId.toString(), code: txResult.code, rawLog: txResult.rawLog }, `${tag} — tx failed, reverting to open`);
        await betService.updateBetStatus(betId, 'open');
        const reverted = await betService.getBetById(betId);
        if (reverted) {
          const addressMap = await betService.buildAddressMap([reverted]);
          wsService.emitBetReverted(formatBetResponse(reverted, addressMap) as unknown as Record<string, unknown>);
        }
        return;
      }

      // Success — finalize cancel, refresh cache
      // NOTE: cancel does NOT add a pending lock, so we only invalidate the cache.
      // Do NOT call clearPendingLocks — it would remove locks from other in-flight bets!
      await vaultService.unlockFunds(makerUserId, amount).catch(err =>
        logger.warn({ err, makerUserId }, `${tag} — unlockFunds failed`));
      invalidateBalanceCache(address);
      const bet = await betService.cancelBet(betId, txHash);
      if (bet) {
        const addressMap = await betService.buildAddressMap([bet]);
        wsService.emitBetCanceled(formatBetResponse(bet, addressMap) as unknown as Record<string, unknown>);
      }
      logger.info({ betId: betId.toString(), txHash }, `${tag} — confirmed & finalized`);
    } catch (err) {
      logger.error({ err, txHash, betId: betId.toString() }, `${tag} — unexpected error`);
    }
  })();
}

// ─── Background Accept Bet Confirmation ─────────────────────────

export interface AcceptBetTask {
  betId: bigint;
  txHash: string;
  acceptorUserId: string;
  acceptorGuess: string;
  address: string;
  amount: string;
  pendingLockId?: string;
  /** Pre-loaded reveal info for pipelining — avoids an extra DB read. */
  revealInfo?: {
    makerAddress: string;
    makerSide: 'heads' | 'tails';
    makerSecret: string;
  };
}

/**
 * Confirm accept bet tx on chain.
 * Runs in background after API returns 202.
 *
 * Pipeline optimization: if revealInfo is provided, the reveal tx is broadcast
 * IMMEDIATELY in parallel with accept tx polling. Both txs land in the mempool
 * and are processed by the chain in nonce order (accept first, then reveal).
 * This saves one full block cycle (~5-6s) compared to waiting for accept confirmation.
 */
export function confirmAcceptBetInBackground(task: AcceptBetTask): void {
  (async () => {
    const { betId, txHash, acceptorUserId, acceptorGuess, address, amount, pendingLockId, revealInfo } = task;
    const tag = `bg:accept_bet`;

    // PIPELINE OPTIMIZATION: broadcast reveal tx immediately, in parallel with accept polling.
    // The chain processes txs in nonce order, so accept will execute before reveal.
    // This saves ~5-6s (one block cycle) in the happy path.
    let pipelinedRevealTxHash: string | undefined;
    if (revealInfo && relayerService.isReady()) {
      try {
        const revealResult = await relayerService.relayReveal(
          revealInfo.makerAddress,
          Number(betId),
          revealInfo.makerSide,
          revealInfo.makerSecret,
          /* asyncMode */ true,
        );
        if (revealResult.success && revealResult.txHash) {
          pipelinedRevealTxHash = revealResult.txHash;
          logger.info({ betId: betId.toString(), revealTxHash: revealResult.txHash }, `${tag} — reveal tx pipelined (broadcast before accept confirmed)`);
        }
      } catch (err) {
        logger.warn({ err, betId: betId.toString() }, `${tag} — pipelined reveal broadcast failed (will retry after accept)`);
      }
    }

    try {
      // Step 1: Poll for accept tx result
      const txResult = await pollForTx(txHash);

      if (!txResult) {
        // Timeout — tx might still be in mempool.
        logger.warn({ txHash, betId: betId.toString() }, `${tag} — poll timeout, indexer will handle`);

        setTimeout(async () => {
          try {
            const bet = await betService.getBetById(betId);
            if (bet && bet.status === 'accepting') {
              logger.warn({ betId: betId.toString() }, `${tag} — still "accepting" after cleanup timeout, reverting`);
              if (pendingLockId) removePendingLock(address, pendingLockId);
              const reverted = await betService.revertAccepting(betId).catch(err => { logger.warn({ err }, `${tag} — revertAccepting failed`); return null; });
              await vaultService.unlockFunds(acceptorUserId, amount).catch(err => logger.warn({ err, acceptorUserId }, `${tag} — unlockFunds failed`));
              invalidateBalanceCache(address);
              wsService.emitAcceptFailed(address, {
                betId: betId.toString(),
                txHash,
                reason: 'Accept confirmation timed out. Please try again.',
              });
              if (reverted) {
                const addressMap = await betService.buildAddressMap([reverted]);
                wsService.emitBetReverted(formatBetResponse(reverted, addressMap) as unknown as Record<string, unknown>);
              }
            }
          } catch (err) {
            logger.error({ err, betId: betId.toString() }, `${tag} — cleanup check failed`);
          }
        }, 45_000); // 45s safety timeout (was 3min)

        return;
      }

      if (txResult.code !== 0) {
        // Transaction failed on chain — revert to "open", clear acceptor
        logger.error({ txHash, betId: betId.toString(), code: txResult.code, rawLog: txResult.rawLog }, `${tag} — tx failed, reverting to open`);

        if (pendingLockId) removePendingLock(address, pendingLockId);
        const reverted = await betService.revertAccepting(betId).catch(err => { logger.warn({ err }, `${tag} — revertAccepting failed`); return null; });
        await vaultService.unlockFunds(acceptorUserId, amount).catch(err => logger.warn({ err, acceptorUserId }, `${tag} — unlockFunds failed`));
        invalidateBalanceCache(address);

        wsService.emitAcceptFailed(address, {
          betId: betId.toString(),
          txHash,
          reason: txResult.rawLog || 'Transaction failed on chain',
        });

        if (reverted) {
          const addressMap = await betService.buildAddressMap([reverted]);
          wsService.emitBetReverted(formatBetResponse(reverted, addressMap) as unknown as Record<string, unknown>);
        }
        return;
      }

      // Step 2: Success — update DB, clear pending lock (chain now reflects it)
      if (pendingLockId) removePendingLock(address, pendingLockId);
      invalidateBalanceCache(address);

      const bet = await betService.acceptBet({
        betId,
        acceptorUserId,
        acceptorGuess,
        txhashAccept: txHash,
      });

      if (bet) {
        logger.info({ betId: betId.toString(), txHash }, `${tag} — confirmed, DB updated`);
        const addressMap = await betService.buildAddressMap([bet]);
        wsService.emitBetAccepted(formatBetResponse(bet, addressMap) as unknown as Record<string, unknown>);

        if (pipelinedRevealTxHash) {
          // Reveal was already broadcast — just poll for its confirmation
          logger.info({ betId: betId.toString(), revealTxHash: pipelinedRevealTxHash }, `${tag} — using pipelined reveal tx`);
          pollRevealAndSync(betId, pipelinedRevealTxHash);
        } else {
          // Reveal wasn't pipelined — do it now
          autoRevealBet(betId, /* skipChainCheck */ true).catch(err => {
            logger.error({ err, betId: betId.toString() }, `${tag} — auto-reveal failed (will retry via background job)`);
          });
        }
      }
    } catch (err) {
      logger.error({ err, txHash, betId: betId.toString() }, `${tag} — unexpected error, reverting accept and unlocking funds`);
      if (pendingLockId) removePendingLock(address, pendingLockId);
      // Revert bet to "open" and unlock acceptor funds
      await betService.revertAccepting(betId).catch(revertErr =>
        logger.warn({ err: revertErr, betId: betId.toString() }, `${tag} — revertAccepting failed`));
      await vaultService.unlockFunds(acceptorUserId, amount).catch(unlockErr =>
        logger.warn({ err: unlockErr, acceptorUserId, amount }, `${tag} — unlockFunds failed`));
      invalidateBalanceCache(address);
      wsService.emitAcceptFailed(address, {
        betId: betId.toString(),
        txHash,
        reason: 'An unexpected error occurred. Please try again.',
      });
    }
  })();
}

// ─── Chain State Helper ──────────────────────────────────────────

interface ChainBetState {
  id: number;
  status: string;
  winner: string | null;
  payout_amount: string | null;
  commission_paid: string | null;
  reveal_side: string | null;
  acceptor: string | null;
}

/** Query the on-chain state of a bet */
async function getChainBetState(betId: number): Promise<ChainBetState | null> {
  return chainCached(
    'bet:' + betId,
    async () => {
      try {
        const query = JSON.stringify({ bet: { bet_id: betId } });
        const encoded = Buffer.from(query).toString('base64');
        const res = await fetch(
          `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${encoded}`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (!res.ok) return null;
        const data = await res.json() as { data: ChainBetState };
        return data.data;
      } catch {
        return null;
      }
    },
    3_000,
  );
}

/** Processing lock — prevents concurrent operations on the same bet */
const processingBets = new Set<string>();

/** Resolve a userId from an on-chain address */
async function resolveUserId(address: string): Promise<string | null> {
  try {
    const db = (await import('../lib/db.js')).getDb();
    const { users } = await import('@coinflip/db/schema');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.address, address)).limit(1);
    return row?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Sync a bet's DB state from chain state.
 * If chain says revealed/timeout_claimed/canceled but DB disagrees, fix DB.
 * Returns true if the bet was synced (i.e. already resolved on chain).
 */
async function syncBetFromChain(betId: bigint): Promise<boolean> {
  const tag = 'chain-sync';
  const chainState = await getChainBetState(Number(betId));
  if (!chainState) {
    logger.debug({ betId: betId.toString() }, `${tag} — chain query returned null`);
    return false;
  }

  const chainStatus = chainState.status.toLowerCase();
  logger.debug({ betId: betId.toString(), chainStatus }, `${tag} — chain status`);

  // Chain uses "timeoutclaimed" (no underscore), DB uses "timeout_claimed"
  const isResolved = chainStatus === 'revealed'
    || chainStatus === 'timeout_claimed' || chainStatus === 'timeoutclaimed'
    || chainStatus === 'canceled';

  if (isResolved) {
    // Get current bet from DB to know amounts and participants
    const currentBet = await betService.getBetById(betId);

    // Bet is already resolved on chain — sync DB
    const winnerUserId = chainState.winner ? await resolveUserId(chainState.winner) : null;

    const dbStatus = (chainStatus === 'timeout_claimed' || chainStatus === 'timeoutclaimed') ? 'timeout_claimed'
      : chainStatus === 'canceled' ? 'canceled'
      : 'revealed';

    let dbUpdated = false;

    if (dbStatus === 'canceled') {
      const canceled = await betService.cancelBet(betId);
      dbUpdated = !!canceled;
      if (!canceled) {
        logger.warn({ betId: betId.toString() }, `${tag} — cancelBet returned null (already resolved)`);
      }
    } else {
      if (!winnerUserId && chainState.winner) {
        logger.error({ betId: betId.toString(), winnerAddress: chainState.winner }, 'syncBetFromChain: winner not found in DB — deferring');
        return false;
      }

      const resolved = await betService.resolveBet({
        betId,
        winnerUserId: winnerUserId ?? '',
        commissionAmount: chainState.commission_paid ?? '0',
        payoutAmount: chainState.payout_amount ?? '0',
        txhashResolve: '',
        status: dbStatus as 'revealed' | 'timeout_claimed',
      });
      dbUpdated = !!resolved;
      if (!resolved) {
        logger.warn({ betId: betId.toString(), dbStatus }, `${tag} — resolveBet returned null (already resolved)`);
      }

      if (resolved && currentBet && currentBet.acceptorUserId) {
        const totalPot = BigInt(currentBet.amount) * 2n;
        referralService.distributeRewards(betId, totalPot, currentBet.makerUserId, currentBet.acceptorUserId)
          .catch(err => logger.warn({ err, betId: betId.toString() }, `${tag} — referral reward distribution failed`));
      }
    }

    // Only unlock vault funds if we actually transitioned the bet status
    if (dbUpdated && currentBet && (currentBet.status === 'open' || currentBet.status === 'accepting' || currentBet.status === 'accepted')) {
      try {
        if (dbStatus === 'canceled') {
          await vaultService.unlockFunds(currentBet.makerUserId, currentBet.amount);
          if (currentBet.acceptorUserId) {
            await vaultService.unlockFunds(currentBet.acceptorUserId, currentBet.amount);
          }
        }
      } catch (err) {
        logger.warn({ err, betId: betId.toString() }, `${tag} — vault unlock failed (non-critical)`);
      }
    }

    logger.info(
      { betId: betId.toString(), chainStatus, winner: chainState.winner },
      `${tag} — DB synced from chain`,
    );

    // Broadcast update via WS
    const updatedBet = await betService.getBetById(betId);
    if (updatedBet) {
      const addressMap = await betService.buildAddressMap([updatedBet]);
      const formatted = formatBetResponse(updatedBet, addressMap) as unknown as Record<string, unknown>;
      if (dbStatus === 'revealed') {
        wsService.emitBetRevealed(formatted);
      } else {
        wsService.emitBetAccepted(formatted); // generic update for timeout/cancel
      }
    }

    return true;
  }

  return false;
}

// ─── Auto-Reveal ─────────────────────────────────────────────────

/**
 * Automatically reveal a bet using the stored secret.
 * Called immediately after accept confirmation, and by the background sweep.
 *
 * ASYNC MODE: broadcasts reveal tx and returns immediately.
 * A delayed sync check picks up the result ~8s later.
 * The background sweep catches anything that falls through.
 */
export async function autoRevealBet(betId: bigint, skipChainCheck = false): Promise<boolean> {
  const tag = 'auto-reveal';
  const betKey = betId.toString();

  if (processingBets.has(betKey)) {
    logger.debug({ betId: betKey }, `${tag} — already processing, skipping`);
    return false;
  }

  processingBets.add(betKey);
  try {
    return await _autoRevealBetInner(betId, skipChainCheck);
  } finally {
    processingBets.delete(betKey);
  }
}

async function _autoRevealBetInner(betId: bigint, skipChainCheck: boolean): Promise<boolean> {
  const tag = 'auto-reveal';
  const bet = await betService.getBetById(betId);

  if (!bet) {
    logger.warn({ betId: betId.toString() }, `${tag} — bet not found`);
    return false;
  }

  if (bet.status !== 'accepted') {
    logger.debug({ betId: betId.toString(), status: bet.status }, `${tag} — not accepted, skipping`);
    return false;
  }

  // Step 0: Check chain state first — maybe already resolved.
  // Skip when called right after accept confirmation (we know it just got accepted).
  if (!skipChainCheck) {
    const alreadySynced = await syncBetFromChain(betId);
    if (alreadySynced) return true;
  }

  if (!bet.makerSecret || !bet.makerSide) {
    logger.debug({ betId: betId.toString() }, `${tag} — no secret stored, skipping`);
    return false;
  }

  if (!relayerService.isReady()) {
    logger.warn({ betId: betId.toString() }, `${tag} — relayer not ready`);
    return false;
  }

  const makerAddress = await betService.getUserAddress(bet.makerUserId);
  if (!makerAddress) {
    logger.warn({ betId: betId.toString() }, `${tag} — maker address not found`);
    return false;
  }

  logger.info({ betId: betId.toString(), makerSide: bet.makerSide }, `${tag} — submitting reveal (async)`);

  // ASYNC broadcast — returns in ~1-2s instead of blocking for 25-45s
  const relayResult = await relayerService.relayReveal(
    makerAddress,
    Number(betId),
    bet.makerSide as 'heads' | 'tails',
    bet.makerSecret,
    /* asyncMode */ true,
  );

  if (!relayResult.success) {
    if (relayResult.rawLog?.includes('Revealed') || relayResult.rawLog?.includes('already')) {
      const synced = await syncBetFromChain(betId);
      if (synced) return true;
    }
    logger.error({ betId: betId.toString(), error: relayResult.rawLog }, `${tag} — relay failed`);
    return false;
  }

  logger.info({ betId: betId.toString(), txHash: relayResult.txHash }, `${tag} — reveal broadcast OK`);

  // Poll for reveal tx confirmation (non-blocking) and sync immediately when found
  pollRevealAndSync(betId, relayResult.txHash ?? '');

  return true;
}

/**
 * Poll for reveal tx inclusion, then sync bet from chain immediately.
 * Replaces the old scheduleDelayedSync which waited 8/15/30 seconds.
 */
function pollRevealAndSync(betId: bigint, txHash: string): void {
  const tag = 'reveal-poll';

  // Fire-and-forget — don't block the caller
  (async () => {
    try {
      // Poll aggressively — reveal result is what the user is waiting for
      const result = txHash ? await pollForTx(txHash, 30_000, 400) : null;

      if (result) {
        logger.info({ betId: betId.toString(), txHash, code: result.code }, `${tag} — reveal tx confirmed`);
      } else {
        logger.warn({ betId: betId.toString(), txHash }, `${tag} — reveal tx not found in time, syncing from chain state`);
      }

      // Sync bet state from chain regardless (tx may have landed even if poll missed it)
      const synced = await syncBetFromChain(betId);
      if (synced) {
        logger.info({ betId: betId.toString() }, `${tag} — bet synced from chain`);
        return;
      }

      // If not synced yet, wait one more block and try once more
      await new Promise(r => setTimeout(r, 3_000));
      const synced2 = await syncBetFromChain(betId);
      if (synced2) {
        logger.info({ betId: betId.toString() }, `${tag} — bet synced on retry`);
      } else {
        logger.warn({ betId: betId.toString() }, `${tag} — not synced after poll, sweep will handle`);
      }
    } catch (err) {
      logger.error({ err, betId: betId.toString() }, `${tag} — error`);
    }
  })();
}

// ─── Auto-Claim Timeout ─────────────────────────────────────────

/**
 * Sweep for timed-out accepted bets and auto-claim on behalf of the acceptor.
 *
 * Flow:
 * 1. Check chain state — if already resolved, just sync DB
 * 2. Submit claim_timeout relay
 * 3. Poll for tx inclusion
 * 4. Update DB
 */
export async function autoClaimTimeoutBets(): Promise<void> {
  const tag = 'auto-claim-timeout';

  try {
    const timedOutBets = await betService.getTimedOutAcceptedBets();

    if (timedOutBets.length === 0) return;

    logger.info({ count: timedOutBets.length }, `${tag} — found timed-out bets`);

    for (const bet of timedOutBets) {
      const betKey = bet.betId.toString();

      if (processingBets.has(betKey)) {
        logger.debug({ betId: betKey }, `${tag} — already processing, skipping`);
        continue;
      }

      processingBets.add(betKey);
      try {
        // Step 0: Check chain state first
        const alreadySynced = await syncBetFromChain(bet.betId);
        if (alreadySynced) continue;

        if (!relayerService.isReady()) {
          logger.warn({}, `${tag} — relayer not ready, stopping`);
          break;
        }

        // Resolve acceptor address
        const acceptorAddress = bet.acceptorUserId
          ? await betService.getUserAddress(bet.acceptorUserId)
          : null;

        if (!acceptorAddress) {
          logger.warn({ betId: betKey }, `${tag} — acceptor address not found`);
          continue;
        }

        logger.info({ betId: betKey }, `${tag} — claiming timeout (async)`);

        const relayResult = await relayerService.relayClaimTimeout(
          acceptorAddress,
          Number(bet.betId),
          /* asyncMode */ true,
        );

        if (!relayResult.success) {
          const synced = await syncBetFromChain(bet.betId);
          if (synced) continue;
          logger.error({ betId: betKey, error: relayResult.rawLog }, `${tag} — relay failed`);
          continue;
        }

        logger.info({ betId: betKey, txHash: relayResult.txHash }, `${tag} — timeout tx broadcast OK`);

        // Poll for tx confirmation and sync
        pollRevealAndSync(bet.betId, relayResult.txHash ?? '');
      } catch (err) {
        logger.error({ err, betId: betKey }, `${tag} — error processing bet`);
      } finally {
        processingBets.delete(betKey);
      }
    }
  } catch (err) {
    logger.error({ err }, `${tag} — sweep failed`);
  }
}

// ─── Auto-Cancel Expired Open Bets ──────────────────────────────

/**
 * Cancel open bets that have exceeded the 3-hour TTL.
 * Submits cancel_bet via relayer and unlocks maker funds.
 */
async function autoCancelExpiredBets(): Promise<void> {
  const tag = 'auto-cancel-expired';

  try {
    const expiredBets = await betService.getExpiredOpenBets();

    if (expiredBets.length === 0) return;

    logger.info({ count: expiredBets.length }, `${tag} — found expired open bets`);

    for (const bet of expiredBets) {
      const betKey = bet.betId.toString();

      if (processingBets.has(betKey)) continue;

      processingBets.add(betKey);
      try {
        // First check chain — might already be canceled/accepted
        const alreadySynced = await syncBetFromChain(bet.betId);
        if (alreadySynced) continue;

        if (!relayerService.isReady()) {
          logger.warn({}, `${tag} — relayer not ready, stopping`);
          break;
        }

        // Resolve maker address for relay
        const makerAddress = await betService.getUserAddress(bet.makerUserId);
        if (!makerAddress) {
          logger.warn({ betId: betKey }, `${tag} — maker address not found`);
          continue;
        }

        logger.info({ betId: betKey, age: `${Math.round((Date.now() - bet.createdTime.getTime()) / 3600000)}h` }, `${tag} — canceling expired bet`);

        // Mark as canceling first
        await betService.markCanceling(bet.betId).catch(() => null);

        // Broadcast cancel_bet via relayer (async)
        const relayResult = await relayerService.relayCancelBet(
          makerAddress,
          Number(bet.betId),
          /* asyncMode */ true,
        );

        if (!relayResult.success) {
          // Check if already resolved on chain
          const synced = await syncBetFromChain(bet.betId);
          if (synced) continue;

          // Revert to open if relay failed
          await betService.updateBetStatus(bet.betId, 'open');
          logger.error({ betId: betKey, error: relayResult.rawLog }, `${tag} — relay failed`);
          continue;
        }

        // Unlock funds and finalize cancel after short delay
        const cancelBetId = bet.betId;
        const cancelUserId = bet.makerUserId;
        const cancelAmount = bet.amount;
        const cancelTxHash = relayResult.txHash;

        setTimeout(async () => {
          try {
            const txResult = await pollForTx(cancelTxHash!, 30_000, 3_000);
            if (txResult && txResult.code === 0) {
              const canceled = await betService.cancelBet(cancelBetId, cancelTxHash!);
              if (canceled) {
                await vaultService.unlockFunds(cancelUserId, cancelAmount).catch(err =>
                  logger.warn({ err }, `${tag} — unlockFunds failed`));
              }
              logger.info({ betId: cancelBetId.toString(), canceled: !!canceled }, `${tag} — expired bet cancel processed`);

              // Notify via WS
              const updated = await betService.getBetById(cancelBetId);
              if (updated) {
                const addressMap = await betService.buildAddressMap([updated]);
                wsService.emitBetCanceled(formatBetResponse(updated, addressMap) as unknown as Record<string, unknown>);
              }
            } else {
              // Sync from chain
              await syncBetFromChain(cancelBetId);
            }
          } catch (err) {
            logger.error({ err, betId: cancelBetId.toString() }, `${tag} — delayed cancel confirm failed`);
          }
        }, 10_000);

        logger.info({ betId: betKey, txHash: relayResult.txHash }, `${tag} — cancel tx broadcast OK`);
      } catch (err) {
        logger.error({ err, betId: betKey }, `${tag} — error processing bet`);
      } finally {
        processingBets.delete(betKey);
      }
    }
  } catch (err) {
    logger.error({ err }, `${tag} — sweep failed`);
  }
}

// ─── Cancel Orphaned Chain Bets ─────────────────────────────────

/**
 * Find open bets on chain that are NOT in our DB and import them.
 * These are "orphaned" bets — created on chain but the background
 * task that saves them to DB failed (common with batch operations).
 *
 * Instead of silently canceling them, we import them into the DB so they
 * appear in the UI. The user can then cancel them manually.
 * Note: imported bets lack maker_secret/maker_side, so auto-reveal won't work.
 */
async function reconcileOrphanedChainBets(): Promise<void> {
  const tag = 'orphan-reconcile';

  try {
    // Query chain for all open bets
    const query = JSON.stringify({ open_bets: { limit: CHAIN_OPEN_BETS_LIMIT } });
    const encoded = Buffer.from(query).toString('base64');
    const res = await fetch(
      `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${encoded}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return;

    const data = await res.json() as {
      data: { bets: Array<{ id: number; maker: string; amount: string; commitment: string; created_at_time: number }> };
    };
    const chainBets = data.data.bets;
    if (!chainBets || chainBets.length === 0) return;

    for (const chainBet of chainBets) {
      const betId = BigInt(chainBet.id);
      const betKey = betId.toString();

      if (processingBets.has(betKey)) continue;

      // Grace period: skip bets created less than 2 minutes ago
      // (background task may still be saving them to DB)
      if (chainBet.created_at_time) {
        const createdAtMs = chainBet.created_at_time > 1e12 ? chainBet.created_at_time : chainBet.created_at_time * 1000;
        const ageMs = Date.now() - createdAtMs;
        if (ageMs < 2 * 60 * 1000) continue;
      }

      const dbBet = await betService.getBetById(betId);
      if (dbBet) continue;

      // Orphaned bet — import into DB so it's visible to the user
      processingBets.add(betKey);
      try {
        // Resolve maker address → user_id
        const userId = await resolveUserId(chainBet.maker);
        if (!userId) {
          logger.warn({ betId: betKey, maker: chainBet.maker }, `${tag} — maker not in users table, skipping`);
          continue;
        }

        // Recover secrets from pending_bet_secrets table (saved before broadcast)
        const pendingSecret = await pendingSecretsService.getByCommitment(chainBet.commitment);

        await betService.createBet({
          betId,
          makerUserId: userId,
          amount: chainBet.amount,
          commitment: chainBet.commitment,
          txhashCreate: pendingSecret?.txHash ?? `chain_reconcile_${betKey}`,
          makerSide: pendingSecret?.makerSide as 'heads' | 'tails' | undefined,
          makerSecret: pendingSecret?.makerSecret,
        });

        // Secret is now in `bets` — clean up pending table
        if (pendingSecret) {
          await pendingSecretsService.delete(chainBet.commitment).catch(() => {});
        }

        invalidateBalanceCache(chainBet.maker);

        // Notify via WS so the bet appears in the UI
        const bet = await betService.getBetById(betId);
        if (bet) {
          const addressMap = await betService.buildAddressMap([bet]);
          wsService.emitBetConfirmed(formatBetResponse(bet, addressMap) as unknown as Record<string, unknown>);
        }

        logger.info({
          betId: betKey,
          maker: chainBet.maker,
          amount: chainBet.amount,
          secretRecovered: !!pendingSecret,
        }, `${tag} — orphaned bet imported to DB${pendingSecret ? ' (with secret — auto-reveal will work)' : ' (NO secret — manual cancel only)'}`);
      } catch (err) {
        logger.error({ err, betId: betKey }, `${tag} — error importing orphaned bet`);
      } finally {
        processingBets.delete(betKey);
      }
    }
  } catch (err) {
    logger.error({ err }, `${tag} — sweep failed`);
  }
}

// ─── Recovery: Stuck Transitional Bets ──────────────────────────

async function recoverStuckTransitionalBets(): Promise<void> {
  const tag = 'recover-stuck';
  try {
    const stuck = await betService.getStuckTransitionalBets();
    if (stuck.length === 0) return;

    logger.info({ count: stuck.length }, `${tag} — found stuck transitional bets`);

    for (const bet of stuck) {
      const betKey = bet.betId.toString();
      if (processingBets.has(betKey)) continue;
      processingBets.add(betKey);

      try {
        // Check chain state first — the tx might have succeeded
        const synced = await syncBetFromChain(bet.betId);
        if (synced) {
          logger.info({ betId: betKey, status: bet.status }, `${tag} — synced from chain`);
          continue;
        }

        // Not resolved on chain — revert to previous safe state
        if (bet.status === 'accepting') {
          const reverted = await betService.revertAccepting(bet.betId);
          if (reverted) {
            if (bet.acceptorUserId) {
              await vaultService.unlockFunds(bet.acceptorUserId, bet.amount).catch(() => {});
            }
            const addressMap = await betService.buildAddressMap([reverted]);
            wsService.emitBetReverted(formatBetResponse(reverted, addressMap) as unknown as Record<string, unknown>);
            logger.info({ betId: betKey }, `${tag} — reverted accepting → open`);
          }
        } else if (bet.status === 'canceling') {
          const canceled = await betService.cancelBet(bet.betId);
          if (canceled) {
            await vaultService.unlockFunds(bet.makerUserId, bet.amount).catch(() => {});
            logger.info({ betId: betKey }, `${tag} — finalized canceling → canceled + unlocked`);
          }
        }
      } catch (err) {
        logger.error({ err, betId: betKey }, `${tag} — error`);
      } finally {
        processingBets.delete(betKey);
      }
    }
  } catch (err) {
    logger.error({ err }, `${tag} — sweep failed`);
  }
}

// ─── Recovery: Stuck Locked Funds ───────────────────────────────

async function recoverStuckLockedFunds(): Promise<void> {
  const tag = 'recover-locked';
  try {
    const db = (await import('../lib/db.js')).getDb();

    // Find users with locked > 0 but no active bets
    const stuck = await db.execute(sql`
      SELECT vb.user_id, vb.locked
      FROM vault_balances vb
      WHERE vb.locked::numeric > 0
        AND NOT EXISTS (
          SELECT 1 FROM bets b
          WHERE (b.maker_user_id = vb.user_id OR b.acceptor_user_id = vb.user_id)
            AND b.status IN ('open', 'accepted', 'accepting', 'canceling')
        )
    `);

    const rows = stuck as unknown as Array<{ user_id: string; locked: string }>;
    if (rows.length === 0) return;

    logger.info({ count: rows.length }, `${tag} — found users with stuck locked funds`);

    for (const row of rows) {
      try {
        await vaultService.unlockFunds(row.user_id, row.locked);
        logger.info({ userId: row.user_id, amount: row.locked }, `${tag} — unlocked stuck funds`);
      } catch (err) {
        logger.warn({ err, userId: row.user_id }, `${tag} — unlock failed`);
      }
    }
  } catch (err) {
    logger.error({ err }, `${tag} — sweep failed`);
  }
}

// ─── Background Sweep Job ────────────────────────────────────────

let sweepInterval: ReturnType<typeof setInterval> | null = null;
let sweepRunning = false;

/**
 * Start the background sweep that:
 * 1. Auto-reveals any accepted bets with stored secrets
 * 2. Auto-claims timed-out bets
 * 3. Auto-cancels expired open bets (12h TTL)
 * Runs every 30 seconds (serialized — skips if previous run is still going).
 */
export function startBackgroundSweep(): void {
  if (sweepInterval) return;

  const SWEEP_INTERVAL_MS = 15_000; // 15s (was 30s) — faster recovery for failed reveals

  sweepInterval = setInterval(async () => {
    if (sweepRunning) {
      logger.debug({}, 'Background sweep: previous run still active, skipping');
      return;
    }

    sweepRunning = true;
    try {
      // 1. Find accepted bets that need auto-reveal — process in parallel batches
      const unrevealed = await betService.getAcceptedBetsWithSecrets();
      if (unrevealed.length > 0) {
        logger.info({ count: unrevealed.length }, 'sweep: processing unrevealed bets in parallel');
        const BATCH_SIZE = 10;
        for (let i = 0; i < unrevealed.length; i += BATCH_SIZE) {
          const batch = unrevealed.slice(i, i + BATCH_SIZE);
          await Promise.allSettled(
            batch.map(bet =>
              autoRevealBet(bet.betId).catch(err => {
                logger.error({ err, betId: bet.betId.toString() }, 'sweep:auto-reveal failed');
              })
            ),
          );
        }
      }

      // 2-6: Run independent sweep phases in parallel for faster recovery
      await Promise.allSettled([
        autoClaimTimeoutBets(),
        autoCancelExpiredBets(),
        recoverStuckTransitionalBets(),
        recoverStuckLockedFunds(),
        reconcileOrphanedChainBets(),
      ]);

      // 7. Garbage-collect stale pending_bet_secrets (older than 1 hour)
      await pendingSecretsService.cleanup().catch(err =>
        logger.warn({ err }, 'sweep: pending secrets cleanup failed'));

      // 8. Cleanup expired sessions
      try {
        const db = (await import('../lib/db.js')).getDb();
        const { sessions } = await import('@coinflip/db/schema');
        const { lt } = await import('drizzle-orm');
        await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
      } catch (err) {
        logger.warn({ err }, 'sweep: session cleanup failed');
      }
    } catch (err) {
      logger.error({ err }, 'Background sweep error');
    } finally {
      sweepRunning = false;
    }
  }, SWEEP_INTERVAL_MS);

  logger.info({ intervalMs: SWEEP_INTERVAL_MS }, 'Background sweep started');
}

export function stopBackgroundSweep(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
}
