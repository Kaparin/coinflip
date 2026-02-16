import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { DepositRequestSchema, WithdrawRequestSchema } from '@coinflip/shared/schemas';
import { authMiddleware } from '../middleware/auth.js';
import { vaultService } from '../services/vault.service.js';
import { relayerService } from '../services/relayer.js';
import { wsService } from '../services/ws.service.js';
import { Errors } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types.js';
import type { RelayResult } from '../services/relayer.js';
import { getPendingBetCount } from '../lib/pending-counts.js';
import { betService } from '../services/bet.service.js';

// ─── Per-user in-flight transaction guard ─────────────────────
const inflightTxs = new Map<string, number>();

function acquireInflight(address: string): void {
  const existing = inflightTxs.get(address);
  if (existing && Date.now() - existing < 30_000) {
    throw Errors.actionInProgress(5);
  }
  inflightTxs.set(address, Date.now());
}

function releaseInflight(address: string): void {
  inflightTxs.delete(address);
}

/** Throw an appropriate AppError for a failed relay result */
function throwRelayError(relayResult: RelayResult): never {
  if (relayResult.timeout) {
    throw Errors.chainTimeout(relayResult.txHash);
  }
  throw Errors.chainTxFailed(relayResult.txHash ?? '', relayResult.rawLog ?? relayResult.error);
}

export const vaultRouter = new Hono<AppEnv>();

/** Query vault balance directly from chain contract (with cache) */
const balanceCache = new Map<string, { data: { available: string; locked: string }; ts: number }>();
const BALANCE_CACHE_TTL = 5_000; // 5 seconds

export async function getChainVaultBalance(address: string): Promise<{ available: string; locked: string }> {
  // Check cache first
  const cached = balanceCache.get(address);
  if (cached && Date.now() - cached.ts < BALANCE_CACHE_TTL) {
    return cached.data;
  }

  try {
    const query = btoa(JSON.stringify({ vault_balance: { address } }));
    const res = await fetch(
      `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${query}`,
    );
    if (!res.ok) return { available: '0', locked: '0' };
    const data = (await res.json()) as { data: { available: string; locked: string } };
    balanceCache.set(address, { data: data.data, ts: Date.now() });
    return data.data;
  } catch (err) {
    logger.warn({ err, address }, 'Failed to query chain vault balance, falling back to DB');
    return { available: '0', locked: '0' };
  }
}

// ─── Server-side pending locks ──────────────────────────────────
// Tracks funds that have been locked in DB (lockFunds) but not yet
// reflected on-chain. The balance endpoint subtracts these from chain
// balance so clients always see the correct available amount.
// Each entry auto-expires after 30s as a safety net.
const PENDING_LOCK_TTL = 30_000;

interface PendingLock {
  id: string;
  amount: bigint;
  ts: number;
}

const pendingLocksMap = new Map<string, PendingLock[]>();

export function addPendingLock(address: string, amount: string): string {
  const id = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const list = pendingLocksMap.get(address) ?? [];
  list.push({ id, amount: BigInt(amount), ts: Date.now() });
  pendingLocksMap.set(address, list);
  // Auto-expire after TTL
  setTimeout(() => removePendingLock(address, id), PENDING_LOCK_TTL);
  return id;
}

export function removePendingLock(address: string, lockId: string): void {
  const list = pendingLocksMap.get(address);
  if (!list) return;
  const filtered = list.filter(l => l.id !== lockId);
  if (filtered.length === 0) {
    pendingLocksMap.delete(address);
  } else {
    pendingLocksMap.set(address, filtered);
  }
}

export function clearPendingLocks(address: string): void {
  pendingLocksMap.delete(address);
}

export function getTotalPendingLocks(address: string): bigint {
  const list = pendingLocksMap.get(address);
  if (!list || list.length === 0) return 0n;
  // Filter expired entries
  const now = Date.now();
  let total = 0n;
  for (const lock of list) {
    if (now - lock.ts < PENDING_LOCK_TTL) {
      total += lock.amount;
    }
  }
  return total;
}

/** Invalidate balance cache for a user (call after lockFunds/unlockFunds) */
export function invalidateBalanceCache(address: string): void {
  balanceCache.delete(address);
}

