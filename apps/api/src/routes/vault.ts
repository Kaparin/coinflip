import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { DepositRequestSchema, WithdrawRequestSchema } from '@coinflip/shared/schemas';
import { authMiddleware } from '../middleware/auth.js';
import { walletTxRateLimit } from '../middleware/rate-limit.js';
import { vaultService } from '../services/vault.service.js';
import { relayerService } from '../services/relayer.js';
import { wsService } from '../services/ws.service.js';
import { AppError, Errors } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types.js';
import type { RelayResult } from '../services/relayer.js';
import { getPendingBetCount } from '../lib/pending-counts.js';
import { betService } from '../services/bet.service.js';
import { chainCached, invalidateChainCache } from '../lib/chain-cache.js';
import { acquireInflight, releaseInflight } from '../lib/inflight-guard.js';

/** Throw an appropriate AppError for a failed relay result */
function throwRelayError(relayResult: RelayResult): never {
  if (relayResult.timeout) {
    throw Errors.chainTimeout(relayResult.txHash);
  }
  throw Errors.chainTxFailed(relayResult.txHash ?? '', relayResult.rawLog ?? relayResult.error);
}

export const vaultRouter = new Hono<AppEnv>();

/** Query vault balance directly from chain contract (with cache) */
export async function getChainVaultBalance(address: string): Promise<{ available: string; locked: string }> {
  return chainCached(
    'vault:' + address,
    async () => {
      try {
        const query = btoa(JSON.stringify({ vault_balance: { address } }));
        const res = await fetch(
          `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${query}`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (!res.ok) return { available: '0', locked: '0' };
        const data = (await res.json()) as { data: { available: string; locked: string } };
        return data.data;
      } catch (err) {
        logger.warn({ err, address }, 'Failed to query chain vault balance, falling back to DB');
        return { available: '0', locked: '0' };
      }
    },
    10_000,
  );
}

// ─── Server-side pending locks ──────────────────────────────────
// Tracks funds that have been locked in DB (lockFunds) but not yet
// reflected on-chain. The balance endpoint subtracts these from chain
// balance so clients always see the correct available amount.
// Each entry auto-expires after 30s as a safety net.
const PENDING_LOCK_TTL = 90_000;

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
  invalidateChainCache('vault:' + address);
}

