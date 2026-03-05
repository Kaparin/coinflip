import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { referralService, ReferralService } from '../services/referral.service.js';
import { treasuryService } from '../services/treasury.service.js';
import { configService } from '../services/config.service.js';
import { vaultService } from '../services/vault.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { getChainVaultBalance, invalidateBalanceCache } from './vault.js';
import { relayerService } from '../services/relayer.js';
import { Errors } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { env, getActiveContractAddr, isAxmMode } from '../config/env.js';
import { walletTxRateLimit } from '../middleware/rate-limit.js';
import { getDb } from '../lib/db.js';
import { treasuryLedger } from '@coinflip/db/schema';
import type { AppEnv } from '../types.js';

// Inflight guard for claim/change-branch operations (prevents concurrent chain txs)
const claimInflight = new Set<string>();

export const referralRouter = new Hono<AppEnv>();

// GET /api/v1/referral/platform-stats — Public: treasury vault balance + total referral paid (for transparency)
referralRouter.get('/platform-stats', async (c) => {
  try {
    const [balance, totalReferralPaid] = await Promise.all([
      treasuryService.getBalance(),
      referralService.getTotalReferralPaid(),
    ]);
    return c.json({
      data: {
        treasuryVaultAvailable: balance.vaultAvailable,
        treasuryVaultLocked: balance.vaultLocked,
        totalReferralPaid,
      },
    });
  } catch (err) {
    logger.warn({ err }, 'Referral platform-stats failed');
    return c.json({
      data: {
        treasuryVaultAvailable: '0',
        treasuryVaultLocked: '0',
        totalReferralPaid: '0',
      },
    }, 503);
  }
});

// GET /api/v1/referral/config — Public: referral reward config (dynamic from platform_config)
referralRouter.get('/config', async (c) => {
  const config = await referralService.getPublicConfig();
  return c.json({ data: config });
});

// GET /api/v1/referral/public-stats — Public: referral counters for a wallet address (no earnings)
referralRouter.get('/public-stats', async (c) => {
  const address = c.req.query('address')?.trim().toLowerCase();
  if (!address || !address.startsWith('axm1')) {
    return c.json({ data: null }, 400);
  }
  const stats = await referralService.getPublicStats(address);
  return c.json({ data: stats });
});

// GET /api/v1/referral/code — Get or create referral code
referralRouter.get('/code', authMiddleware, async (c) => {
  const userId = c.get('user').id;
  const code = await referralService.getOrCreateCode(userId);
  return c.json({ data: { code } });
});

// POST /api/v1/referral/register — Register a referral code
const RegisterSchema = z.object({ code: z.string().min(1).max(20) });

referralRouter.post('/register', authMiddleware, walletTxRateLimit, zValidator('json', RegisterSchema), async (c) => {
  const userId = c.get('user').id;
  const { code } = c.req.valid('json');
  const result = await referralService.registerReferral(userId, code);

  if (!result.success) {
    const messages: Record<string, string> = {
      INVALID_CODE: 'Invalid referral code',
      SELF_REFERRAL: 'Cannot refer yourself',
      ALREADY_HAS_REFERRER: 'You already have a referrer',
      WOULD_CREATE_CYCLE: 'This referral would create a circular chain',
    };
    return c.json({
      error: { code: result.reason, message: messages[result.reason!] ?? 'Failed to register' },
    }, 400);
  }
  return c.json({ data: { registered: true } });
});

// POST /api/v1/referral/register-by-address — Register referral by wallet address
const RegisterByAddressSchema = z.object({ address: z.string().min(1).max(100) });

referralRouter.post('/register-by-address', authMiddleware, walletTxRateLimit, zValidator('json', RegisterByAddressSchema), async (c) => {
  const userId = c.get('user').id;
  const { address } = c.req.valid('json');
  const result = await referralService.registerByAddress(userId, address);

  if (!result.success) {
    const messages: Record<string, string> = {
      USER_NOT_FOUND: 'User with this address not found in the system',
      SELF_REFERRAL: 'Cannot refer yourself',
      ALREADY_HAS_REFERRER: 'You already have a referrer',
    };
    return c.json({
      error: { code: result.reason, message: messages[result.reason!] ?? 'Failed to register' },
    }, 400);
  }
  return c.json({ data: { registered: true } });
});

