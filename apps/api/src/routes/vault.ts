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
import { env, getActiveContractAddr, isAxmMode } from '../config/env.js';
import type { AppEnv } from '../types.js';
import type { RelayResult } from '../services/relayer.js';
import { getPendingBetCount } from '../lib/pending-counts.js';
import { betService } from '../services/bet.service.js';
import { chainCached, invalidateChainCache } from '../lib/chain-cache.js';
import { chainRest, chainRestPost } from '../lib/chain-fetch.js';
import { acquireInflight, releaseInflight } from '../lib/inflight-guard.js';
import { resolveGasGranter } from '../lib/gas-granter.js';
import { vaultTransactions } from '@coinflip/db/schema';

// ─── Legacy no-ops (kept as stubs so callers don't break during migration) ──
// These are intentionally empty — the pendingLocks system is removed.
// TODO: clean up callers and delete these stubs.
export function addPendingLock(_address: string, _amount: string): string { return ''; }
export function removePendingLock(_address: string, _lockId: string): void {}
export function removePendingLockDelayed(_address: string, _lockId: string, _delayMs?: number): void {}
export function clearPendingLocks(_address: string): void {}
export function getTotalPendingLocks(_address: string): bigint { return 0n; }
export function invalidateBalanceCache(address: string): void { invalidateChainCache('vault:' + address); }

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
          `/cosmwasm/wasm/v1/contract/${getActiveContractAddr()}/smart/${query}`,
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

// GET /api/v1/vault/balance — Get balance (auth required)
// Simple: always read from DB. Chain syncs happen in background after tx confirmation.
// lockFunds/unlockFunds atomically update DB — always correct, no timing heuristics.
vaultRouter.get('/balance', authMiddleware, async (c) => {
  const user = c.get('user');

  const [coinBalance, dbOpenCount, dbBalance, pendingBets] = await Promise.all([
    vaultService.getCoinBalance(user.id),
    betService.getOpenBetCountForUser(user.id),
    vaultService.getBalance(user.id),
    Promise.resolve(getPendingBetCount(user.id)),
  ]);

  const available = BigInt(dbBalance.available);
  const locked = BigInt(dbBalance.locked);
  const total = available + locked;
  const openBetsCount = dbOpenCount + pendingBets;

  return c.json({
    data: {
      available: available.toString(),
      locked: locked.toString(),
      total: total.toString(),
      coin_balance: coinBalance,
      pending_bets: pendingBets,
      open_bets_count: openBetsCount,
    },
  });
});