// GET /api/v1/vault/balance — Get balance (auth required)
// Uses chain balance (cached 5s) adjusted by server-side pending locks.
// Pending locks represent funds locked in DB but not yet reflected on-chain.
vaultRouter.get('/balance', authMiddleware, async (c) => {
  const user = c.get('user');
  const address = c.get('address');

  // Fetch chain balance + DB open bet count in parallel
  const [chainBalance, dbOpenCount] = await Promise.all([
    getChainVaultBalance(address),
    betService.getOpenBetCountForUser(user.id),
  ]);

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

// POST /api/v1/vault/deposit — Deposit via CW20 Send (returns unsigned payload)
vaultRouter.post('/deposit', authMiddleware, zValidator('json', DepositRequestSchema), async (c) => {
  const { amount } = c.req.valid('json');

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

// POST /api/v1/vault/deposit/broadcast — Broadcast a client-signed deposit tx
//
// Optimized deposit flow:
//   1. Frontend signs tx locally (fast, only 1 RPC call for account sequence)
//   2. Frontend POSTs signed tx bytes here
//   3. Server broadcasts directly to RPC node (no Vercel proxy in the path)
//   4. Server polls REST API for confirmation (2s intervals, max 30s)
//   5. Server syncs balance and returns result
//
// This is ~3-5x faster than the old flow where everything went through Vercel proxy.
const DepositBroadcastSchema = z.object({ tx_bytes: z.string().min(1).max(100_000) });
vaultRouter.post('/deposit/broadcast', authMiddleware, zValidator('json', DepositBroadcastSchema), async (c) => {
  const user = c.get('user');
  const address = c.get('address');

  const { tx_bytes: txBytesBase64 } = c.req.valid('json');

  // Pre-flight: verify user's CW20 wallet balance before broadcasting.
  // This prevents wasting gas on a tx that will fail due to insufficient balance.
  if (env.LAUNCH_CW20_ADDR) {
    try {
      const balQuery = btoa(JSON.stringify({ balance: { address } }));
      const balRes = await fetch(
        `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.LAUNCH_CW20_ADDR}/smart/${balQuery}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (balRes.ok) {
        const balData = await balRes.json() as { data: { balance: string } };
        const cw20Balance = BigInt(balData.data?.balance ?? '0');
        if (cw20Balance === 0n) {
          throw Errors.insufficientBalance('deposit amount', '0 (wallet CW20 balance is empty)');
        }
      }
    } catch (err) {
      // If it's our own AppError, re-throw it
      if (err instanceof AppError) throw err;
      // Otherwise just log and continue — don't block deposit on balance check failure
      logger.warn({ err, address }, 'CW20 balance pre-check failed, proceeding with broadcast');
    }
  }

  // Prevent concurrent deposits for the same user
  acquireInflight(address);

  try {
    // Step 1: Broadcast via Cosmos REST API (BROADCAST_MODE_SYNC)
    // This is a direct connection from our server to the chain node — no proxy overhead.
    const broadcastRes = await fetch(`${env.AXIOME_REST_URL}/cosmos/tx/v1beta1/txs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx_bytes: txBytesBase64,
        mode: 'BROADCAST_MODE_SYNC',
      }),
      signal: AbortSignal.timeout(5000),
    });

    const broadcastData = await broadcastRes.json() as {
      tx_response?: {
        txhash: string;
        code: number;
        raw_log?: string;
      };
    };

    const txResponse = broadcastData.tx_response;
    if (!txResponse) {
      throw Errors.chainTxFailed('', 'Invalid broadcast response from chain node');
    }

    // CheckTx failed — tx rejected from mempool
    if (txResponse.code !== 0) {
      throw Errors.chainTxFailed(
        txResponse.txhash || '',
        txResponse.raw_log || `CheckTx failed with code ${txResponse.code}`,
      );
    }

    const txHash = txResponse.txhash;
    logger.info({ txHash, address }, 'Deposit tx in mempool (sync broadcast)');

    // Step 2: Poll for block inclusion (same as relayer: 2s interval, 30s timeout)
    const pollStartTime = Date.now();
    const maxPollMs = 30_000;
    const pollIntervalMs = 2_000;
    let txResult: { code: number; rawLog: string; height: number } | null = null;

    while (Date.now() - pollStartTime < maxPollMs) {
      await new Promise(r => setTimeout(r, pollIntervalMs));
      try {
        const txRes = await fetch(
          `${env.AXIOME_REST_URL}/cosmos/tx/v1beta1/txs/${txHash}`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (txRes.ok) {
          const txData = await txRes.json() as {
            tx_response?: {
              code: number;
              raw_log?: string;
              height?: string;
            };
          };
          if (txData.tx_response) {
            txResult = {
              code: txData.tx_response.code,
              rawLog: txData.tx_response.raw_log ?? '',
              height: Number(txData.tx_response.height ?? 0),
            };
            break;
          }
        }
      } catch {
        // Not yet indexed — keep polling
      }
    }

    if (!txResult) {
      // Tx is in mempool but not confirmed within timeout — still likely to succeed
      logger.warn({ txHash, address }, 'Deposit tx poll timeout — still in mempool');
      return c.json({
        data: {
          status: 'pending',
          tx_hash: txHash,
          message: 'Transaction submitted but not yet confirmed. It may still succeed.',
        },
      });
    }

    if (txResult.code !== 0) {
      throw Errors.chainTxFailed(txHash, txResult.rawLog);
    }

    // Step 3: Success — invalidate cache and sync balance
    logger.info({ txHash, address, height: txResult.height }, 'Deposit confirmed on chain');
    invalidateBalanceCache(address);

    // Sync balance from chain in background (don't block response)
    getChainVaultBalance(address).then(chainBalance => {
      vaultService.syncBalanceFromChain(
        user.id,
        chainBalance.available,
        chainBalance.locked,
        BigInt(txResult!.height),
      ).catch(err => logger.warn({ err }, 'Background vault sync failed after deposit'));

      wsService.sendToAddress(address, {
        type: 'balance_updated',
        data: { available: chainBalance.available, locked: chainBalance.locked },
      });
    }).catch(err => logger.warn({ err }, 'Failed to sync balance after deposit'));

    return c.json({
      data: {
        status: 'confirmed',
        tx_hash: txHash,
        height: txResult.height,
        message: 'Deposit confirmed on chain.',
      },
    });
  } finally {
    releaseInflight(address);
  }
});

// POST /api/v1/vault/withdraw — Withdraw from vault (via relayer)
vaultRouter.post('/withdraw', authMiddleware, walletTxRateLimit, zValidator('json', WithdrawRequestSchema), async (c) => {
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

    // Sync DB from chain before locking (ensures DB reflects real chain state)
    await vaultService.syncBalanceFromChain(user.id, chainBalance.available, chainBalance.locked, 0n);

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

    // Success — invalidate cache first, then fetch fresh balance from chain
    invalidateBalanceCache(address);
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
