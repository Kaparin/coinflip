import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { PurchaseVipRequestSchema, BoostBetRequestSchema, PinBetRequestSchema } from '@coinflip/shared/schemas';
import { VipCustomizationSchema } from '@coinflip/shared/vip-customization';
import { authMiddleware } from '../middleware/auth.js';
import { vipService } from '../services/vip.service.js';
import { pinService } from '../services/pin.service.js';
import { betService } from '../services/bet.service.js';
import { boostUsage, bets } from '@coinflip/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { Errors } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

export const vipRouter = new Hono<AppEnv>();

// GET /vip/config — public, returns tier prices
vipRouter.get('/config', async (c) => {
  const config = await vipService.getConfig();
  return c.json({ tiers: config });
});

// GET /vip/status — authenticated, returns user's VIP status
vipRouter.get('/status', authMiddleware, async (c) => {
  const user = c.get('user');
  const vip = await vipService.getActiveVip(user.id);
  const boostInfo = await vipService.getBoostInfo(user.id);

  return c.json({
    active: !!vip,
    tier: vip?.tier ?? null,
    expiresAt: vip?.expiresAt ?? null,
    boostsUsedToday: boostInfo.used,
    boostLimit: boostInfo.limit,
  });
});

// GET /vip/customization — get Diamond VIP customization
vipRouter.get('/customization', authMiddleware, async (c) => {
  const user = c.get('user');
  const customization = await vipService.getCustomization(user.id);
  return c.json(customization);
});

// PATCH /vip/customization — update Diamond VIP customization
vipRouter.patch('/customization', authMiddleware, zValidator('json', VipCustomizationSchema), async (c) => {
  const user = c.get('user');
  const data = c.req.valid('json');

  // Diamond-tier guard
  const vip = await vipService.getActiveVip(user.id);
  if (!vip || vip.tier !== 'diamond') {
    throw Errors.validationError('Diamond VIP subscription required');
  }

  const updated = await vipService.updateCustomization(user.id, data);
  return c.json(updated);
});

// POST /vip/purchase — buy VIP subscription
vipRouter.post('/purchase', authMiddleware, zValidator('json', PurchaseVipRequestSchema), async (c) => {
  const user = c.get('user');
  const { tier, period } = c.req.valid('json');

  const result = await vipService.purchaseVip(user.id, tier, period);
  return c.json({ success: true, expiresAt: result.expiresAt });
});

// POST /vip/boost — boost own bet (free, daily limit)
vipRouter.post('/boost', authMiddleware, zValidator('json', BoostBetRequestSchema), async (c) => {
  const user = c.get('user');
  const { betId } = c.req.valid('json');
  const db = getDb();

  // Check boost limit
  const boostInfo = await vipService.getBoostInfo(user.id);
  if (boostInfo.limit !== null && boostInfo.used >= boostInfo.limit) {
    throw Errors.validationError(`Daily boost limit reached (${boostInfo.limit})`);
  }

  // Verify bet exists, is open, and belongs to user
  const [bet] = await db
    .select({ betId: bets.betId, status: bets.status, makerUserId: bets.makerUserId, boostedAt: bets.boostedAt })
    .from(bets)
    .where(eq(bets.betId, BigInt(betId)))
    .limit(1);

  if (!bet) throw Errors.betNotFound(betId);
  if (bet.status !== 'open') throw Errors.validationError('Can only boost open bets');
  if (bet.makerUserId !== user.id) throw Errors.validationError('Can only boost your own bets');
  if (bet.boostedAt) throw Errors.validationError('Bet is already boosted');

  // Set boosted_at and record usage
  await db
    .update(bets)
    .set({ boostedAt: new Date() })
    .where(eq(bets.betId, BigInt(betId)));

  await db.insert(boostUsage).values({
    userId: user.id,
    betId: BigInt(betId),
  });

  return c.json({ success: true });
});

// POST /vip/pin — pin bet to slot (paid)
vipRouter.post('/pin', authMiddleware, zValidator('json', PinBetRequestSchema), async (c) => {
  const user = c.get('user');
  const { betId, slot } = c.req.valid('json');

  await pinService.pinBet(user.id, betId, slot);
  return c.json({ success: true });
});

// GET /vip/pins — get current pin slots (public)
vipRouter.get('/pins', async (c) => {
  const slots = await pinService.getPinSlots();
  return c.json({ slots });
});