// GET /api/v1/vault/balance — Get balance (auth required)
// Uses chain balance (cached 5s) adjusted by server-side pending locks.
// Pending locks represent funds locked in DB but not yet reflected on-chain.
// This ensures the client always sees accurate available balance.
vaultRouter.get('/balance', authMiddleware, async (c) => {
  const user = c.get('user');
  const address = c.get('address');

  // Fetch chain balance (cached for 5s to prevent hammering the chain)
  const chainBalance = await getChainVaultBalance(address);
  let available = BigInt(chainBalance.available);
  const chainLocked = BigInt(chainBalance.locked);

  // Subtract pending locks that chain hasn't reflected yet
  const pendingLockAmount = getTotalPendingLocks(address);
  if (pendingLockAmount > 0n) {
    available = available - pendingLockAmount;
    if (available < 0n) available = 0n;
  }
  const locked = chainLocked + pendingLockAmount;
  const total = available + locked;

  // Sync to DB in background (don't block response)
  vaultService.syncBalanceFromChain(
    user.id,
    chainBalance.available,
    chainBalance.locked,
    0n,
  ).catch(err => logger.warn({ err }, 'Background vault sync failed'));

  // Include server-side pending bet count
  const pendingBets = getPendingBetCount(user.id);

  // Open bets count from DB (fast) + pending bets
  const dbOpenCount = await betService.getOpenBetCountForUser(user.id);
  const openBetsCount = dbOpenCount + pendingBets;

  return c.json({
    data: {
      available: available.toString(),
      locked: locked.toString(),
      total: total.toString(),
      pending_bets: pendingBets,
      open_bets_count: openBetsCount,
    },
  });
});

// POST /api/v1/vault/deposit — Deposit via CW20 Send (relayed)
vaultRouter.post('/deposit', authMiddleware, zValidator('json', DepositRequestSchema), async (c) => {
  const user = c.get('user');
  const address = c.get('address');
  const { amount } = c.req.valid('json');

  // For deposit, the user needs to execute a CW20 Send to the contract.
  // This is a MsgExecuteContract on the CW20 token, not on the CoinFlip contract.
  // The relayer can only execute messages on the CoinFlip contract via authz.
  // So deposit requires the user to sign directly or use a special CW20 authz grant.
  //
  // For MVP: return unsigned tx payload that the frontend signs via Keplr.
  const depositMsg = {
    send: {
      contract: env.COINFLIP_CONTRACT_ADDR,
      amount,
      msg: btoa(JSON.stringify({ deposit: {} })),
    },
  };

  return c.json({
    data: {
      contract: env.LAUNCH_CW20_ADDR,
      msg: depositMsg,
      amount,
      instruction: 'Sign this CW20 Send transaction via Keplr to deposit LAUNCH tokens.',
    },
  });
});

// POST /api/v1/vault/withdraw — Withdraw from vault (via relayer)
vaultRouter.post('/withdraw', authMiddleware, zValidator('json', WithdrawRequestSchema), async (c) => {
  const user = c.get('user');
  const address = c.get('address');
  const { amount } = c.req.valid('json');

  // Submit withdraw via relayer (MsgExec → MsgExecuteContract { withdraw })
  if (!relayerService.isReady()) {
    throw Errors.relayerNotReady();
  }

  // Acquire in-flight guard FIRST to prevent concurrent withdrawals
  acquireInflight(address);

  let relayResult: RelayResult;
  try {
    // Check chain balance AFTER acquiring inflight (prevents race between check & relay)
    const chainBalance = await getChainVaultBalance(address);
    if (BigInt(chainBalance.available) < BigInt(amount)) {
      throw Errors.insufficientBalance(amount, chainBalance.available);
    }

    // Atomically lock funds in DB to prevent double-withdraw
    const locked = await vaultService.lockFunds(user.id, amount);
    if (!locked) {
      throw Errors.insufficientBalance(amount, '0');
    }

    try {
      relayResult = await relayerService.relayWithdraw(address, amount);
    } catch (err) {
      // Relay failed — unlock funds
      await vaultService.unlockFunds(user.id, amount).catch(e =>
        logger.warn({ err: e }, 'Failed to unlock funds after withdraw relay error'));
      throw err;
    }

    if (!relayResult.success) {
      // Chain rejected — unlock funds
      await vaultService.unlockFunds(user.id, amount).catch(e =>
        logger.warn({ err: e }, 'Failed to unlock funds after withdraw chain error'));
      logger.error({ relayResult, address, amount }, 'Withdraw relay failed');
      throwRelayError(relayResult);
    }

    // Success — sync balance from chain (unlock + deduct)
    const newChainBalance = await getChainVaultBalance(address);
    await vaultService.syncBalanceFromChain(
      user.id,
      newChainBalance.available,
      newChainBalance.locked,
      BigInt(relayResult.height ?? 0),
    );

    // Notify via WS
    wsService.sendToAddress(address, {
      type: 'balance_updated',
      data: { available: newChainBalance.available, locked: newChainBalance.locked },
    });
  } finally {
    releaseInflight(address);
  }

  return c.json({
    data: {
      status: 'confirmed',
      amount,
      tx_hash: relayResult.txHash,
      message: 'Withdrawal confirmed on chain.',
    },
  });
});
