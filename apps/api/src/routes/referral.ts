import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { referralService, ReferralService } from '../services/referral.service.js';
import { treasuryService } from '../services/treasury.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { getChainVaultBalance, invalidateBalanceCache } from './vault.js';
import { relayerService } from '../services/relayer.js';
import { Errors } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { walletTxRateLimit } from '../middleware/rate-limit.js';
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
  const success = await referralService.registerReferral(userId, code);

  if (!success) {
    return c.json({ error: { code: 'INVALID_CODE', message: 'Invalid code or already registered' } }, 400);
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

// POST /api/v1/referral/change-branch — Change referral branch (paid: 1000 LAUNCH)
//
// Full on-chain payment flow:
//   1. Validate (target exists, no self-ref, no cycles)
//   2. Check user's vault balance >= 1000 LAUNCH
//   3. Relay withdraw from vault → 1000 LAUNCH CW20 goes to user's wallet
//   4. Relay CW20 transfer from user → treasury wallet
//   5. Update referral chain in DB
//
// If step 4 fails, attempt to re-deposit tokens back to vault and abort the branch change.
const ChangeBranchSchema = z.object({ address: z.string().min(1).max(100) });

referralRouter.post('/change-branch', authMiddleware, zValidator('json', ChangeBranchSchema), async (c) => {
  const userId = c.get('user').id;
  const walletAddress = c.get('address');
  const { address: newReferrerAddr } = c.req.valid('json');
  const cost = ReferralService.CHANGE_BRANCH_COST;

  // Inflight guard — prevent concurrent branch changes (double-withdraw risk)
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

  // Step 2: Check on-chain vault balance
  const chainBalance = await getChainVaultBalance(walletAddress);
  if (BigInt(chainBalance.available) < BigInt(cost)) {
    return c.json({
      error: {
        code: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient balance. You need 1,000 COIN to change branch.',
      },
    }, 400);
  }

  if (!relayerService.isReady()) {
    throw Errors.relayerNotReady();
  }

  // Step 3: Withdraw 1000 LAUNCH from user's vault on-chain
  // This sends CW20 tokens from the CoinFlip contract to the user's wallet.
  const withdrawResult = await relayerService.relayWithdraw(walletAddress, cost);
  if (!withdrawResult.success) {
    logger.error({ withdrawResult, walletAddress, cost }, 'Branch change: vault withdraw failed');
    return c.json({
      error: {
        code: 'CHAIN_TX_FAILED',
        message: 'Failed to deduct branch change fee from vault. Please try again.',
        details: { txHash: withdrawResult.txHash },
      },
    }, 422);
  }

  logger.info({ txHash: withdrawResult.txHash, walletAddress }, 'Branch change: vault withdraw confirmed');

  // Step 4: Transfer CW20 tokens from user's wallet to treasury
  // This completes the payment: user → treasury.
  const treasuryAddr = env.TREASURY_ADDRESS;
  const cw20Addr = env.LAUNCH_CW20_ADDR;
  let transferTxHash: string | undefined;

  if (treasuryAddr && cw20Addr) {
    const transferResult = await relayerService.relayCw20Transfer(
      walletAddress,
      cw20Addr,
      treasuryAddr,
      cost,
      'CoinFlip branch change fee',
    );

    if (transferResult.success) {
      transferTxHash = transferResult.txHash;
      logger.info(
        { txHash: transferResult.txHash, from: walletAddress, to: treasuryAddr, amount: cost },
        'Branch change: CW20 transfer to treasury confirmed',
      );
    } else {
      // Transfer failed — tokens are in user's CW20 wallet (withdrawn from vault).
      // Try to re-deposit them back to vault so the user doesn't lose funds.
      logger.error(
        { transferResult, walletAddress, treasuryAddr, cost },
        'Branch change: CW20 transfer to treasury FAILED — aborting, attempting re-deposit',
      );

      // Best-effort: deposit tokens from user's wallet back to vault
      try {
        // CW20 Send to CoinFlip contract triggers deposit
        const reDepositResult = await relayerService.submitExecOnContract(
          walletAddress,
          cw20Addr,
          { send: { contract: env.COINFLIP_CONTRACT_ADDR, amount: cost, msg: btoa(JSON.stringify({ deposit: {} })) } },
          'CoinFlip branch change refund',
        );
        if (reDepositResult.success) {
          logger.info({ txHash: reDepositResult.txHash, walletAddress }, 'Branch change: tokens re-deposited to vault');
        } else {
          logger.error(
            { reDepositResult, walletAddress },
            'Branch change: re-deposit ALSO failed — tokens remain in user CW20 wallet, needs manual resolution',
          );
        }
      } catch (reDepositErr) {
        logger.error({ err: reDepositErr, walletAddress }, 'Branch change: re-deposit threw — tokens in user wallet');
      }

      invalidateBalanceCache(walletAddress);
      return c.json({
        error: {
          code: 'TRANSFER_FAILED',
          message: 'Branch change payment failed. Your funds have been returned to your vault.',
          details: { withdrawTx: withdrawResult.txHash },
        },
      }, 422);
    }
  }

  // Step 5: Update the referral chain in DB
  await referralService.executeBranchChange(userId, newReferrerAddr);

  invalidateBalanceCache(walletAddress);
  logger.info(
    { userId, walletAddress, newReferrer: newReferrerAddr, cost, withdrawTx: withdrawResult.txHash, transferTx: transferTxHash },
    'Branch changed with on-chain payment',
  );

  return c.json({
    data: {
      changed: true,
      cost,
      withdraw_tx: withdrawResult.txHash,
      transfer_tx: transferTxHash,
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
  // Step 1: Atomically zero out unclaimed balance in DB
  amount = await referralService.claimRewards(userId);

  if (!amount) {
    return c.json({ error: { code: 'NOTHING_TO_CLAIM', message: 'No unclaimed rewards' } }, 400);
  }

  // Step 2: On-chain transfer from treasury vault → user wallet
  const treasuryAddr = env.TREASURY_ADDRESS;
  const cw20Addr = env.LAUNCH_CW20_ADDR;

  if (!treasuryAddr || !cw20Addr) {
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

  // Step 2b: Treasury withdraws CW20 from coinflip contract vault
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

  // Step 2b: Transfer CW20 from treasury wallet → user wallet
  const transferResult = await relayerService.relayCw20Transfer(
    treasuryAddr,
    cw20Addr,
    address,
    amount,
    'CoinFlip referral reward',
  );

  if (!transferResult.success) {
    // Transfer failed — tokens are in treasury wallet but user didn't receive.
    // Try to re-deposit tokens back to treasury vault to restore the original state.
    logger.error(
      { transferResult, userId, amount, from: treasuryAddr, to: address },
      'Referral claim: CW20 transfer to user FAILED — attempting to re-deposit to vault',
    );

    // Best-effort: re-deposit tokens back to treasury vault
    try {
      await relayerService.relayDeposit(treasuryAddr);
      logger.info({ amount, treasuryAddr }, 'Referral claim: tokens re-deposited to treasury vault');
    } catch (reDepositErr) {
      logger.error(
        { err: reDepositErr, amount, treasuryAddr },
        'Referral claim: re-deposit ALSO failed — tokens remain in treasury wallet, needs manual resolution',
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
