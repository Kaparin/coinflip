import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { referralService } from '../services/referral.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { invalidateBalanceCache } from './vault.js';
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

// GET /api/v1/referral/has-referrer — Check if current user has a referrer
referralRouter.get('/has-referrer', authMiddleware, async (c) => {
  const userId = c.get('user').id;
  const hasRef = await referralService.hasReferrer(userId);
  const current = hasRef ? await referralService.getCurrentReferrer(userId) : null;
  return c.json({ data: { has_referrer: hasRef, referrer: current } });
});

// POST /api/v1/referral/change-branch — Change referral branch (paid: 1000 LAUNCH)
const ChangeBranchSchema = z.object({ address: z.string().min(1).max(100) });

referralRouter.post('/change-branch', authMiddleware, zValidator('json', ChangeBranchSchema), async (c) => {
  const userId = c.get('user').id;
  const walletAddress = c.get('address');
  const { address: newReferrerAddr } = c.req.valid('json');
  const result = await referralService.changeBranch(userId, newReferrerAddr);

  if (!result.success) {
    const messages: Record<string, string> = {
      USER_NOT_FOUND: 'User with this address not found in the system',
      SELF_REFERRAL: 'Cannot refer yourself',
      WOULD_CREATE_CYCLE: 'This change would create a circular referral chain',
      INSUFFICIENT_BALANCE: 'Insufficient balance. You need 1,000 LAUNCH to change branch.',
    };
    return c.json({
      error: { code: result.reason, message: messages[result.reason!] ?? 'Failed to change branch' },
    }, 400);
  }

  invalidateBalanceCache(walletAddress);
  return c.json({ data: { changed: true, cost: result.cost } });
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
