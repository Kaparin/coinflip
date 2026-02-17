import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { referralService, ReferralService } from '../services/referral.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { getChainVaultBalance, invalidateBalanceCache } from './vault.js';
import { relayerService } from '../services/relayer.js';
import { Errors } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types.js';

export const referralRouter = new Hono<AppEnv>();

// GET /api/v1/referral/code — Get or create referral code
referralRouter.get('/code', authMiddleware, async (c) => {
  const userId = c.get('user').id;
  const code = await referralService.getOrCreateCode(userId);
  return c.json({ data: { code } });
});

// POST /api/v1/referral/register — Register a referral code
const RegisterSchema = z.object({ code: z.string().min(1).max(20) });

referralRouter.post('/register', authMiddleware, zValidator('json', RegisterSchema), async (c) => {
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

referralRouter.post('/register-by-address', authMiddleware, zValidator('json', RegisterByAddressSchema), async (c) => {
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
// If step 4 fails, the user still paid (vault decreased) but treasury didn't receive.
// This is logged but the branch change still proceeds — the fee was charged from vault.
const ChangeBranchSchema = z.object({ address: z.string().min(1).max(100) });

referralRouter.post('/change-branch', authMiddleware, zValidator('json', ChangeBranchSchema), async (c) => {
  const userId = c.get('user').id;
  const walletAddress = c.get('address');
  const { address: newReferrerAddr } = c.req.valid('json');
  const cost = ReferralService.CHANGE_BRANCH_COST;

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
        message: 'Insufficient balance. You need 1,000 LAUNCH to change branch.',
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
      // Transfer failed — vault was already deducted, tokens are in user's CW20 wallet.
      // Log the failure but still proceed with the branch change (user paid from vault).
      logger.error(
        { transferResult, walletAddress, treasuryAddr, cost },
        'Branch change: CW20 transfer to treasury FAILED — tokens remain in user wallet',
      );
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

// POST /api/v1/referral/claim — Claim referral rewards to vault
referralRouter.post('/claim', authMiddleware, async (c) => {
  const userId = c.get('user').id;
  const address = c.get('address');
  const amount = await referralService.claimRewards(userId);

  if (!amount) {
    return c.json({ error: { code: 'NOTHING_TO_CLAIM', message: 'No unclaimed rewards' } }, 400);
  }

  invalidateBalanceCache(address);
  return c.json({ data: { claimed: amount } });
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
