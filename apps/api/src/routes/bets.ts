import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import {
  CreateBetRequestSchema,
  BatchCreateBetsRequestSchema,
  AcceptBetRequestSchema,
  RevealRequestSchema,
  BetListQuerySchema,
  BetHistoryQuerySchema,
} from '@coinflip/shared/schemas';
import { MIN_BET_AMOUNT, MAX_OPEN_BETS_PER_USER, MAX_BATCH_SIZE, CHAIN_OPEN_BETS_LIMIT } from '@coinflip/shared/constants';
import { authMiddleware } from '../middleware/auth.js';
import { walletTxRateLimit } from '../middleware/rate-limit.js';
import { betService } from '../services/bet.service.js';
import { vaultService } from '../services/vault.service.js';
import { wsService } from '../services/ws.service.js';
import { relayerService } from '../services/relayer.js';
import { formatBetResponse } from '../lib/format.js';
import { AppError, Errors } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { resolveCreateBetInBackground, confirmAcceptAndRevealInBackground, confirmCancelBetInBackground } from '../services/background-tasks.js';
import { addPendingLock, removePendingLock, invalidateBalanceCache, getChainVaultBalance } from './vault.js';
import { generateSecret, computeCommitment } from '@coinflip/shared/commitment';
import { chainCached } from '../lib/chain-cache.js';
import { chainRest } from '../lib/chain-fetch.js';
import { pendingSecretsService, normalizeCommitmentToHex } from '../services/pending-secrets.service.js';

/**
 * Cryptographically secure coin flip.
 * Uses crypto.randomBytes (CSPRNG) — 128 even / 128 odd values = exact 50/50.
 * Both maker's side and acceptor's guess use independent random calls.
 */
const _flipStats = { heads: 0, tails: 0 };
function secureCoinFlip(): 'heads' | 'tails' {
  const byte = randomBytes(1)[0]!;
  const result = byte % 2 === 0 ? 'heads' : 'tails';
  _flipStats[result]++;
  return result;
}
/** Expose flip stats for admin diagnostics */
export function getCoinFlipStats() {
  return { ..._flipStats, total: _flipStats.heads + _flipStats.tails };
}
import type { AppEnv } from '../types.js';
import type { RelayResult } from '../services/relayer.js';
import { acquireInflight, releaseInflight } from '../lib/inflight-guard.js';
import { resolveGasGranter } from '../lib/gas-granter.js';
import { pinService } from '../services/pin.service.js';

// Re-export pending bet counts from shared lib (avoids circular deps with background-tasks)
import { getPendingBetCount, incrementPendingBetCount, decrementPendingBetCount } from '../lib/pending-counts.js';

/** Parse and validate bet ID from URL param */
function parseBetId(raw: string): bigint {
  if (!/^\d+$/.test(raw)) throw Errors.betNotFound(raw);
  return BigInt(raw);
}

/** Throw an appropriate AppError for a failed relay result */
function throwRelayError(relayResult: RelayResult): never {
  if (relayResult.timeout) {
    throw Errors.chainTimeout(relayResult.txHash);
  }
  throw Errors.chainTxFailed(relayResult.txHash ?? '', relayResult.rawLog ?? relayResult.error);
}

/** Query on-chain bet state (returns null if query fails) */
async function getChainBetState(betId: number): Promise<string | null> {
  return chainCached(
    'bet:' + betId,
    async () => {
      try {
        const query = btoa(JSON.stringify({ bet: { bet_id: betId } }));
        const res = await chainRest(
          `/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${query}`,
        );
        if (!res.ok) return null;
        const data = (await res.json()) as { data: { status?: string } };
        return data.data?.status ?? null;
      } catch {
        return null;
      }
    },
    3_000,
  );
}

/**
 * Query the chain for the number of open bets belonging to a specific maker address.
 * This is the SOURCE OF TRUTH — the contract enforces the max.
 * Falls back to -1 if the query fails (caller should fall back to DB count).
 */
async function getChainOpenBetCountForMaker(makerAddress: string): Promise<number> {
  try {
    const allBets = await chainCached(
      'open_bets_all',
      async () => {
        const query = JSON.stringify({ open_bets: { limit: CHAIN_OPEN_BETS_LIMIT } });
        const encoded = Buffer.from(query).toString('base64');
        const res = await chainRest(
          `/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${encoded}`,
        );
        if (!res.ok) return [];
        const data = (await res.json()) as { data: { bets: Array<{ id: number; maker?: string }> } };
        return data.data?.bets ?? [];
      },
      5_000,
    );
    return allBets.filter(b => b.maker === makerAddress).length;
  } catch (err) {
    logger.warn({ err, makerAddress }, 'Failed to query chain open bets count — falling back to DB');
    return -1;
  }
}

/** Extract a wasm event attribute value from relay result events */
function getWasmAttr(events: RelayResult['events'], key: string): string | undefined {
  if (!events) return undefined;
  for (const ev of events) {
    if (ev.type === 'wasm' || ev.type === 'wasm-create_bet' || ev.type === 'wasm-accept_bet' || ev.type === 'wasm-reveal') {
      for (const attr of ev.attributes) {
        if (attr.key === key) return attr.value;
      }
    }
  }
  return undefined;
}

