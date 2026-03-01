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
import { chainRest, chainRestPost } from '../lib/chain-fetch.js';
import { acquireInflight, releaseInflight } from '../lib/inflight-guard.js';
import { resolveGasGranter } from '../lib/gas-granter.js';

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
        const res = await chainRest(
          `/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${query}`,
        );
        if (!res.ok) return { available: '0', locked: '0' };
        const data = (await res.json()) as { data: { available: string; locked: string } };
        return data.data;
      } catch (err) {
        logger.warn({ err, address }, 'Failed to query chain vault balance, falling back to DB');
        return { available: '0', locked: '0' };
      }
    },
    30_000,
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

/**
 * Delay pending lock removal to let the chain REST API reflect the new state.
 * During this window the balance endpoint continues to subtract the pending lock
 * from chain-reported available, preventing a stale-data flash.
 *
 * Use this in SUCCESS paths only (bet confirmed on chain). Error paths should
 * call removePendingLock() immediately so funds appear unlocked right away.
 */
export function removePendingLockDelayed(address: string, lockId: string, delayMs = 5_000): void {
  setTimeout(() => {
    removePendingLock(address, lockId);
    invalidateBalanceCache(address);
  }, delayMs);
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
// Uses chain balance adjusted by:
//   1. Server-side pending locks (bets being created, not yet on-chain)
//   2. Off-chain spending (VIP, pins, announcements) tracked via offchain_spent
//   3. Bonus balance (raffle prizes, etc.)
vaultRouter.get('/balance', authMiddleware, async (c) => {
  const user = c.get('user');
  const address = c.get('address');

  // Fetch chain balance + DB offchain columns + open bet count in parallel
  const [chainBalance, offchain, dbOpenCount] = await Promise.all([
    getChainVaultBalance(address),
    vaultService.getOffchainBalances(user.id),
    betService.getOpenBetCountForUser(user.id),
  ]);

  let chainAvailable = BigInt(chainBalance.available);
  const chainLocked = BigInt(chainBalance.locked);

  // Subtract pending locks that chain hasn't reflected yet
  const pendingLockAmount = getTotalPendingLocks(address);
  if (pendingLockAmount > 0n) {
    chainAvailable = chainAvailable - pendingLockAmount;
    if (chainAvailable < 0n) chainAvailable = 0n;
  }

  // Account for off-chain spending (VIP, pins, announcements, sponsored raffles)
  // and bonus balance (prizes). offchain_spent is deducted from available first,
  // overflow goes to bonus — mirrors vaultService.getBalance() logic.
  const offchainSpent = BigInt(offchain.offchainSpent);
  const bonus = BigInt(offchain.bonus);

  let effectiveAvailable: bigint;
  let effectiveBonus: bigint;

  if (offchainSpent <= chainAvailable) {
    effectiveAvailable = chainAvailable - offchainSpent;
    effectiveBonus = bonus;
  } else {
    effectiveAvailable = 0n;
    const overflowFromBonus = offchainSpent - chainAvailable;
    effectiveBonus = bonus > overflowFromBonus ? bonus - overflowFromBonus : 0n;
  }

  const available = effectiveAvailable + effectiveBonus;
  const locked = chainLocked + pendingLockAmount;
  const total = available + locked;

  // Include server-side pending bet count
  const pendingBets = getPendingBetCount(user.id);

  // Sync chain balance to DB ONLY when no pending locks/bets exist.
  // During rapid bet creation/acceptance, lockFunds atomically decrements DB available.
  // If we sync stale chain values (chain hasn't confirmed the lock yet), we overwrite
  // the correct DB available with a higher chain value — allowing double-spending.
  if (pendingLockAmount === 0n && pendingBets === 0) {
    vaultService.syncBalanceFromChain(
      user.id,
      chainBalance.available,
      chainBalance.locked,
      0n,
    ).catch(err => logger.warn({ err }, 'Background vault sync failed'));
  }
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
      instruction: 'Sign this CW20 Send transaction via Keplr to deposit COIN tokens.',
    },
  });
});