// GET /api/v1/referral/check-referrer — Public: check if a wallet address already has a referrer
// No auth required — this is not sensitive data (only returns a boolean).
// Used by the connect-wallet modal to decide whether to show the "Who invited you?" field.
referralRouter.get('/check-referrer', async (c) => {
  const address = c.req.query('address')?.trim().toLowerCase();
  if (!address || !address.startsWith('axm1') || address.length < 10) {
    return c.json({ data: { has_referrer: false } });
  }
  const hasRef = await referralService.hasReferrerByAddress(address);
  return c.json({ data: { has_referrer: hasRef } });
});

// GET /api/v1/referral/has-referrer — Check if current user has a referrer
referralRouter.get('/has-referrer', authMiddleware, async (c) => {
  const userId = c.get('user').id;
  const hasRef = await referralService.hasReferrer(userId);
  const current = hasRef ? await referralService.getCurrentReferrer(userId) : null;
  return c.json({ data: { has_referrer: hasRef, referrer: current } });
});

// POST /api/v1/referral/change-branch — Change referral branch (paid fee)
//
// Off-chain payment flow (instant, no chain transactions):
//   1. Validate (target exists, no self-ref, no cycles)
//   2. Deduct fee from user's vault balance via offchainSpent
//   3. Record in treasury_ledger
//   4. Update referral chain in DB
const ChangeBranchSchema = z.object({ address: z.string().min(1).max(100) });

referralRouter.post('/change-branch', authMiddleware, zValidator('json', ChangeBranchSchema), async (c) => {
  const userId = c.get('user').id;
  const walletAddress = c.get('address');
  const { address: newReferrerAddr } = c.req.valid('json');
  const cost = await ReferralService.getChangeBranchCost();

  // Inflight guard — prevent concurrent branch changes
  const branchKey = `branch:${userId}`;
  if (claimInflight.has(branchKey)) {
    return c.json({ error: { code: 'ACTION_IN_PROGRESS', message: 'Branch change is already being processed.' } }, 429);
  }
  claimInflight.add(branchKey);

  try {

  // Step 1: Validate the branch change (cycles, self-referral, target exists)
  const validation = await referralService.validateBranchChange(userId, newReferrerAddr);
  if (!validation.valid) {
    const messages: Record<string, string> = {
      USER_NOT_FOUND: 'User with this address not found in the system',
      SELF_REFERRAL: 'Cannot refer yourself',
      WOULD_CREATE_CYCLE: 'This change would create a circular referral chain',
    };
    return c.json({
      error: { code: validation.reason, message: messages[validation.reason!] ?? 'Failed to change branch' },
    }, 400);
  }

  // Step 2: Deduct fee from vault balance (off-chain, instant)
  const deducted = await vaultService.deductBalance(userId, cost);
  if (!deducted) {
    return c.json({
      error: {
        code: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient balance to change branch.',
      },
    }, 400);
  }

  // Step 3: Record in treasury ledger
  try {
    await getDb().insert(treasuryLedger).values({
      txhash: `branch_change:${userId}:${Date.now()}`,
      amount: cost,
      source: 'branch_change_fee',
    });
  } catch (ledgerErr) {
    logger.warn({ err: ledgerErr, userId, cost }, 'Branch change: treasury_ledger insert failed (non-critical)');
  }

  // Step 4: Update the referral chain in DB
  await referralService.executeBranchChange(userId, newReferrerAddr);

  invalidateBalanceCache(walletAddress);
  logger.info(
    { userId, walletAddress, newReferrer: newReferrerAddr, cost },
    'Branch changed with off-chain payment',
  );

  return c.json({
    data: {
      changed: true,
      cost,
    },
  });

  } finally {
    claimInflight.delete(branchKey);
  }
});

// GET /api/v1/referral/stats — Get referral stats
referralRouter.get('/stats', authMiddleware, async (c) => {
  const userId = c.get('user').id;
  const [stats, balance] = await Promise.all([
    referralService.getStats(userId),
    referralService.getBalance(userId),
  ]);
  return c.json({ data: { ...stats, balance } });
});

// GET /api/v1/referral/balance — Get referral balance
referralRouter.get('/balance', authMiddleware, async (c) => {
  const userId = c.get('user').id;
  const balance = await referralService.getBalance(userId);
  return c.json({ data: balance });
});