export const betsRouter = new Hono<AppEnv>();

// GET /api/v1/bets — List open bets (public, no auth)
betsRouter.get('/', zValidator('query', BetListQuerySchema), async (c) => {
  const { cursor, limit, status, min_amount, max_amount } = c.req.valid('query');

  // Get pin slots for the response
  const pinSlots = await pinService.getPinSlots();
  const pinnedBetIds = new Set(pinSlots.filter((s) => s.betId).map((s) => s.betId!));
  const pinSlotMap = new Map(pinSlots.filter((s) => s.betId).map((s) => [s.betId!, s.slot]));

  const result = await betService.getOpenBets({
    cursor: cursor ?? undefined,
    limit,
    minAmount: min_amount,
    maxAmount: max_amount,
    status: status ?? 'open',
  });

  const addressMap = await betService.buildAddressMap(result.data);

  // Separate pinned, boosted, and regular bets
  const pinned: typeof result.data = [];
  const boosted: typeof result.data = [];
  const regular: typeof result.data = [];

  for (const bet of result.data) {
    const betIdStr = bet.betId.toString();
    if (pinnedBetIds.has(betIdStr)) {
      pinned.push(bet);
    } else if (bet.boostedAt) {
      boosted.push(bet);
    } else {
      regular.push(bet);
    }
  }

  // Sort boosted by boostedAt DESC (newest boosts first)
  boosted.sort((a, b) => {
    const aTime = a.boostedAt?.getTime() ?? 0;
    const bTime = b.boostedAt?.getTime() ?? 0;
    return bTime - aTime;
  });

  // Sort pinned by slot number
  pinned.sort((a, b) => {
    const aSlot = pinSlotMap.get(a.betId.toString()) ?? 99;
    const bSlot = pinSlotMap.get(b.betId.toString()) ?? 99;
    return aSlot - bSlot;
  });

  const ordered = [...pinned, ...boosted, ...regular];

  return c.json({
    data: ordered.map((bet) => {
      const betIdStr = bet.betId.toString();
      return formatBetResponse(bet, addressMap, {
        is_pinned: pinnedBetIds.has(betIdStr),
        pin_slot: pinSlotMap.get(betIdStr) ?? null,
        is_boosted: bet.boostedAt != null,
      });
    }),
    pin_slots: pinSlots,
    cursor: result.cursor,
    has_more: result.has_more,
  });
});

// GET /api/v1/bets/mine — Get all active bets for the authenticated user (single query)
betsRouter.get('/mine', authMiddleware, async (c) => {
  const user = c.get('user');

  // Single query: fetch all my bets in active states
  const myBets = await betService.getMyActiveBets(user.id);
  const addressMap = await betService.buildAddressMap(myBets);

  // Include pin data so My Bets shows pin indicators
  const pinSlots = await pinService.getPinSlots();
  const pinnedBetIds = new Set(pinSlots.filter((s) => s.betId).map((s) => s.betId!));
  const pinSlotMap = new Map(pinSlots.filter((s) => s.betId).map((s) => [s.betId!, s.slot]));

  return c.json({
    data: myBets.map((bet) => {
      const betIdStr = bet.betId.toString();
      return formatBetResponse(bet, addressMap, {
        is_pinned: pinnedBetIds.has(betIdStr),
        pin_slot: pinSlotMap.get(betIdStr) ?? null,
        is_boosted: bet.boostedAt != null,
      });
    }),
  });
});

// GET /api/v1/bets/history — Bet history (auth required)
betsRouter.get('/history', authMiddleware, zValidator('query', BetHistoryQuerySchema), async (c) => {
  const user = c.get('user');
  const { cursor, limit } = c.req.valid('query');

  const result = await betService.getUserBetHistory({
    userId: user.id,
    cursor: cursor ?? undefined,
    limit,
  });

  const addressMap = await betService.buildAddressMap(result.data);

  return c.json({
    data: result.data.map((bet) => formatBetResponse(bet, addressMap)),
    cursor: result.cursor,
    has_more: result.has_more,
  });
});

// GET /api/v1/bets/:betId — Get bet details (public)
betsRouter.get('/:betId', async (c) => {
  const raw = c.req.param('betId');
  if (!/^\d+$/.test(raw)) throw Errors.betNotFound(raw);
  const betId = BigInt(raw);
  const bet = await betService.getBetById(betId);

  if (!bet) throw Errors.betNotFound(betId.toString());

  const addressMap = await betService.buildAddressMap([bet]);
  return c.json({ data: formatBetResponse(bet, addressMap) });
});

