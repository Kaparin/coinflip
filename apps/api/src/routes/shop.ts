import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, count, sum, countDistinct, desc } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';
import { getDb } from '../lib/db.js';
import { shopPurchases, userNotifications } from '@coinflip/db/schema';
import { treasuryService } from '../services/treasury.service.js';
import { configService } from '../services/config.service.js';
import { wsService } from '../services/ws.service.js';
import { logger } from '../lib/logger.js';
import { chainRest } from '../lib/chain-fetch.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types.js';

export const shopRouter = new Hono<AppEnv>();

// ---- Tier config type ----
type TierConfig = {
  tier: number;
  axmPrice: number;
  coinAmount: number;
};

const DEFAULT_TIERS: TierConfig[] = [
  { tier: 1, axmPrice: 10, coinAmount: 15 },
  { tier: 2, axmPrice: 30, coinAmount: 50 },
  { tier: 3, axmPrice: 75, coinAmount: 150 },
  { tier: 4, axmPrice: 200, coinAmount: 500 },
  { tier: 5, axmPrice: 500, coinAmount: 1500 },
  { tier: 6, axmPrice: 1500, coinAmount: 5000 },
];

async function getShopTiers(): Promise<TierConfig[]> {
  return configService.getJson<TierConfig[]>('shop_tiers', DEFAULT_TIERS);
}

async function isShopEnabled(): Promise<boolean> {
  return configService.getBoolean('shop_enabled', true);
}

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