// POST /api/v1/referral/claim — Claim referral rewards via on-chain transfer
//
// Full on-chain transfer flow:
//   1. Atomically zero out unclaimed balance in DB (CAS)
//   2. Treasury withdraws from coinflip contract vault → CW20 tokens to treasury wallet
//   3. Treasury transfers CW20 tokens to user's wallet
//   4. On failure: rollback DB claim
//
// The user receives CW20 tokens in their WALLET (not vault).
// They can deposit into vault to bet, or keep in wallet.
referralRouter.post('/claim', authMiddleware, async (c) => {
  const userId = c.get('user').id;
  const address = c.get('address');

  // Inflight guard — prevent double-claim from rapid clicks
  const claimKey = `claim:${userId}`;
  if (claimInflight.has(claimKey)) {
    return c.json({ error: { code: 'ACTION_IN_PROGRESS', message: 'Claim is already being processed.' } }, 429);
  }
  claimInflight.add(claimKey);

  let amount: string | null = null;
  try {
  // Step 0: Check minimum claim threshold
  const balance = await referralService.getBalance(userId);
  const minimumClaimMicro = await configService.getNumber('MINIMUM_CLAIM_AMOUNT_MICRO', 10_000_000);
  if (BigInt(balance.unclaimed) < BigInt(minimumClaimMicro)) {
    const minCoin = (minimumClaimMicro / 1_000_000).toString();
    return c.json({
      error: {
        code: 'BELOW_MINIMUM_CLAIM',
        message: `Minimum claim amount is ${minCoin} COIN. Keep playing to accumulate more rewards.`,
      },
    }, 400);
  }

  // Step 1: Atomically zero out unclaimed balance in DB
  amount = await referralService.claimRewards(userId);

  if (!amount) {
    return c.json({ error: { code: 'NOTHING_TO_CLAIM', message: 'No unclaimed rewards' } }, 400);
  }

  // Step 2: On-chain transfer from treasury vault → user wallet
  const treasuryAddr = env.TREASURY_ADDRESS;
  const cw20Addr = env.LAUNCH_CW20_ADDR;

  if (!treasuryAddr || (!isAxmMode() && !cw20Addr)) {
    await referralService.rollbackClaim(userId, amount);
    logger.error({ userId, amount }, 'Referral claim: TREASURY_ADDRESS or LAUNCH_CW20_ADDR not configured');
    return c.json({
      error: { code: 'CONFIG_ERROR', message: 'Service is not properly configured for claims. Please try again later.' },
    }, 500);
  }

  if (!relayerService.isReady()) {
    await referralService.rollbackClaim(userId, amount);
    throw Errors.relayerNotReady();
  }

  // Step 2a: Pre-check treasury vault balance (avoid wasting gas on hopeless tx)
  try {
    const treasuryBalance = await getChainVaultBalance(treasuryAddr);
    if (BigInt(treasuryBalance.available) < BigInt(amount)) {
      await referralService.rollbackClaim(userId, amount);
      logger.error(
        { userId, amount, treasuryAvailable: treasuryBalance.available, treasuryAddr },
        'Referral claim: treasury vault has insufficient balance',
      );
      return c.json({
        error: { code: 'INSUFFICIENT_TREASURY', message: 'Rewards pool is temporarily low. Please try again later.' },
      }, 503);
    }
  } catch (err) {
    logger.warn({ err, treasuryAddr }, 'Referral claim: failed to pre-check treasury balance — proceeding anyway');
  }

  // Step 2b: Treasury withdraws tokens from coinflip contract vault
  const withdrawResult = await relayerService.relayWithdraw(treasuryAddr, amount);
  if (!withdrawResult.success) {
    // Withdraw failed — rollback DB claim
    await referralService.rollbackClaim(userId, amount);
    logger.error({ withdrawResult, userId, amount, treasuryAddr }, 'Referral claim: treasury withdraw failed');
    return c.json({
      error: {
        code: 'CHAIN_TX_FAILED',
        message: 'Failed to process claim. Please try again.',
        details: { txHash: withdrawResult.txHash },
      },
    }, 422);
  }

  logger.info({ txHash: withdrawResult.txHash, amount, treasuryAddr }, 'Referral claim: treasury withdraw confirmed');

  // Step 2c: Transfer tokens from treasury wallet → user wallet
  let transferResult;
  if (isAxmMode()) {
    // AXM mode: native MsgSend from treasury (relayer) wallet to user
    transferResult = await relayerService.relayNativeSend(
      address,
      amount,
      env.AXM_DENOM,
      'CoinFlip referral reward',
    );
  } else {
    // COIN mode: CW20 transfer from treasury wallet to user
    transferResult = await relayerService.relayCw20Transfer(
      treasuryAddr,
      cw20Addr,
      address,
      amount,
      'CoinFlip referral reward',
    );
  }

  if (!transferResult.success) {
    // Transfer failed — tokens are in treasury wallet but user didn't receive.
    // Try to re-deposit tokens back to treasury vault to restore the original state.
    logger.error(
      { transferResult, userId, amount, from: treasuryAddr, to: address },
      'Referral claim: CW20 transfer to user FAILED — attempting to re-deposit to vault',
    );

    // Best-effort: re-deposit tokens back to treasury vault via CW20 Send
    try {
      const reDepositResult = isAxmMode()
        ? await relayerService.submitExecOnContract(
            treasuryAddr,
            getActiveContractAddr(),
            { deposit: {} },
            'CoinFlip referral claim refund',
            [{ denom: env.AXM_DENOM, amount }],
          )
        : await relayerService.submitExecOnContract(
            treasuryAddr,
            cw20Addr,
            { send: { contract: getActiveContractAddr(), amount, msg: btoa(JSON.stringify({ deposit: {} })) } },
            'CoinFlip referral claim refund',
          );
      if (reDepositResult.success) {
        logger.info({ txHash: reDepositResult.txHash, amount, treasuryAddr }, 'Referral claim: tokens re-deposited to treasury vault');
      } else {
        logger.error(
          { reDepositResult, amount, treasuryAddr },
          'Referral claim: re-deposit FAILED — tokens remain in treasury wallet, needs manual resolution',
        );
      }
    } catch (reDepositErr) {
      logger.error(
        { err: reDepositErr, amount, treasuryAddr },
        'Referral claim: re-deposit threw — tokens remain in treasury wallet, needs manual resolution',
      );
    }

    // Rollback DB claim so user can try again
    await referralService.rollbackClaim(userId, amount);

    return c.json({
      error: {
        code: 'TRANSFER_FAILED',
        message: 'Failed to transfer rewards. Your balance has been restored. Please try again later.',
        details: { withdrawTx: withdrawResult.txHash, amount },
      },
    }, 422);
  }

  logger.info(
    { txHash: transferResult.txHash, userId, amount, from: treasuryAddr, to: address },
    'Referral claim: CW20 transfer to user confirmed',
  );

  // Record in treasury ledger for audit trail
  try {
    await getDb().insert(treasuryLedger).values({
      txhash: transferResult.txHash ?? '',
      amount: `-${amount}`,
      source: 'referral_payout',
    });
  } catch (ledgerErr) {
    logger.warn({ err: ledgerErr, userId, amount }, 'Referral claim: treasury_ledger insert failed (non-critical)');
  }

  invalidateBalanceCache(address);
  invalidateBalanceCache(treasuryAddr);

  return c.json({
    data: {
      claimed: amount,
      withdraw_tx: withdrawResult.txHash,
      transfer_tx: transferResult.txHash,
    },
  });

  } catch (err) {
    // Catch-all: if any unhandled exception occurs after claimRewards zeroed the balance,
    // rollback so the user can retry.
    if (amount) {
      await referralService.rollbackClaim(userId, amount).catch(rollbackErr =>
        logger.error({ err: rollbackErr, userId, amount }, 'Referral claim: rollback failed after unhandled error'));
    }
    throw err;
  } finally {
    claimInflight.delete(claimKey);
  }
});

// GET /api/v1/referral/rewards — Reward history (paginated)
referralRouter.get('/rewards', authMiddleware, async (c) => {
  const userId = c.get('user').id;
  const limit = Math.min(Number(c.req.query('limit') || 20), 50);
  const offset = Math.max(Number(c.req.query('offset') || 0), 0);
  const rewards = await referralService.getRewardHistory(userId, limit, offset);
  return c.json({ data: rewards });
});

// GET /api/v1/referral/invites — Direct referral list
referralRouter.get('/invites', authMiddleware, async (c) => {
  const userId = c.get('user').id;
  const invites = await referralService.getDirectReferrals(userId);
  return c.json({ data: invites });
});