// POST /api/v1/bets — Create bet (auth required)
// Server generates side + secret + commitment automatically.
// Returns 202 IMMEDIATELY after tx enters mempool (~2s).
// Bet confirmation (bet_id resolution, DB save) happens in background.
// Frontend is notified via WebSocket: bet_confirmed or bet_create_failed.
betsRouter.post('/', authMiddleware, walletTxRateLimit, zValidator('json', CreateBetRequestSchema), async (c) => {
  const user = c.get('user');
  const address = c.get('address');
  const { amount } = c.req.valid('json');

  // Server generates random side + secret + commitment
  const makerSide: 'heads' | 'tails' = secureCoinFlip();
  const makerSecret = generateSecret();
  const commitment = computeCommitment(address, makerSide, makerSecret);

  // Validate min bet
  if (BigInt(amount) < BigInt(MIN_BET_AMOUNT)) {
    throw Errors.belowMinBet(MIN_BET_AMOUNT);
  }

  // Submit to chain via relayer (ASYNC MODE — returns after broadcastTxSync ~2s)
  if (!relayerService.isReady()) {
    throw Errors.relayerNotReady();
  }

  // Acquire inflight guard FIRST to serialize per-user requests
  acquireInflight(address);

  let relayResult: RelayResult;
  let lockId: string | undefined;
  // Hoist balance so it's accessible for the response after the try/finally block
  let balance: { available: string; locked: string; total: string };
  try {
    // Check balance + open bets in parallel (both are DB reads, safe to run concurrently)
    const pendingCount = getPendingBetCount(user.id);
    const [bal, dbCount] = await Promise.all([
      vaultService.getBalance(user.id),
      betService.getOpenBetCountForUser(user.id),
    ]);
    balance = bal;

    if (BigInt(balance.available) < BigInt(amount)) {
      throw Errors.insufficientBalance(amount, balance.available);
    }

    const totalOpenPending = dbCount + pendingCount;
    if (totalOpenPending >= MAX_OPEN_BETS_PER_USER) {
      throw Errors.tooManyOpenBets(MAX_OPEN_BETS_PER_USER);
    }

    // Atomically lock funds BEFORE relay (guards against double-spend)
    const locked = await vaultService.lockFunds(user.id, amount);
    if (!locked) {
      throw Errors.insufficientBalance(amount, '0');
    }

    // Track pending lock server-side so balance API returns correct available
    lockId = addPendingLock(address, amount);
    invalidateBalanceCache(address);

    // Track pending bet in-memory (decremented when bet is confirmed/failed in background)
    incrementPendingBetCount(user.id);

    // Persist secret BEFORE broadcasting — survives background task failures & server restarts
    await pendingSecretsService.save({ commitment, makerSide, makerSecret });

    // Resolve gas granter (VIP → treasury, non-VIP → user)
    const granter = await resolveGasGranter(user.id, address);

    try {
      relayResult = await relayerService.relayCreateBet(address, amount, commitment, /* asyncMode */ true, granter);
    } catch (err) {
      // Relay failed — unlock funds, remove pending lock, decrement pending count
      removePendingLock(address, lockId);
      decrementPendingBetCount(user.id);
      await vaultService.unlockFunds(user.id, amount).catch(e =>
        logger.warn({ err: e }, 'Failed to unlock funds after relay error'));
      invalidateBalanceCache(address);
      await pendingSecretsService.delete(commitment);
      throw err;
    }
  } finally {
    releaseInflight(address);
  }

  if (!relayResult.success) {
    // Relay returned error — unlock funds, remove THIS pending lock only, decrement pending count
    if (lockId) removePendingLock(address, lockId);
    decrementPendingBetCount(user.id);
    await vaultService.unlockFunds(user.id, amount).catch(e =>
      logger.warn({ err: e }, 'Failed to unlock funds after relay failure'));
    invalidateBalanceCache(address);
    await pendingSecretsService.delete(commitment);
    logger.error({ relayResult, address, amount }, 'Create bet relay failed (CheckTx)');
    throwRelayError(relayResult);
  }

  // Update pending secret with txHash for traceability
  await pendingSecretsService.setTxHash(commitment, relayResult.txHash!).catch(() => {});

  // Fire-and-forget: resolve bet_id and save to DB in background
  const commitmentBase64 = Buffer.from(commitment, 'hex').toString('base64');
  resolveCreateBetInBackground({
    txHash: relayResult.txHash!,
    commitment,
    commitmentBase64,
    makerUserId: user.id,
    amount,
    address,
    makerSide,
    makerSecret,
    pendingLockId: lockId,
  });

  logger.info({ txHash: relayResult.txHash, address, amount }, 'Create bet submitted — confirming in background');

  // Compute post-lock balance from pre-lock snapshot.
  // balance was read BEFORE lockFunds, so subtract exactly this bet's amount.
  // Do NOT use getTotalPendingLocks — it includes locks from prior rapid creates
  // that are already reflected in balance, causing double-subtraction.
  const dbAvailable = BigInt(balance.available) - BigInt(amount);
  const dbLocked = BigInt(balance.locked) + BigInt(amount);

  // Return 202 Accepted — bet is not yet in DB, but tx is in mempool
  return c.json({
    data: {
      status: 'confirming',
      tx_hash: relayResult.txHash,
      amount,
      maker: address,
    },
    tx_hash: relayResult.txHash,
    balance: {
      available: (dbAvailable < 0n ? 0n : dbAvailable).toString(),
      locked: (dbLocked < 0n ? 0n : dbLocked).toString(),
    },
    message: 'Bet submitted to blockchain. You will be notified when confirmed.',
  }, 202);
});

