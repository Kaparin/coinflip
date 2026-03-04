import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, count, sum, countDistinct, desc } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { getDb } from '../lib/db.js';
import { shopPurchases } from '@coinflip/db/schema';
import { vaultService } from '../services/vault.service.js';
import { logger } from '../lib/logger.js';
import type { AppEnv } from '../types.js';

export const shopRouter = new Hono<AppEnv>();

// ---- GET /purchase-status ----
shopRouter.get('/purchase-status', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = getDb();

  const [result] = await db
    .select({ total: count() })
    .from(shopPurchases)
    .where(eq(shopPurchases.userId, user.id));

  return c.json({
    data: {
      hasFirstPurchase: (result?.total ?? 0) > 0,
      totalPurchases: result?.total ?? 0,
    },
  });
});

// ---- GET /admin/stats ----
shopRouter.get('/admin/stats', authMiddleware, async (c) => {
  const db = getDb();

  const [totals] = await db
    .select({
      totalPurchases: count(),
      uniqueBuyers: countDistinct(shopPurchases.userId),
      totalAxm: sum(shopPurchases.axmAmount),
      totalCoin: sum(shopPurchases.coinAmount),
      totalBonus: sum(shopPurchases.bonusCredited),
    })
    .from(shopPurchases);

  // Per-tier breakdown
  const perTier = await db
    .select({
      tier: shopPurchases.chestTier,
      purchases: count(),
      axmTotal: sum(shopPurchases.axmAmount),
    })
    .from(shopPurchases)
    .groupBy(shopPurchases.chestTier)
    .orderBy(shopPurchases.chestTier);

  // Recent purchases
  const recent = await db
    .select({
      id: shopPurchases.id,
      address: shopPurchases.address,
      chestTier: shopPurchases.chestTier,
      axmAmount: shopPurchases.axmAmount,
      coinAmount: shopPurchases.coinAmount,
      bonusCredited: shopPurchases.bonusCredited,
      txHash: shopPurchases.txHash,
      createdAt: shopPurchases.createdAt,
    })
    .from(shopPurchases)
    .orderBy(desc(shopPurchases.createdAt))
    .limit(20);

  return c.json({
    data: {
      totalPurchases: totals?.totalPurchases ?? 0,
      uniqueBuyers: totals?.uniqueBuyers ?? 0,
      totalAxm: totals?.totalAxm ?? '0',
      totalCoin: totals?.totalCoin ?? '0',
      totalBonus: totals?.totalBonus ?? '0',
      perTier,
      recent,
    },
  });
});

// ---- POST /confirm-purchase ----
const ConfirmPurchaseSchema = z.object({
  tx_hash: z.string().min(1),
  chest_tier: z.number().int().min(1).max(6),
  axm_amount: z.string().min(1),
  coin_amount: z.string().min(1),
});

shopRouter.post(
  '/confirm-purchase',
  authMiddleware,
  zValidator('json', ConfirmPurchaseSchema),
  async (c) => {
    const user = c.get('user');
    const address = c.get('address');
    const body = c.req.valid('json');
    const db = getDb();

    // Idempotency: check if tx_hash already recorded
    const [existing] = await db
      .select()
      .from(shopPurchases)
      .where(eq(shopPurchases.txHash, body.tx_hash))
      .limit(1);

    if (existing) {
      return c.json({
        data: {
          purchase_id: existing.id,
          bonus_credited: existing.bonusCredited,
          is_first_purchase: existing.bonusCredited !== '0',
        },
      });
    }

    // Check if this is the user's first purchase
    const [countResult] = await db
      .select({ total: count() })
      .from(shopPurchases)
      .where(eq(shopPurchases.userId, user.id));

    const isFirstPurchase = (countResult?.total ?? 0) === 0;
    const bonusAmount = isFirstPurchase ? body.coin_amount : '0';

    // Insert purchase record
    const [purchase] = await db
      .insert(shopPurchases)
      .values({
        userId: user.id,
        address,
        chestTier: body.chest_tier,
        axmAmount: body.axm_amount,
        coinAmount: body.coin_amount,
        bonusCredited: bonusAmount,
        txHash: body.tx_hash,
      })
      .returning();

    // Credit bonus to vault if first purchase
    if (isFirstPurchase) {
      await vaultService.creditWinner(user.id, bonusAmount);
      logger.info(
        { userId: user.id, bonusAmount, txHash: body.tx_hash },
        'First shop purchase — x2 bonus credited to vault',
      );
    }

    return c.json({
      data: {
        purchase_id: purchase!.id,
        bonus_credited: bonusAmount,
        is_first_purchase: isFirstPurchase,
      },
    });
  },
);
