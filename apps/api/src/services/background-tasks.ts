/**
 * Background Tasks — Async bet creation & acceptance confirmation.
 *
 * These tasks run fire-and-forget after the API returns a fast 202 response.
 * They poll the chain for tx inclusion and update the DB + notify via WebSocket.
 */

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

// ─── Helpers ────────────────────────────────────────────────────

interface TxPollResult {
  found: boolean;
  code: number;
  rawLog: string;
  height: number;
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
}

/** Poll chain REST API for tx inclusion by hash. Returns result or null. */
async function pollForTx(
  txHash: string,
  maxMs = 60_000,
  intervalMs = 3_000,
): Promise<TxPollResult | null> {
  const start = Date.now();

  while (Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const res = await fetch(`${env.AXIOME_REST_URL}/cosmos/tx/v1beta1/txs/${txHash}`);
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
      let chainBetId: string | undefined;

      if (txResult) {
        chainBetId = extractWasmAttr(txResult.events, 'bet_id');
        if (chainBetId) {
          logger.info({ chainBetId, source: 'events', txHash }, `${tag} — resolved bet_id`);
        }
      }

      // Step 3: Fallback — query open_bets by commitment
      if (!chainBetId) {
        const maxRetries = 5;
        const retryDelay = 5_000;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          if (attempt > 0) {
            await new Promise(r => setTimeout(r, retryDelay));
          }
          try {
            const query = JSON.stringify({ open_bets: { limit: 100 } });
            const encoded = Buffer.from(query).toString('base64');
            const res = await fetch(
              `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${encoded}`,
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
        // Could not resolve — very rare. Funds stay locked, indexer will eventually catch up.
        logger.error({ txHash, commitment }, `${tag} — failed to resolve bet_id after all retries`);
        decrementPendingBetCount(makerUserId);
        if (pendingLockId) removePendingLock(address, pendingLockId);
        invalidateBalanceCache(address);
        wsService.emitBetCreateFailed(address, {
          txHash,
          reason: 'Bet was submitted but confirmation is taking longer than expected. It will appear shortly.',
        });
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

      // Bet is now in DB — decrement pending counter, clear pending lock
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
      invalidateBalanceCache(address);
      // Notify user of failure
      wsService.emitBetCreateFailed(address, {
        txHash,
        reason: 'An unexpected error occurred. Your bet may still appear shortly.',
      });
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
        }, 2 * 60 * 1000);
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
}

/**
 * Confirm accept bet tx on chain.
 * Runs in background after API returns 202.
 *
 * 1. Poll for tx inclusion (up to 35s)
 * 2. If success: update DB, WS broadcast
 * 3. If failure: revert bet to "open", unlock funds, WS notify
 */
export function confirmAcceptBetInBackground(task: AcceptBetTask): void {
  (async () => {
    const { betId, txHash, acceptorUserId, acceptorGuess, address, amount, pendingLockId } = task;
    const tag = `bg:accept_bet`;

    try {
      // Step 1: Poll for tx result
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
        }, 3 * 60 * 1000); // 3 minute safety timeout

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

        // AUTO-REVEAL: immediately trigger reveal using stored secret
        autoRevealBet(betId).catch(err => {
          logger.error({ err, betId: betId.toString() }, `${tag} — auto-reveal failed (will retry via background job)`);
        });
      }
    } catch (err) {
      logger.error({ err, txHash, betId: betId.toString() }, `${tag} — unexpected error`);
      if (pendingLockId) removePendingLock(address, pendingLockId);
      invalidateBalanceCache(address);
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
  try {
    const query = JSON.stringify({ bet: { bet_id: betId } });
    const encoded = Buffer.from(query).toString('base64');
    const res = await fetch(
      `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${encoded}`,
    );
    if (!res.ok) return null;
    const data = await res.json() as { data: ChainBetState };
    return data.data;
  } catch {
    return null;
  }
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

    if (dbStatus === 'canceled') {
      await betService.cancelBet(betId);
    } else {
      await betService.resolveBet({
        betId,
        winnerUserId: winnerUserId ?? '',
        commissionAmount: chainState.commission_paid ?? '0',
        payoutAmount: chainState.payout_amount ?? '0',
        txhashResolve: '',
        status: dbStatus as 'revealed' | 'timeout_claimed',
      });

      // Distribute referral rewards from commission
      if (currentBet && currentBet.acceptorUserId) {
        const totalPot = BigInt(currentBet.amount) * 2n;
        referralService.distributeRewards(betId, totalPot, currentBet.makerUserId, currentBet.acceptorUserId)
          .catch(err => logger.warn({ err, betId: betId.toString() }, `${tag} — referral reward distribution failed`));
      }
    }

    // Unlock vault funds for involved parties if the bet was in an active state
    if (currentBet && (currentBet.status === 'open' || currentBet.status === 'accepting' || currentBet.status === 'accepted')) {
      try {
        if (dbStatus === 'canceled') {
          // Cancel: unlock maker's funds
          await vaultService.unlockFunds(currentBet.makerUserId, currentBet.amount);
          // If there was an acceptor (accepting state), unlock their funds too
          if (currentBet.acceptorUserId) {
            await vaultService.unlockFunds(currentBet.acceptorUserId, currentBet.amount);
          }
        }
        // For revealed/timeout_claimed: funds were sent on chain, just unlock the locked amounts
        // The vault balances will be corrected on next chain sync via vault.syncUserBalance
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
export async function autoRevealBet(betId: bigint): Promise<boolean> {
  const tag = 'auto-reveal';
  const betKey = betId.toString();

  if (processingBets.has(betKey)) {
    logger.debug({ betId: betKey }, `${tag} — already processing, skipping`);
    return false;
  }

  processingBets.add(betKey);
  try {
    return await _autoRevealBetInner(betId);
  } finally {
    processingBets.delete(betKey);
  }
}

async function _autoRevealBetInner(betId: bigint): Promise<boolean> {
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

  // Step 0: Check chain state first — maybe already resolved
  const alreadySynced = await syncBetFromChain(betId);
  if (alreadySynced) return true;

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

  // Schedule a delayed chain sync — pick up the result after block inclusion (~6-10s)
  // Don't block here — return immediately so other reveals can proceed
  scheduleDelayedSync(betId, relayResult.txHash);

  return true;
}

/**
 * Schedule a chain sync check after a delay.
 * Tries multiple times with increasing delays.
 */
function scheduleDelayedSync(betId: bigint, txHash?: string): void {
  const tag = 'delayed-sync';
  const delays = [8_000, 15_000, 30_000]; // 8s, 15s, 30s

  let attempt = 0;
  const trySync = async () => {
    try {
      const synced = await syncBetFromChain(betId);
      if (synced) {
        logger.info({ betId: betId.toString(), txHash, attempt }, `${tag} — synced`);
        return;
      }
      attempt++;
      if (attempt < delays.length) {
        setTimeout(trySync, delays[attempt]! - delays[attempt - 1]!);
      } else {
        logger.warn({ betId: betId.toString(), txHash }, `${tag} — not synced after all attempts, sweep will handle`);
      }
    } catch (err) {
      logger.error({ err, betId: betId.toString() }, `${tag} — error`);
    }
  };

  setTimeout(trySync, delays[0]);
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

        // Schedule delayed sync instead of blocking
        scheduleDelayedSync(bet.betId, relayResult.txHash);
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
 * Cancel open bets that have exceeded the 12-hour TTL.
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
              await vaultService.unlockFunds(cancelUserId, cancelAmount).catch(err =>
                logger.warn({ err }, `${tag} — unlockFunds failed`));
              await betService.cancelBet(cancelBetId, cancelTxHash!);
              logger.info({ betId: cancelBetId.toString() }, `${tag} — expired bet canceled & funds returned`);

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
 * Find open bets on chain that are NOT in our DB and cancel them.
 * These are "orphaned" bets — created on chain but the background
 * task that saves them to DB failed. Without this cleanup, the
 * maker's funds stay locked forever.
 */
async function cancelOrphanedChainBets(): Promise<void> {
  const tag = 'orphan-cancel';

  try {
    if (!relayerService.isReady()) return;

    // Query chain for all open bets
    const query = JSON.stringify({ open_bets: { limit: 200 } });
    const encoded = Buffer.from(query).toString('base64');
    const res = await fetch(
      `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${encoded}`,
    );
    if (!res.ok) return;

    const data = await res.json() as {
      data: { bets: Array<{ id: number; maker: string; amount: string; created_at_time: number }> };
    };
    const chainBets = data.data.bets;
    if (!chainBets || chainBets.length === 0) return;

    // Check which ones are NOT in our DB
    for (const chainBet of chainBets) {
      const betId = BigInt(chainBet.id);
      const betKey = betId.toString();

      if (processingBets.has(betKey)) continue;

      // Grace period: skip bets created less than 5 minutes ago
      // (background task may still be saving them to DB)
      if (chainBet.created_at_time) {
        const createdAtMs = chainBet.created_at_time > 1e12 ? chainBet.created_at_time : chainBet.created_at_time * 1000;
        const ageMs = Date.now() - createdAtMs;
        if (ageMs < 5 * 60 * 1000) {
          logger.debug({ betId: betKey, ageMs }, `${tag} — skipping recent bet (grace period)`);
          continue;
        }
      }

      const dbBet = await betService.getBetById(betId);
      if (dbBet) continue; // Already in DB — will be handled by normal auto-cancel

      // Orphaned bet — not in DB and older than 5min. Cancel it via relayer.
      processingBets.add(betKey);
      try {
        logger.warn({ betId: betKey, maker: chainBet.maker }, `${tag} — found orphaned bet, canceling`);

        const relayResult = await relayerService.relayCancelBet(
          chainBet.maker,
          Number(betId),
          true,
        );

        if (relayResult.success) {
          invalidateBalanceCache(chainBet.maker);
          logger.info({ betId: betKey, txHash: relayResult.txHash }, `${tag} — orphaned bet canceled`);
        } else {
          logger.error({ betId: betKey, error: relayResult.rawLog }, `${tag} — cancel failed`);
        }

        // Wait between cancels to avoid sequence mismatch
        await new Promise(r => setTimeout(r, 4000));
      } catch (err) {
        logger.error({ err, betId: betKey }, `${tag} — error canceling orphaned bet`);
      } finally {
        processingBets.delete(betKey);
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

  const SWEEP_INTERVAL_MS = 30_000;

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

      // 2. Auto-claim timed-out bets
      await autoClaimTimeoutBets();

      // 3. Auto-cancel expired open bets (12h TTL)
      await autoCancelExpiredBets();

      // 4. Cancel orphaned chain bets (on chain but not in DB)
      await cancelOrphanedChainBets();
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