// ─── Batch helpers ────────────────────────────────────────────

/** Generate a cryptographically random integer in [min, max] (inclusive, BigInt) */
function randomBigIntInRange(min: bigint, max: bigint): bigint {
  if (min === max) return min;
  const range = max - min + 1n;
  const bytesNeeded = Math.ceil(Number(range.toString(2).length) / 8) + 1;
  const maxValid = (1n << BigInt(bytesNeeded * 8)) - ((1n << BigInt(bytesNeeded * 8)) % range);
  let result: bigint;
  do {
    const bytes = randomBytes(bytesNeeded);
    result = bytes.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
  } while (result >= maxValid);
  return min + (result % range);
}

// POST /api/v1/bets/batch — Batch create bets (auth required)
// Supports two modes:
//   mode="fixed"  → all bets have the same amount
//   mode="random" → each bet gets a random amount between min_amount and max_amount
// Returns 202 with list of pending tx hashes.
betsRouter.post('/batch', authMiddleware, walletTxRateLimit, zValidator('json', BatchCreateBetsRequestSchema), async (c) => {
  const user = c.get('user');
  const address = c.get('address');
  const body = c.req.valid('json');
  const { mode, count } = body;

  // Build list of amounts
  const amounts: string[] = [];
  if (mode === 'fixed') {
    const amt = body.amount!;
    if (BigInt(amt) < BigInt(MIN_BET_AMOUNT)) {
      throw Errors.belowMinBet(MIN_BET_AMOUNT);
    }
    for (let i = 0; i < count; i++) amounts.push(amt);
  } else {
    const minAmt = BigInt(body.min_amount!);
    const maxAmt = BigInt(body.max_amount!);
    if (minAmt < BigInt(MIN_BET_AMOUNT)) {
      throw Errors.belowMinBet(MIN_BET_AMOUNT);
    }
    for (let i = 0; i < count; i++) {
      amounts.push(randomBigIntInRange(minAmt, maxAmt).toString());
    }
  }

  // Calculate total required balance
  const totalRequired = amounts.reduce((sum, a) => sum + BigInt(a), 0n);

  // Pre-flight checks
  if (!relayerService.isReady()) throw Errors.relayerNotReady();

  const balance = await vaultService.getBalance(user.id);
  if (BigInt(balance.available) < totalRequired) {
    throw Errors.insufficientBalance(totalRequired.toString(), balance.available);
  }

  // Check open bets count
  const pendingCount = getPendingBetCount(user.id);
  const dbCount = await betService.getOpenBetCountForUser(user.id);
  const totalOpenPending = dbCount + pendingCount;
  if (totalOpenPending + count > MAX_OPEN_BETS_PER_USER) {
    throw new AppError(
      'TOO_MANY_OPEN_BETS',
      `Batch would exceed max open bets (${MAX_OPEN_BETS_PER_USER}). Currently ${totalOpenPending} open, trying to add ${count}.`,
      400,
    );
  }

  // Lock ALL funds upfront atomically
  const locked = await vaultService.lockFunds(user.id, totalRequired.toString());
  if (!locked) {
    throw Errors.insufficientBalance(totalRequired.toString(), '0');
  }

  // Resolve gas granter once for the batch (VIP → treasury, non-VIP → user)
  const granter = await resolveGasGranter(user.id, address);

  // Submit bets sequentially via relayer, then resolve in batches of 3.
  // The sequence manager serializes signing correctly, but background resolution
  // (polling chain REST API) can't handle 12+ concurrent tasks — they timeout
  // and lose bet data. So we stagger background resolution.
  const BATCH_RELAY_DELAY_MS = 500; // between relay broadcasts (sequence manager handles nonces)
  const results: Array<{ index: number; amount: string; tx_hash?: string; error?: string }> = [];
  const pendingResolutions: Array<{ task: Parameters<typeof resolveCreateBetInBackground>[0]; index: number }> = [];
  let successCount = 0;
  let lockedSoFar = 0n;

  // Phase 1: Broadcast all txs (fast — just mempool acceptance)
  for (let i = 0; i < amounts.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, BATCH_RELAY_DELAY_MS));

    const amount = amounts[i]!;
    const makerSide: 'heads' | 'tails' = secureCoinFlip();
    const makerSecret = generateSecret();
    const commitment = computeCommitment(address, makerSide, makerSecret);

    // Persist secret BEFORE broadcasting
    await pendingSecretsService.save({ commitment, makerSide, makerSecret }).catch(err =>
      logger.warn({ err, index: i }, 'Batch: failed to persist secret (continuing anyway)'));

    try {
      const relayResult = await relayerService.relayCreateBet(address, amount, commitment, true, granter);

      if (!relayResult.success) {
        await pendingSecretsService.delete(commitment).catch(() => {});
        results.push({ index: i, amount, error: 'Transaction failed. Please try again.' });
        continue;
      }

      // Update pending secret with txHash
      await pendingSecretsService.setTxHash(commitment, relayResult.txHash!).catch(() => {});

      const lockId = addPendingLock(address, amount);
      incrementPendingBetCount(user.id);

      const commitmentBase64 = Buffer.from(commitment, 'hex').toString('base64');
      pendingResolutions.push({
        index: i,
        task: {
          txHash: relayResult.txHash!,
          commitment,
          commitmentBase64,
          makerUserId: user.id,
          amount,
          address,
          makerSide,
          makerSecret,
          pendingLockId: lockId,
        },
      });

      results.push({ index: i, amount, tx_hash: relayResult.txHash });
      successCount++;
      lockedSoFar += BigInt(amount);
    } catch (err: any) {
      logger.error({ err, index: i, amount }, 'Batch create: bet relay failed');
      await pendingSecretsService.delete(commitment).catch(() => {});
      results.push({ index: i, amount, error: err.message || 'Unexpected error' });
    }
  }

  // Phase 2: Stagger background resolution (max 3 concurrent to avoid REST API overload)
  const BATCH_RESOLVE_CONCURRENCY = 3;
  const BATCH_RESOLVE_STAGGER_MS = 2_000;
  for (let i = 0; i < pendingResolutions.length; i += BATCH_RESOLVE_CONCURRENCY) {
    const batch = pendingResolutions.slice(i, i + BATCH_RESOLVE_CONCURRENCY);
    for (const { task } of batch) {
      resolveCreateBetInBackground(task);
    }
    // Stagger between batches so they don't all poll the chain simultaneously
    if (i + BATCH_RESOLVE_CONCURRENCY < pendingResolutions.length) {
      await new Promise(r => setTimeout(r, BATCH_RESOLVE_STAGGER_MS));
    }
  }

  // Unlock the portion of funds that wasn't successfully submitted
  const unlockedAmount = totalRequired - lockedSoFar;
  if (unlockedAmount > 0n) {
    await vaultService.unlockFunds(user.id, unlockedAmount.toString()).catch(err =>
      logger.warn({ err }, 'Batch: failed to unlock remainder'));
  }

  invalidateBalanceCache(address);

  logger.info({
    address,
    mode,
    count,
    successCount,
    failedCount: count - successCount,
    totalAmount: lockedSoFar.toString(),
  }, 'Batch create completed');

  return c.json({
    data: {
      submitted: successCount,
      failed: count - successCount,
      total_amount: lockedSoFar.toString(),
      bets: results,
    },
    message: `${successCount}/${count} bets submitted to blockchain.`,
  }, 202);
});