// POST /api/v1/vault/deposit — Returns unsigned payload for deposit
// COIN mode: CW20 Send to contract. AXM mode: native MsgExecuteContract + Deposit with funds.
vaultRouter.post('/deposit', authMiddleware, zValidator('json', DepositRequestSchema), async (c) => {
  const { amount } = c.req.valid('json');

  if (isAxmMode()) {
    // AXM mode: execute Deposit {} on native contract with attached native funds
    const contractAddr = getActiveContractAddr();
    return c.json({
      data: {
        contract: contractAddr,
        msg: { deposit: {} },
        funds: [{ denom: env.AXM_DENOM, amount }],
        amount,
        mode: 'native',
        instruction: 'Sign this MsgExecuteContract to deposit AXM tokens.',
      },
    });
  }

  // COIN mode: CW20 Send
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
      mode: 'cw20',
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
const DepositBroadcastSchema = z.object({ tx_bytes: z.string().min(1).max(100_000), amount: z.string().optional() });
vaultRouter.post('/deposit/broadcast', authMiddleware, zValidator('json', DepositBroadcastSchema), async (c) => {
  const user = c.get('user');
  const address = c.get('address');

  const { tx_bytes: txBytesBase64, amount: depositAmount } = c.req.valid('json');

  // Pre-flight: verify user's wallet balance before broadcasting.
  // This prevents wasting gas on a tx that will fail due to insufficient balance.
  try {
    if (isAxmMode()) {
      // AXM mode: check native bank balance
      const balRes = await chainRest(
        `/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=${env.AXM_DENOM}`,
      );
      if (balRes.ok) {
        const balData = await balRes.json() as { balance: { amount: string } };
        const nativeBalance = BigInt(balData.balance?.amount ?? '0');
        if (nativeBalance === 0n) {
          throw Errors.insufficientBalance('deposit amount', '0 (wallet AXM balance is empty)');
        }
      }
    } else if (env.LAUNCH_CW20_ADDR) {
      // COIN mode: check CW20 balance
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
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn({ err, address }, 'Balance pre-check failed, proceeding with broadcast');
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
          const result = await pollTxConfirmation(txHash, 60_000);
          if (!result) {
            logger.warn({ txHash, address }, 'Async deposit poll timeout (60s) — notifying client');
            wsService.sendToAddress(address, {
              type: 'deposit_failed',
              data: { tx_hash: txHash, reason: 'Transaction confirmation timed out. Please check your balance.' },
            });
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
          // Log deposit to vault_transactions
          if (depositAmount) {
            const db = (await import('../lib/db.js')).getDb();
            await db.insert(vaultTransactions).values({
              userId: user.id, type: 'deposit', amount: depositAmount, txHash, status: 'confirmed',
            }).catch(e => logger.warn({ e }, 'Failed to log deposit transaction'));
          }
          // Credit deposited amount atomically (never overwrites concurrent lockFunds)
          if (depositAmount) {
            await vaultService.creditWinnings(user.id, depositAmount);
          }
          invalidateChainCache('vault:' + address);
          const dbBal = await vaultService.getBalance(user.id);
          wsService.sendToAddress(address, {
            type: 'deposit_confirmed',
            data: { tx_hash: txHash, height: result.height },
          });
          wsService.sendToAddress(address, {
            type: 'balance_updated',
            data: { available: dbBal.available, locked: dbBal.locked },
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
            if (depositAmount) {
              await vaultService.creditWinnings(user.id, depositAmount);
            }
            invalidateChainCache('vault:' + address);
            const dbBal = await vaultService.getBalance(user.id);
            wsService.sendToAddress(address, {
              type: 'balance_updated',
              data: { available: dbBal.available, locked: dbBal.locked },
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
    // Log deposit to vault_transactions
    if (depositAmount) {
      const db = (await import('../lib/db.js')).getDb();
      await db.insert(vaultTransactions).values({
        userId: user.id, type: 'deposit', amount: depositAmount, txHash, status: 'confirmed',
      }).catch(e => logger.warn({ e }, 'Failed to log deposit transaction'));
    }
    invalidateChainCache('vault:' + address);

    // Credit deposit atomically in background (don't block response)
    (async () => {
      try {
        if (depositAmount) {
          await vaultService.creditWinnings(user.id, depositAmount);
        }
        invalidateChainCache('vault:' + address);
        const dbBal = await vaultService.getBalance(user.id);
        wsService.sendToAddress(address, {
          type: 'balance_updated',
          data: { available: dbBal.available, locked: dbBal.locked },
        });
      } catch (err) {
        logger.warn({ err }, 'Failed to credit deposit');
      }
    })();

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

    // Atomically lock funds in DB to prevent double-withdraw
    const locked = await vaultService.lockFunds(user.id, amount);
    if (!locked) {
      throw Errors.insufficientBalance(amount, '0');
    }

    // Resolve gas granter (VIP → treasury, non-VIP → user)
    const granter = await resolveGasGranter(user.id, address);

    try {
      // Use async mode: broadcastTxSync returns tx hash instantly from mempool
      relayResult = await relayerService.relayWithdraw(address, amount, true, granter);
    } catch (err) {
      // Relay failed — unlock funds
      await vaultService.unlockFunds(user.id, amount).catch(e =>
        logger.warn({ err: e }, 'Failed to unlock funds after withdraw relay error'));
      throw err;
    }

    if (!relayResult.success) {
      // CheckTx rejected — unlock funds
      await vaultService.unlockFunds(user.id, amount).catch(e =>
        logger.warn({ err: e }, 'Failed to unlock funds after withdraw chain error'));
      logger.error({ relayResult, address, amount }, 'Withdraw relay failed');
      throwRelayError(relayResult);
    }

    const txHash = relayResult.txHash ?? '';
    logger.info({ txHash, address, amount }, 'Withdraw tx in mempool — returning 202');
  } finally {
    releaseInflight(address);
  }

  const txHash = relayResult.txHash ?? '';

  // Background: poll for confirmation, sync balance, notify via WS
  (async () => {
    try {
      const result = await pollTxConfirmation(txHash, 60_000);
      if (!result) {
        logger.warn({ txHash, address }, 'Withdraw poll timeout (60s)');
        // Unlock funds since we can't confirm
        await vaultService.unlockFunds(user.id, amount).catch(() => {});
        wsService.sendToAddress(address, {
          type: 'withdraw_failed',
          data: { tx_hash: txHash, reason: 'Transaction confirmation timed out.' },
        });
        return;
      }
      if (result.code !== 0) {
        logger.error({ txHash, address, rawLog: result.rawLog }, 'Withdraw failed on chain');
        await vaultService.unlockFunds(user.id, amount).catch(() => {});
        wsService.sendToAddress(address, {
          type: 'withdraw_failed',
          data: { tx_hash: txHash, reason: result.rawLog },
        });
        return;
      }

      // Confirmed — log + sync balance
      logger.info({ txHash, address, height: result.height }, 'Withdraw confirmed on chain');
      // Log withdrawal to vault_transactions
      {
        const db = (await import('../lib/db.js')).getDb();
        await db.insert(vaultTransactions).values({
          userId: user.id, type: 'withdraw', amount, txHash, status: 'confirmed',
        }).catch(e => logger.warn({ e }, 'Failed to log withdraw transaction'));
      }
      // Forfeit locked funds (consumed by withdrawal — no restore to available)
      await vaultService.forfeitLocked(user.id, amount);
      invalidateChainCache('vault:' + address);
      const dbBal = await vaultService.getBalance(user.id);
      wsService.sendToAddress(address, {
        type: 'withdraw_confirmed',
        data: { tx_hash: txHash, height: result.height, amount },
      });
      wsService.sendToAddress(address, {
        type: 'balance_updated',
        data: { available: dbBal.available, locked: dbBal.locked },
      });

      // Sweep offchain_spent in background
      const { offchainSpent } = await vaultService.getOffchainBalances(user.id);
      if (BigInt(offchainSpent) > 0n) {
        const { treasurySweepService } = await import('../services/treasury-sweep.service.js');
        await treasurySweepService.sweepSingleUser(user.id, address, offchainSpent);
      }
    } catch (err) {
      logger.error({ err, txHash, address }, 'Withdraw background poll error');
    }
  })();

  return c.json({
    data: {
      status: 'pending',
      amount,
      tx_hash: txHash,
      message: 'Withdrawal submitted. You will be notified when confirmed.',
    },
  }, 202);
});