/** Poll chain REST API for tx confirmation. */
async function pollTxConfirmation(txHash: string, maxPollMs = 30_000): Promise<{ code: number; rawLog: string; height: number } | null> {
  const pollStartTime = Date.now();
  const pollIntervalMs = 2_000;

  while (Date.now() - pollStartTime < maxPollMs) {
    await new Promise(r => setTimeout(r, pollIntervalMs));
    try {
      const txRes = await chainRest(`/cosmos/tx/v1beta1/txs/${txHash}`);
      if (txRes.ok) {
        const txData = await txRes.json() as {
          tx_response?: {
            code: number;
            raw_log?: string;
            height?: string;
          };
        };
        if (txData.tx_response) {
          return {
            code: txData.tx_response.code,
            rawLog: txData.tx_response.raw_log ?? '',
            height: Number(txData.tx_response.height ?? 0),
          };
        }
      }
    } catch {
      // Not yet indexed — keep polling
    }
  }

  return null;
}

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
      const balRes = await chainRest(
        `/cosmwasm/wasm/v1/contract/${env.LAUNCH_CW20_ADDR}/smart/${balQuery}`,
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
    const broadcastRes = await chainRestPost('/cosmos/tx/v1beta1/txs', {
      tx_bytes: txBytesBase64,
      mode: 'BROADCAST_MODE_SYNC',
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

    // ── Async mode: return 202 immediately, poll in background ──
    if (env.DEPOSIT_ASYNC_MODE === 'true') {
      // Release inflight guard immediately so the user can do other operations
      releaseInflight(address);

      // Background polling — fire-and-forget
      (async () => {
        try {
          const result = await pollTxConfirmation(txHash);
          if (!result) {
            logger.warn({ txHash, address }, 'Async deposit poll timeout — still in mempool');
            // Don't emit failure — tx may still confirm via indexer
            return;
          }
          if (result.code !== 0) {
            logger.error({ txHash, address, rawLog: result.rawLog }, 'Async deposit failed on chain');
            wsService.sendToAddress(address, {
              type: 'deposit_failed',
              data: { tx_hash: txHash, reason: result.rawLog },
            });
            return;
          }
          logger.info({ txHash, address, height: result.height }, 'Async deposit confirmed on chain');
          invalidateBalanceCache(address);
          const chainBalance = await getChainVaultBalance(address);
          await vaultService.syncBalanceFromChain(
            user.id,
            chainBalance.available,
            chainBalance.locked,
            BigInt(result.height),
          );
          wsService.sendToAddress(address, {
            type: 'deposit_confirmed',
            data: { tx_hash: txHash, height: result.height },
          });
          wsService.sendToAddress(address, {
            type: 'balance_updated',
            data: { available: chainBalance.available, locked: chainBalance.locked },
          });
        } catch (err) {
          logger.error({ err, txHash, address }, 'Async deposit background poll error');
        }
      })();

      return c.json({
        data: {
          status: 'pending',
          tx_hash: txHash,
          message: 'Transaction submitted. You will be notified when confirmed.',
        },
      }, 202);
    }

    // ── Sync mode (default): poll inline, return when confirmed ──
    const txResult = await pollTxConfirmation(txHash);

    if (!txResult) {
      // Tx is in mempool but not confirmed within 30s — spawn background poll
      // so we still invalidate cache + sync balance when it eventually confirms.
      logger.warn({ txHash, address }, 'Deposit tx poll timeout — continuing in background');

      (async () => {
        try {
          const result = await pollTxConfirmation(txHash, 90_000);
          if (!result) {
            logger.warn({ txHash, address }, 'Deposit background poll timeout (90s) — giving up');
            return;
          }
          if (result.code === 0) {
            logger.info({ txHash, address, height: result.height }, 'Deposit confirmed in background');
            invalidateBalanceCache(address);
            const chainBalance = await getChainVaultBalance(address);
            await vaultService.syncBalanceFromChain(
              user.id,
              chainBalance.available,
              chainBalance.locked,
              BigInt(result.height),
            );
            wsService.sendToAddress(address, {
              type: 'balance_updated',
              data: { available: chainBalance.available, locked: chainBalance.locked },
            });
          }
        } catch (err) {
          logger.error({ err, txHash, address }, 'Deposit background poll error');
        }
      })();

      return c.json({
        data: {
          status: 'pending',
          tx_hash: txHash,
          message: 'Transaction submitted but not yet confirmed. You will be notified when confirmed.',
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

    // Resolve gas granter (VIP → treasury, non-VIP → user)
    const granter = await resolveGasGranter(user.id, address);

    try {
      relayResult = await relayerService.relayWithdraw(address, amount, false, granter);
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

  // Fire-and-forget: sweep user's offchain_spent to treasury in background
  vaultService.getOffchainBalances(user.id).then(async ({ offchainSpent }) => {
    if (BigInt(offchainSpent) <= 0n) return;
    try {
      const { treasurySweepService } = await import('../services/treasury-sweep.service.js');
      await treasurySweepService.sweepSingleUser(user.id, address, offchainSpent);
    } catch (err) {
      logger.warn({ err, userId: user.id }, 'Auto-sweep after withdrawal failed (non-critical)');
    }
  }).catch(() => {});

  return c.json({
    data: {
      status: 'confirmed',
      amount,
      tx_hash: relayResult.txHash,
      message: 'Withdrawal confirmed on chain.',
    },
  });
});