// POST /api/v1/bets/:betId/accept — Accept bet (auth required)
// Returns 202 IMMEDIATELY after tx enters mempool (~2s).
// Bet status transitions: open → accepting → accepted (or reverts to open on failure).
// Frontend is notified via WebSocket: bet_accepted or accept_failed.
betsRouter.post('/:betId/accept', authMiddleware, walletTxRateLimit, async (c) => {
  const user = c.get('user');
  const address = c.get('address');
  const betId = parseBetId(c.req.param('betId'));
  // Server picks random guess — cryptographically secure
  const guess: 'heads' | 'tails' = secureCoinFlip();

  const existing = await betService.getBetById(betId);
  if (!existing) throw Errors.betNotFound(betId.toString());
  // Reject if bet is not "open"
  if (existing.status !== 'open') {
    if (existing.status === 'accepting') {
      throw new AppError('BET_ALREADY_CLAIMED', 'This bet is already being accepted by another player', 409);
    }
    if (existing.status === 'canceling') {
      throw new AppError('BET_CANCELED', 'Oops! This bet has been canceled by the creator', 410);
    }
    if (existing.status === 'canceled') {
      throw new AppError('BET_CANCELED', 'This bet has been canceled', 410);
    }
    throw Errors.invalidState('accept', existing.status);
  }
  if (existing.makerUserId === user.id) throw Errors.selfAccept();

  // Resolve maker secret — may still be in pending_bet_secrets if background task
  // hasn't confirmed the create_bet tx yet (common with batch-created bets).
  let makerSecret = existing.makerSecret;
  let makerSide = existing.makerSide;

  if (!makerSecret && existing.commitment) {
    // Normalize: bets table may have BASE64 (from old orphan imports), pending_bet_secrets has HEX
    const hexCommitment = normalizeCommitmentToHex(existing.commitment);
    const pending = await pendingSecretsService.getByCommitment(hexCommitment);
    if (pending) {
      makerSecret = pending.makerSecret;
      makerSide = pending.makerSide;
      // Backfill to bets table so future lookups don't need this fallback
      await betService.updateSecret(betId, makerSide, makerSecret).catch(() => {});
    }
  }

  if (!makerSecret || !makerSide) {
    throw new AppError('BET_NO_SECRET', 'This bet cannot be accepted right now. Please try another bet.', 422);
  }

  // Reject if bet expires within 30 seconds (prevents accepting about-to-expire bets)
  const OPEN_BET_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
  const EXPIRY_BUFFER_MS = 30_000; // 30 seconds
  const expiresAtMs = existing.createdTime.getTime() + OPEN_BET_TTL_MS;
  if (Date.now() > expiresAtMs - EXPIRY_BUFFER_MS) {
    throw new AppError('BET_EXPIRING', 'This bet is about to expire and can no longer be accepted', 410);
  }

  // NOTE: Pre-flight chain state check removed for performance (-300ms).
  // The DB status check above + atomic markAccepting(WHERE status='open') already prevents
  // double-accept. If the chain rejects, the background task reverts.

  // Submit to chain via relayer (ASYNC MODE — returns after broadcastTxSync ~2s)
  if (!relayerService.isReady()) {
    throw Errors.relayerNotReady();
  }

  // No inflight guard needed: markAccepting (WHERE status='open') is atomic and prevents
  // double-accept, lockFunds (WHERE available >= amount) is atomic and prevents double-spend.
  // Removing the 2s per-address cooldown allows rapid accepting of different bets.

  let relayResult: RelayResult;
  let acceptingBet: Awaited<ReturnType<typeof betService.markAccepting>> | null = null;
  let acceptLockId: string | undefined;
  // Hoist balance so it's accessible for the response after the try/finally block
  let acceptBalance: { available: string; locked: string; total: string };

  acceptBalance = await vaultService.getBalance(user.id);
  if (BigInt(acceptBalance.available) < BigInt(existing.amount)) {
    throw Errors.insufficientBalance(existing.amount, acceptBalance.available);
  }

  // Atomically lock acceptor funds BEFORE relay (guards against double-spend)
  const locked = await vaultService.lockFunds(user.id, existing.amount);
  if (!locked) {
    throw Errors.insufficientBalance(existing.amount, '0');
  }

  // Track pending lock server-side so balance API returns correct available
  acceptLockId = addPendingLock(address, existing.amount);
  invalidateBalanceCache(address);

  // Atomically mark bet as "accepting" — uses WHERE status='open' to prevent double-accept.
  acceptingBet = await betService.markAccepting({
    betId,
    acceptorUserId: user.id,
    acceptorGuess: guess,
  });

  if (!acceptingBet) {
    // Race condition: someone else accepted first. Unlock our funds.
    removePendingLock(address, acceptLockId);
    await vaultService.unlockFunds(user.id, existing.amount).catch(e =>
      logger.warn({ err: e }, 'Failed to unlock funds after race'));
    invalidateBalanceCache(address);
    throw new AppError('BET_ALREADY_CLAIMED', 'This bet is already being accepted by another player', 409);
  }

  // Resolve gas granter (VIP → treasury, non-VIP → user)
  const granter = await resolveGasGranter(user.id, address);

  try {
    // Use accept_and_reveal: single atomic tx — accept + verify + resolve in one step.
    // No separate reveal tx needed, no "accepted" intermediate state.
    relayResult = await relayerService.relayAcceptAndReveal(
      address,
      Number(betId),
      guess as 'heads' | 'tails',
      makerSide as 'heads' | 'tails',
      makerSecret,
      /* asyncMode */ true,
      granter,
    );
  } catch (err) {
    // Relay failed — unlock and revert
    removePendingLock(address, acceptLockId);
    await vaultService.unlockFunds(user.id, existing.amount).catch(e =>
      logger.warn({ err: e }, 'Failed to unlock funds after relay error'));
    await betService.revertAccepting(betId).catch(e =>
      logger.warn({ err: e }, 'Failed to revert accepting after relay error'));
    invalidateBalanceCache(address);
    throw err;
  }

  if (!relayResult.success) {
    // Chain rejected — unlock and revert
    removePendingLock(address, acceptLockId);
    await vaultService.unlockFunds(user.id, existing.amount).catch(e =>
      logger.warn({ err: e }, 'Failed to unlock funds after relay failure'));
    await betService.revertAccepting(betId).catch(e =>
      logger.warn({ err: e }, 'Failed to revert accepting after relay failure'));
    invalidateBalanceCache(address);
    logger.error({ relayResult, address, betId: betId.toString() }, 'Accept bet relay failed (CheckTx)');
    throwRelayError(relayResult);
  }

  // Build address map once — reuse for WS emit and HTTP response
  const addressMap = await betService.buildAddressMap([acceptingBet ?? existing]);

  // IMMEDIATELY broadcast to ALL clients — removes bet from everyone's "Open Bets"
  if (acceptingBet) {
    wsService.emitBetAccepting(formatBetResponse(acceptingBet, addressMap) as unknown as Record<string, unknown>);
  }

  // Fire-and-forget: confirm tx in background, update DB, notify via WS.
  // Uses the simpler accept_and_reveal flow — no separate reveal step needed.
  confirmAcceptAndRevealInBackground({
    betId,
    txHash: relayResult.txHash!,
    acceptorUserId: user.id,
    acceptorGuess: guess,
    address,
    amount: existing.amount,
    pendingLockId: acceptLockId,
  });

  logger.info({ txHash: relayResult.txHash, address, betId: betId.toString() }, 'Accept bet submitted — confirming in background');

  const responseData = acceptingBet ?? existing;

  // Compute post-lock balance from pre-lock snapshot.
  // acceptBalance was read BEFORE lockFunds, so subtract exactly this bet's amount.
  // Do NOT use getTotalPendingLocks — it includes locks from prior rapid accepts
  // that are already reflected in acceptBalance, causing double-subtraction.
  const acceptAvail = BigInt(acceptBalance.available) - BigInt(existing.amount);
  const acceptLocked = BigInt(acceptBalance.locked) + BigInt(existing.amount);

  // Return 202 Accepted — confirmation in progress
  return c.json({
    data: {
      ...formatBetResponse(responseData, addressMap),
      status: 'accepting',
      acceptor: address,
      acceptor_guess: guess,
    },
    tx_hash: relayResult.txHash,
    balance: {
      available: (acceptAvail < 0n ? 0n : acceptAvail).toString(),
      locked: (acceptLocked < 0n ? 0n : acceptLocked).toString(),
    },
    message: 'Accept submitted to blockchain. Confirming...',
  }, 202);
});