// ---- GET /config — public tier config ----
shopRouter.get('/config', async (c) => {
  const tiers = await getShopTiers();
  const enabled = await isShopEnabled();

  return c.json({
    data: { tiers, enabled },
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
      status: shopPurchases.status,
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

// ---- GET /admin/config — admin tier config ----
shopRouter.get('/admin/config', adminMiddleware, async (c) => {
  const tiers = await getShopTiers();
  const enabled = await isShopEnabled();

  // Treasury COIN balance
  let treasuryBalance = '0';
  try {
    const balance = await treasuryService.getBalance();
    treasuryBalance = String(BigInt(balance.walletBalance) + BigInt(balance.vaultAvailable));
  } catch (err) {
    logger.warn({ err }, 'Failed to get treasury balance for admin config');
  }

  return c.json({
    data: { tiers, enabled, treasuryBalance },
  });
});

// ---- POST /admin/config — update tier config ----
const AdminConfigSchema = z.object({
  tiers: z.array(z.object({
    tier: z.number().int().min(1).max(6),
    axmPrice: z.number().positive(),
    coinAmount: z.number().positive(),
  })).optional(),
  enabled: z.boolean().optional(),
});

shopRouter.post(
  '/admin/config',
  adminMiddleware,
  zValidator('json', AdminConfigSchema),
  async (c) => {
    const body = c.req.valid('json');
    const address = c.get('address');
    const db = getDb();

    if (body.tiers !== undefined) {
      await configService.set('shop_tiers', JSON.stringify(body.tiers), address);
    }
    if (body.enabled !== undefined) {
      await configService.set('shop_enabled', String(body.enabled), address);
    }

    return c.json({ data: { ok: true } });
  },
);

// ---- Background tx confirmation for instant-buy ----

async function queryTxViaRpc(txHash: string) {
  try {
    const hash = txHash.startsWith('0x') ? txHash : `0x${txHash}`;
    const res = await fetch(`${env.AXIOME_RPC_URL}/tx?hash=${hash}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      result?: { tx_result?: { code: number; log?: string }; height?: string };
    };
    if (data.result?.tx_result) {
      return { code: data.result.tx_result.code, rawLog: data.result.tx_result.log ?? '' };
    }
  } catch { /* ignore */ }
  return null;
}

async function pollForTxSimple(txHash: string, maxMs = 60_000): Promise<{ code: number; rawLog: string } | null> {
  const start = Date.now();
  let interval = 1000;

  while (Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, interval));
    interval = Math.min(interval * 1.5, 3000);

    // Try RPC first (faster)
    const rpcResult = await queryTxViaRpc(txHash);
    if (rpcResult) return rpcResult;

    // Fallback to REST
    try {
      const restRes = await chainRest(`/cosmos/tx/v1beta1/txs/${txHash}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (restRes.ok) {
        const data = await restRes.json() as {
          tx_response?: { code: number; raw_log?: string };
        };
        if (data.tx_response) {
          return { code: data.tx_response.code, rawLog: data.tx_response.raw_log ?? '' };
        }
      }
    } catch { /* ignore */ }
  }

  return null;
}

function resolveShopPurchaseInBackground(
  purchaseId: string,
  userId: string,
  address: string,
  txHash: string,
  tierConfig: TierConfig,
  isFirstPurchase: boolean,
) {
  (async () => {
    const db = getDb();
    try {
      const result = await pollForTxSimple(txHash, 60_000);

      if (result && result.code === 0) {
        // AXM payment confirmed on-chain — now send real COIN from treasury
        const microCoin = String(Math.floor(tierConfig.coinAmount * 1_000_000));

        let coinTxHash: string | undefined;
        let bonusTxHash: string | undefined;

        try {
          // Send main COIN amount
          const coinResult = await treasuryService.sendPrize(address, microCoin);
          coinTxHash = coinResult.txHash;

          // Send bonus COIN for first purchase
          if (isFirstPurchase) {
            const bonusResult = await treasuryService.sendPrize(address, microCoin);
            bonusTxHash = bonusResult.txHash;
          }

          // Mark as confirmed
          await db
            .update(shopPurchases)
            .set({
              status: 'confirmed',
              coinTxHash: coinTxHash ?? null,
              bonusTxHash: bonusTxHash ?? null,
            })
            .where(eq(shopPurchases.id, purchaseId));

          const totalCoin = isFirstPurchase ? tierConfig.coinAmount * 2 : tierConfig.coinAmount;

          wsService.sendToAddress(address, {
            type: 'purchase_confirmed',
            data: {
              tx_hash: txHash,
              coin_tx_hash: coinTxHash,
              bonus_tx_hash: bonusTxHash,
              coin_amount: String(totalCoin),
            },
          });

          logger.info({ purchaseId, txHash, coinTxHash, bonusTxHash }, 'Shop purchase confirmed — COIN sent');
        } catch (err) {
          // COIN transfer failed — mark purchase as coin_failed
          const reason = err instanceof Error ? err.message : String(err);

          await db
            .update(shopPurchases)
            .set({ status: 'coin_failed' })
            .where(eq(shopPurchases.id, purchaseId));

          await db.insert(userNotifications).values({
            userId,
            type: 'purchase_failed',
            title: 'Purchase failed',
            message: `Your AXM payment was received but COIN transfer failed. Please contact support.`,
            metadata: { tx_hash: txHash, reason },
          });

          wsService.sendToAddress(address, {
            type: 'purchase_failed',
            data: { tx_hash: txHash, reason: 'COIN transfer failed. Contact support.' },
          });

          logger.error({ purchaseId, txHash, err }, 'COIN transfer failed after AXM payment confirmed');
        }
        return;
      }

      // AXM tx failed or not found
      const reason = result ? result.rawLog : 'Transaction not found within 60s';

      await db
        .update(shopPurchases)
        .set({ status: 'failed' })
        .where(eq(shopPurchases.id, purchaseId));

      await db.insert(userNotifications).values({
        userId,
        type: 'purchase_failed',
        title: 'Purchase failed',
        message: `Your chest purchase transaction failed on blockchain.`,
        metadata: { tx_hash: txHash, reason },
      });

      wsService.sendToAddress(address, {
        type: 'purchase_failed',
        data: { tx_hash: txHash, reason },
      });

      logger.warn({ purchaseId, txHash, reason }, 'Shop purchase AXM tx failed');
    } catch (err) {
      logger.error({ purchaseId, txHash, err }, 'Error resolving shop purchase in background');
    }
  })();
}

// ---- POST /instant-buy ----

const InstantBuySchema = z.object({
  tx_hash: z.string().min(1),
  chest_tier: z.number().int().min(1).max(6),
});

shopRouter.post(
  '/instant-buy',
  authMiddleware,
  zValidator('json', InstantBuySchema),
  async (c) => {
    const user = c.get('user');
    const address = c.get('address');
    const body = c.req.valid('json');
    const db = getDb();

    // Check shop is enabled
    const enabled = await isShopEnabled();
    if (!enabled) {
      return c.json({ error: { code: 'SHOP_DISABLED', message: 'Shop is currently disabled' } }, 400);
    }

    // Load tier config from platform_config
    const tiers = await getShopTiers();
    const tierConfig = tiers.find(t => t.tier === body.chest_tier);
    if (!tierConfig) {
      return c.json({ error: { code: 'INVALID_TIER', message: 'Invalid chest tier' } }, 400);
    }

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
          status: existing.status,
          tx_hash: existing.txHash,
        },
      });
    }

    // Check if first purchase
    const [countResult] = await db
      .select({ total: count() })
      .from(shopPurchases)
      .where(eq(shopPurchases.userId, user.id));

    const isFirstPurchase = (countResult?.total ?? 0) === 0;
    const microAxm = String(Math.floor(tierConfig.axmPrice * 1_000_000));
    const microCoin = String(Math.floor(tierConfig.coinAmount * 1_000_000));
    const bonusAmount = isFirstPurchase ? microCoin : '0';

    // Insert purchase record with status='pending'
    const [purchase] = await db
      .insert(shopPurchases)
      .values({
        userId: user.id,
        address,
        chestTier: body.chest_tier,
        axmAmount: microAxm,
        coinAmount: microCoin,
        bonusCredited: bonusAmount,
        txHash: body.tx_hash,
        status: 'pending',
      })
      .returning();

    // Fire-and-forget background: verify AXM payment → send real COIN
    resolveShopPurchaseInBackground(
      purchase!.id,
      user.id,
      address,
      body.tx_hash,
      tierConfig,
      isFirstPurchase,
    );

    return c.json({
      data: {
        purchase_id: purchase!.id,
        coin_amount: tierConfig.coinAmount,
        bonus_amount: isFirstPurchase ? tierConfig.coinAmount : 0,
        is_first_purchase: isFirstPurchase,
        tx_hash: body.tx_hash,
      },
    }, 202);
  },
);