// POST /api/v1/bets/:betId/reveal — Reveal (auth required)
betsRouter.post('/:betId/reveal', authMiddleware, walletTxRateLimit, zValidator('json', RevealRequestSchema), async (c) => {
  const user = c.get('user');
  const address = c.get('address');
  const betId = parseBetId(c.req.param('betId'));
  const { side, secret } = c.req.valid('json');

  // Validate secret format: must be 64 hex characters
  if (!/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw Errors.validationError('Secret must be exactly 64 hex characters');
  }

  const existing = await betService.getBetById(betId);
  if (!existing) throw Errors.betNotFound(betId.toString());
  if (existing.status !== 'accepted') throw Errors.invalidState('reveal', existing.status);
  if (existing.makerUserId !== user.id) throw Errors.unauthorized();

  // Pre-flight: verify bet is still accepted on chain (not already revealed)
  const chainState = await getChainBetState(Number(betId));
  if (chainState) {
    const lower = chainState.toLowerCase();
    if (lower.includes('revealed') || lower.includes('canceled') || lower.includes('timeout')) {
      logger.warn({ betId: betId.toString(), chainState }, 'Bet already resolved on chain — syncing DB');
      const newStatus = lower.includes('revealed') ? 'revealed'
        : lower.includes('timeout') ? 'timeout_claimed'
        : 'canceled';
      await betService.updateBetStatus(betId, newStatus).catch(err => logger.error({ err, betId: betId.toString() }, 'Failed to sync reveal status'));
      const synced = await betService.getBetById(betId);
      return c.json({
        data: synced ? formatBetResponse(synced) : formatBetResponse(existing),
        message: `Bet already resolved on chain (${chainState}). Database synced.`,
      });
    }
  }

  // Submit to chain — the contract verifies commitment and resolves the bet
  if (!relayerService.isReady()) {
    throw Errors.relayerNotReady();
  }

  // Resolve gas granter (VIP → treasury, non-VIP → user)
  const granter = await resolveGasGranter(user.id, address);

  // Guard: one tx at a time per user
  acquireInflight(address);
  let relayResult: RelayResult;
  try {
    relayResult = await relayerService.relayReveal(
      address,
      Number(betId),
      side as 'heads' | 'tails',
      secret,
      /* asyncMode */ true,
      granter,
    );
  } finally {
    releaseInflight(address);
  }

  if (!relayResult.success) {
    logger.error({ relayResult, address, betId: betId.toString() }, 'Reveal relay failed');
    throwRelayError(relayResult);
  }

  return c.json({
    data: formatBetResponse(existing),
    tx_hash: relayResult.txHash,
    status: 'submitted',
    message: 'Reveal submitted to chain. Result will arrive via WebSocket.',
  }, 202);
});

// POST /api/v1/bets/:betId/cancel — Cancel (auth required)
// ASYNC: marks bet as "canceling" in DB, broadcasts via WS, submits chain tx,
// and returns 202 IMMEDIATELY. Confirmation happens in background.
betsRouter.post('/:betId/cancel', authMiddleware, walletTxRateLimit, async (c) => {
  const user = c.get('user');
  const address = c.get('address');
  const betId = parseBetId(c.req.param('betId'));

  const existing = await betService.getBetById(betId);
  if (!existing) throw Errors.betNotFound(betId.toString());
  if (existing.status !== 'open' && existing.status !== 'canceling') throw Errors.invalidState('cancel', existing.status);
  if (existing.makerUserId !== user.id) throw Errors.unauthorized();

  // STEP 1: Atomically mark as "canceling" — only works if status is still "open".
  const cancelingBet = await betService.markCanceling(betId);
  if (!cancelingBet) {
    throw Errors.invalidState('cancel', 'bet was already claimed or is no longer open');
  }
  const cancelAddr = await betService.buildAddressMap([cancelingBet]);
  // Emit "canceling" (transitional) — NOT "canceled" (final). The background task
  // emits bet_canceled after chain confirmation. This prevents double-emit causing UI flicker.
  wsService.broadcast({ type: 'bet_canceling', data: formatBetResponse(cancelingBet, cancelAddr) as unknown as Record<string, unknown> });

  // STEP 2: Submit to chain (ASYNC MODE — returns after broadcastTxSync ~1-2s)
  if (!relayerService.isReady()) {
    await betService.updateBetStatus(betId, 'open');
    const revBet0 = await betService.getBetById(betId);
    if (revBet0) {
      const am = await betService.buildAddressMap([revBet0]);
      wsService.emitBetReverted(formatBetResponse(revBet0, am) as unknown as Record<string, unknown>);
    }
    throw Errors.relayerNotReady();
  }

  // Resolve gas granter (VIP → treasury, non-VIP → user)
  const granter = await resolveGasGranter(user.id, address);

  // No inflight guard needed: markCanceling (WHERE status='open') is atomic.
  let relayResult: RelayResult;
  try {
    relayResult = await relayerService.relayCancelBet(address, Number(betId), /* asyncMode */ true, granter);
  } catch (err) {
    await betService.updateBetStatus(betId, 'open');
    const revBet = await betService.getBetById(betId);
    if (revBet) {
      const addressMap = await betService.buildAddressMap([revBet]);
      wsService.emitBetReverted(formatBetResponse(revBet, addressMap) as unknown as Record<string, unknown>);
    }
    throw err;
  }

  if (!relayResult.success) {
    const alreadyCanceled = relayResult.rawLog?.includes('cannot cancel bet in Canceled state')
      || relayResult.rawLog?.includes('already canceled');
    if (alreadyCanceled) {
      await betService.cancelBet(betId, relayResult.txHash);
      await vaultService.unlockFunds(user.id, existing.amount).catch(err => logger.warn({ err, userId: user.id }, 'unlockFunds failed during cancel'));
      const canceledBet = await betService.getBetById(betId);
      return c.json({ data: canceledBet ? formatBetResponse(canceledBet) : null, message: 'Bet canceled.' });
    }

    await betService.updateBetStatus(betId, 'open');
    const revBet = await betService.getBetById(betId);
    if (revBet) {
      const addressMap = await betService.buildAddressMap([revBet]);
      wsService.emitBetReverted(formatBetResponse(revBet, addressMap) as unknown as Record<string, unknown>);
    }
    logger.error({ relayResult, address, betId: betId.toString() }, 'Cancel bet relay failed (CheckTx)');
    throwRelayError(relayResult);
  }

  // Fire-and-forget: confirm cancel tx in background
  confirmCancelBetInBackground({
    betId,
    txHash: relayResult.txHash!,
    makerUserId: user.id,
    address,
    amount: existing.amount,
  });

  logger.info({ txHash: relayResult.txHash, address, betId: betId.toString() }, 'Cancel bet submitted — confirming in background');

  return c.json({
    data: formatBetResponse(cancelingBet, cancelAddr),
    tx_hash: relayResult.txHash,
    message: 'Cancel submitted to blockchain. Confirming...',
  }, 202);
});

// POST /api/v1/bets/:betId/claim-timeout — Claim timeout (auth required)
betsRouter.post('/:betId/claim-timeout', authMiddleware, walletTxRateLimit, async (c) => {
  const user = c.get('user');
  const address = c.get('address');
  const betId = parseBetId(c.req.param('betId'));

  const existing = await betService.getBetById(betId);
  if (!existing) throw Errors.betNotFound(betId.toString());
  if (existing.status !== 'accepted') throw Errors.invalidState('claim_timeout', existing.status);
  if (existing.acceptorUserId !== user.id) throw Errors.unauthorized();

  // Check on-chain state first — bet might already be resolved (revealed or timeout_claimed)
  const chainState = await getChainBetState(Number(betId));
  if (chainState) {
    const lowerState = chainState.toLowerCase();
    // If already timeout_claimed, revealed, or canceled on chain, sync DB
    if (lowerState.includes('timeout') || lowerState.includes('revealed') || lowerState.includes('canceled')) {
      logger.warn({ betId: betId.toString(), chainState }, 'Bet already resolved on chain — syncing DB');
      // Update DB status to match chain state
      try {
        const newStatus = lowerState.includes('timeout') ? 'timeout_claimed'
          : lowerState.includes('revealed') ? 'revealed'
          : 'canceled';
        await betService.updateBetStatus(betId, newStatus);
      } catch (err) {
        logger.error({ err, betId: betId.toString() }, 'Failed to sync bet status');
      }
      const synced = await betService.getBetById(betId);
      return c.json({
        data: synced ? formatBetResponse(synced) : formatBetResponse(existing),
        message: `Bet already resolved on chain (${chainState}). Database synced.`,
      });
    }
  }

  // Submit to chain
  if (!relayerService.isReady()) {
    throw Errors.relayerNotReady();
  }

  // Resolve gas granter (VIP → treasury, non-VIP → user)
  const granter = await resolveGasGranter(user.id, address);

  // Guard: one tx at a time per user
  acquireInflight(address);
  let relayResult: RelayResult;
  try {
    relayResult = await relayerService.relayClaimTimeout(address, Number(betId), /* asyncMode */ true, granter);
  } finally {
    releaseInflight(address);
  }

  if (!relayResult.success) {
    logger.error({ relayResult, address, betId: betId.toString() }, 'Claim timeout relay failed');
    throwRelayError(relayResult);
  }

  return c.json({
    data: formatBetResponse(existing),
    tx_hash: relayResult.txHash,
    status: 'submitted',
    message: 'Timeout claim submitted to chain. Result will arrive via WebSocket.',
  }, 202);
});
