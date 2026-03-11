import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, sql, desc, and, inArray, or, like } from 'drizzle-orm';
import { TreasuryWithdrawRequestSchema, TreasuryLedgerQuerySchema } from '@coinflip/shared/schemas';
import { adminMiddleware } from '../middleware/admin.js';
import { treasuryService } from '../services/treasury.service.js';
import { vaultService } from '../services/vault.service.js';
import { betService } from '../services/bet.service.js';
import { pendingSecretsService } from '../services/pending-secrets.service.js';
import { getDb } from '../lib/db.js';
import { users, bets, vaultBalances, pendingBetSecrets, announcements, userNotifications, shopPurchases, referralRewards, achievementClaims, treasuryLedger as treasuryLedgerTable, partnerLedger, jackpotPools, jackpotContributions, eventParticipants, events as eventsTable, stakingLedger, sessions, referrals, referralBalances, txEvents, relayerTransactions, globalChatMessages, betMessages, coinTransfers, profileReactions, userFavorites, boostUsage, betPins, vaultTransactions, vipSubscriptions, vipCustomization } from '@coinflip/db/schema';
import { env, getActiveContractAddr, gameDenom } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { chainRest } from '../lib/chain-fetch.js';
import { getCoinFlipStats } from './bets.js';
import { jackpotService } from '../services/jackpot.service.js';
import { vipService } from '../services/vip.service.js';
import { wsService } from '../services/ws.service.js';
import { configService } from '../services/config.service.js';
import { partnerService } from '../services/partner.service.js';
import { newsService } from '../services/news.service.js';
import { announcementService } from '../services/announcement.service.js';
import { translationService } from '../services/translation.service.js';
import { treasurySweepService } from '../services/treasury-sweep.service.js';
import { aiBotService } from '../services/ai-bot.service.js';
import { stakingService } from '../services/staking.service.js';
import type { AppEnv } from '../types.js';
import { CHAIN_OPEN_BETS_LIMIT } from '@coinflip/shared/constants';

export const adminRouter = new Hono<AppEnv>();

// All admin routes require admin access
adminRouter.use('*', adminMiddleware);

// ═══════════════════════════════════════════
// Treasury (existing)
// ═══════════════════════════════════════════

adminRouter.get('/treasury/balance', async (c) => {
  const balance = await treasuryService.getBalance();
  return c.json({
    data: {
      vault: { available: balance.vaultAvailable, locked: balance.vaultLocked },
      wallet: { balance: balance.walletBalance },
    },
  });
});

adminRouter.get('/treasury/stats', async (c) => {
  const stats = await treasuryService.getLedgerStats();
  return c.json({
    data: {
      totalCommissions: stats.totalAmount,
      totalEntries: stats.entryCount,
      last24h: stats.last24hAmount,
      last7d: stats.last7dAmount,
    },
  });
});

adminRouter.get('/treasury/ledger', zValidator('query', TreasuryLedgerQuerySchema), async (c) => {
  const { limit, offset } = c.req.valid('query');
  const { rows, total } = await treasuryService.getLedger(limit, offset);
  return c.json({
    data: rows,
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  });
});

adminRouter.post('/treasury/withdraw', zValidator('json', TreasuryWithdrawRequestSchema), async (c) => {
  const { amount } = c.req.valid('json');
  const result = await treasuryService.withdrawFromVault(amount);
  return c.json({
    data: {
      status: 'confirmed',
      txHash: result.txHash,
      amount: result.amount,
      message: 'Treasury withdrawal confirmed on chain.',
    },
  });
});

adminRouter.get('/platform/stats', async (c) => {
  const stats = await treasuryService.getPlatformStats();
  return c.json({ data: stats });
});

// ═══════════════════════════════════════════
// Users
// ═══════════════════════════════════════════

const UsersQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  search: z.string().optional(),
});

adminRouter.get('/users', zValidator('query', UsersQuerySchema), async (c) => {
  const { limit, offset, search } = c.req.valid('query');
  const db = getDb();

  const conditions = search
    ? or(
        like(users.address, `%${search.toLowerCase()}%`),
        like(sql`lower(${users.profileNickname})`, `%${search.toLowerCase()}%`),
      )
    : undefined;

  const [rows, countResult] = await Promise.all([
    db.select({
      id: users.id,
      address: users.address,
      nickname: users.profileNickname,
      createdAt: users.createdAt,
    })
      .from(users)
      .where(conditions)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(conditions),
  ]);

  // Attach vault balances (AXM + COIN)
  const userIds = rows.map(u => u.id);
  const balances = userIds.length > 0
    ? await db.select({
        userId: vaultBalances.userId,
        available: vaultBalances.available,
        locked: vaultBalances.locked,
        bonus: vaultBalances.bonus,
        offchainSpent: vaultBalances.offchainSpent,
        coinBalance: vaultBalances.coinBalance,
      })
        .from(vaultBalances)
        .where(inArray(vaultBalances.userId, userIds))
    : [];

  const balanceMap = new Map(balances.map(b => [b.userId, b]));

  // Attach bet counts per user
  const betCounts = userIds.length > 0
    ? await db.select({
        makerUserId: bets.makerUserId,
        count: sql<number>`count(*)::int`,
      })
        .from(bets)
        .where(inArray(bets.makerUserId, userIds))
        .groupBy(bets.makerUserId)
    : [];

  const betCountMap = new Map(betCounts.map(b => [b.makerUserId, b.count]));

  const data = rows.map(u => {
    const b = balanceMap.get(u.id);
    const avail = BigInt(b?.available ?? '0');
    const bonus = BigInt(b?.bonus ?? '0');
    const spent = BigInt(b?.offchainSpent ?? '0');
    const effectiveAxm = avail + bonus - spent;
    return {
      id: u.id,
      address: u.address,
      nickname: u.nickname,
      createdAt: u.createdAt?.toISOString() ?? null,
      axmBalance: effectiveAxm.toString(),
      axmLocked: b?.locked ?? '0',
      coinBalance: b?.coinBalance ?? '0',
      totalBets: betCountMap.get(u.id) ?? 0,
    };
  });

  return c.json({
    data,
    pagination: {
      total: countResult[0]?.count ?? 0,
      limit,
      offset,
      hasMore: offset + limit < (countResult[0]?.count ?? 0),
    },
  });
});

// GET /api/v1/admin/users/:userId — detailed user view
adminRouter.get('/users/:userId', async (c) => {
  const userId = c.req.param('userId');
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);

  const [balance] = await db.select().from(vaultBalances).where(eq(vaultBalances.userId, userId)).limit(1);

  // Fetch chain balance for comparison (chain is source of truth for UI)
  let chainBalance: { available: string; locked: string } | null = null;
  let chainUserBets: Array<{ id: number; status: string; amount: string; maker: string; acceptor: string | null }> = [];
  if (user.address && getActiveContractAddr()) {
    try {
      const vbQuery = btoa(JSON.stringify({ vault_balance: { address: user.address } }));
      const vbRes = await chainRest(
        `/cosmwasm/wasm/v1/contract/${getActiveContractAddr()}/smart/${vbQuery}`,
      );
      if (vbRes.ok) {
        const vbData = await vbRes.json() as { data: { available: string; locked: string } };
        chainBalance = vbData.data;
      }
      const ubQuery = btoa(JSON.stringify({ user_bets: { address: user.address, limit: 20 } }));
      const ubRes = await chainRest(
        `/cosmwasm/wasm/v1/contract/${getActiveContractAddr()}/smart/${ubQuery}`,
      );
      if (ubRes.ok) {
        const ubData = await ubRes.json() as { data: { bets: Array<{ id: number; status: string; amount: string; maker: string; acceptor: string | null }> } };
        chainUserBets = ubData.data.bets ?? [];
      }
    } catch (err) {
      logger.warn({ err, userId }, 'admin: failed to fetch chain balance/bets');
    }
  }

  const userBets = await db.select({
    betId: bets.betId,
    amount: bets.amount,
    status: bets.status,
    makerSide: bets.makerSide,
    makerSecret: sql<string>`CASE WHEN ${bets.makerSecret} IS NOT NULL THEN 'present' ELSE 'missing' END`,
    acceptorGuess: bets.acceptorGuess,
    createdTime: bets.createdTime,
    acceptedTime: bets.acceptedTime,
    resolvedTime: bets.resolvedTime,
    winnerUserId: bets.winnerUserId,
    txhashCreate: bets.txhashCreate,
  })
    .from(bets)
    .where(or(eq(bets.makerUserId, userId), eq(bets.acceptorUserId, userId)))
    .orderBy(desc(bets.createdTime))
    .limit(100);

  return c.json({
    data: {
      user: {
        id: user.id,
        address: user.address,
        nickname: user.profileNickname,
        createdAt: user.createdAt?.toISOString() ?? null,
      },
      vault: {
        available: balance?.available ?? '0',
        locked: balance?.locked ?? '0',
        coinBalance: balance?.coinBalance ?? '0',
      },
      chainVault: chainBalance ? { available: chainBalance.available, locked: chainBalance.locked } : null,
      chainUserBets: chainUserBets.map(b => ({ id: b.id, status: b.status, amount: b.amount, maker: b.maker, acceptor: b.acceptor })),
      bets: userBets.map(b => ({
        ...b,
        betId: b.betId.toString(),
        createdTime: b.createdTime?.toISOString() ?? null,
        acceptedTime: b.acceptedTime?.toISOString() ?? null,
        resolvedTime: b.resolvedTime?.toISOString() ?? null,
      })),
    },
  });
});

// POST /api/v1/admin/users/:userId/coin — Credit or debit COIN balance
const CoinAdjustSchema = z.object({
  amount: z.string().min(1),
  action: z.enum(['credit', 'debit']),
  reason: z.string().optional(),
});

adminRouter.post('/users/:userId/coin', zValidator('json', CoinAdjustSchema), async (c) => {
  const userId = c.req.param('userId');
  const { amount, action, reason } = c.req.valid('json');
  const db = getDb();

  const [user] = await db.select({ id: users.id, address: users.address }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);

  if (action === 'credit') {
    await vaultService.creditCoin(userId, amount);
  } else {
    const result = await vaultService.deductCoin(userId, amount);
    if (!result) {
      return c.json({ error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient COIN balance' } }, 400);
    }
  }

  const newBalance = await vaultService.getCoinBalance(userId);
  logger.info({ userId, action, amount, reason, newBalance }, 'Admin: COIN balance adjusted');

  return c.json({ data: { coinBalance: newBalance } });
});

// ═══════════════════════════════════════════
// Bets Diagnostics
// ═══════════════════════════════════════════

const BetsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  status: z.string().optional(),
  search: z.string().optional(),
});

adminRouter.get('/bets', zValidator('query', BetsQuerySchema), async (c) => {
  const { limit, offset, status, search } = c.req.valid('query');
  const db = getDb();

  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(bets.status, status));
  if (search) {
    if (/^\d+$/.test(search)) {
      conditions.push(eq(bets.betId, BigInt(search)));
    } else {
      conditions.push(
        or(
          like(bets.txhashCreate, `%${search}%`),
          like(bets.commitment, `%${search}%`),
        )!,
      );
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select({
      betId: bets.betId,
      makerUserId: bets.makerUserId,
      acceptorUserId: bets.acceptorUserId,
      amount: bets.amount,
      status: bets.status,
      makerSide: bets.makerSide,
      hasSecret: sql<boolean>`${bets.makerSecret} IS NOT NULL`,
      acceptorGuess: bets.acceptorGuess,
      createdTime: bets.createdTime,
      acceptedTime: bets.acceptedTime,
      resolvedTime: bets.resolvedTime,
      winnerUserId: bets.winnerUserId,
      txhashCreate: bets.txhashCreate,
      commitment: bets.commitment,
    })
      .from(bets)
      .where(whereClause)
      .orderBy(desc(bets.createdTime))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(bets).where(whereClause),
  ]);

  // Resolve addresses for makers/acceptors
  const userIds = new Set<string>();
  for (const r of rows) {
    userIds.add(r.makerUserId);
    if (r.acceptorUserId) userIds.add(r.acceptorUserId);
    if (r.winnerUserId) userIds.add(r.winnerUserId);
  }

  const addressMap = new Map<string, string>();
  if (userIds.size > 0) {
    const userRows = await db.select({ id: users.id, address: users.address })
      .from(users)
      .where(inArray(users.id, [...userIds]));
    for (const u of userRows) addressMap.set(u.id, u.address);
  }

  const data = rows.map(r => ({
    betId: r.betId.toString(),
    maker: addressMap.get(r.makerUserId) ?? r.makerUserId,
    acceptor: r.acceptorUserId ? (addressMap.get(r.acceptorUserId) ?? r.acceptorUserId) : null,
    winner: r.winnerUserId ? (addressMap.get(r.winnerUserId) ?? r.winnerUserId) : null,
    amount: r.amount,
    status: r.status,
    makerSide: r.makerSide,
    hasSecret: r.hasSecret,
    acceptorGuess: r.acceptorGuess,
    createdTime: r.createdTime?.toISOString() ?? null,
    acceptedTime: r.acceptedTime?.toISOString() ?? null,
    resolvedTime: r.resolvedTime?.toISOString() ?? null,
    txhashCreate: r.txhashCreate,
    commitment: r.commitment,
  }));

  return c.json({
    data,
    pagination: {
      total: countResult[0]?.count ?? 0,
      limit,
      offset,
      hasMore: offset + limit < (countResult[0]?.count ?? 0),
    },
  });
});

// GET /api/v1/admin/bets/stuck — bets in transitional states for too long
adminRouter.get('/bets/stuck', async (c) => {
  const db = getDb();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const stuck = await db.select({
    betId: bets.betId,
    makerUserId: bets.makerUserId,
    acceptorUserId: bets.acceptorUserId,
    amount: bets.amount,
    status: bets.status,
    createdTime: bets.createdTime,
    txhashCreate: bets.txhashCreate,
    hasSecret: sql<boolean>`${bets.makerSecret} IS NOT NULL`,
  })
    .from(bets)
    .where(
      and(
        inArray(bets.status, ['creating', 'accepting', 'canceling']),
        sql`${bets.createdTime} < ${fiveMinAgo}`,
      ),
    )
    .orderBy(bets.createdTime);

  return c.json({
    data: stuck.map(b => ({
      ...b,
      betId: b.betId.toString(),
      createdTime: b.createdTime?.toISOString() ?? null,
      age: b.createdTime ? `${Math.round((Date.now() - b.createdTime.getTime()) / 60000)}m` : null,
    })),
  });
});

// GET /api/v1/admin/bets/missing-secrets — accepted bets without secrets (can't auto-reveal)
adminRouter.get('/bets/missing-secrets', async (c) => {
  const db = getDb();

  const missing = await db.select({
    betId: bets.betId,
    makerUserId: bets.makerUserId,
    amount: bets.amount,
    status: bets.status,
    createdTime: bets.createdTime,
    acceptedTime: bets.acceptedTime,
    commitment: bets.commitment,
    txhashCreate: bets.txhashCreate,
  })
    .from(bets)
    .where(
      and(
        eq(bets.status, 'accepted'),
        sql`${bets.makerSecret} IS NULL`,
      ),
    )
    .orderBy(bets.createdTime);

  // Check pending_bet_secrets for recoverable secrets
  const data = await Promise.all(missing.map(async (b) => {
    const pending = b.commitment
      ? await pendingSecretsService.getByCommitment(b.commitment)
      : null;
    return {
      betId: b.betId.toString(),
      amount: b.amount,
      status: b.status,
      createdTime: b.createdTime?.toISOString() ?? null,
      acceptedTime: b.acceptedTime?.toISOString() ?? null,
      txhashCreate: b.txhashCreate,
      secretRecoverable: !!pending,
    };
  }));

  return c.json({ data });
});

// ═══════════════════════════════════════════
// Orphaned Bets (chain vs DB comparison)
// ═══════════════════════════════════════════

adminRouter.get('/bets/orphaned', async (c) => {
  const db = getDb();

  try {
    // Fetch all open bets from chain
    const query = JSON.stringify({ open_bets: { limit: CHAIN_OPEN_BETS_LIMIT } });
    const encoded = Buffer.from(query).toString('base64');
    const res = await chainRest(
      `/cosmwasm/wasm/v1/contract/${getActiveContractAddr()}/smart/${encoded}`,
    );

    if (!res.ok) {
      return c.json({ error: { code: 'CHAIN_QUERY_FAILED', message: 'Failed to query chain' } }, 502);
    }

    const chainData = await res.json() as {
      data: { bets: Array<{ id: number; maker: string; amount: string; commitment: string }> };
    };
    const chainBets = chainData.data?.bets ?? [];

    // Get all bet IDs from DB
    const dbBetRows = await db.select({ betId: bets.betId }).from(bets);
    const dbBetIds = new Set(dbBetRows.map(b => Number(b.betId)));

    const orphaned = chainBets.filter(b => !dbBetIds.has(b.id));

    // For each orphaned bet, check if we have a secret in pending_bet_secrets
    const orphanedWithSecrets = await Promise.all(orphaned.map(async (b) => {
      const pending = await pendingSecretsService.getByCommitment(b.commitment);
      return {
        chainBetId: b.id,
        maker: b.maker,
        amount: b.amount,
        commitment: b.commitment.slice(0, 16) + '...',
        secretAvailable: !!pending,
      };
    }));

    return c.json({
      data: {
        chainTotal: chainBets.length,
        dbTotal: dbBetIds.size,
        orphanedCount: orphaned.length,
        orphaned: orphanedWithSecrets,
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'admin: orphaned bets query failed');
    return c.json({ error: { code: 'QUERY_FAILED', message: err.message } }, 500);
  }
});

// POST /api/v1/admin/bets/orphaned/import — import a specific orphaned bet from chain
const ImportOrphanedSchema = z.object({
  chainBetId: z.coerce.number(),
});

adminRouter.post('/bets/orphaned/import', zValidator('json', ImportOrphanedSchema), async (c) => {
  const { chainBetId } = c.req.valid('json');

  try {
    // Query bet from chain
    const query = JSON.stringify({ bet: { bet_id: chainBetId } });
    const encoded = Buffer.from(query).toString('base64');
    const res = await chainRest(
      `/cosmwasm/wasm/v1/contract/${getActiveContractAddr()}/smart/${encoded}`,
    );

    if (!res.ok) {
      return c.json({ error: { code: 'CHAIN_QUERY_FAILED', message: 'Bet not found on chain' } }, 404);
    }

    const chainBet = (await res.json() as { data: { id: number; maker: string; amount: string; commitment: string; status: string } }).data;

    // Check if already in DB
    const existing = await betService.getBetById(BigInt(chainBetId));
    if (existing) {
      return c.json({ error: { code: 'ALREADY_EXISTS', message: 'Bet already exists in DB' } }, 409);
    }

    // Resolve maker → user_id
    const db = getDb();
    const [userRow] = await db.select({ id: users.id }).from(users).where(eq(users.address, chainBet.maker)).limit(1);
    if (!userRow) {
      return c.json({ error: { code: 'USER_NOT_FOUND', message: `Maker ${chainBet.maker} not in users table` } }, 404);
    }

    // Check for secrets in pending_bet_secrets
    const pending = await pendingSecretsService.getByCommitment(chainBet.commitment);

    await betService.createBet({
      betId: BigInt(chainBetId),
      makerUserId: userRow.id,
      amount: chainBet.amount,
      commitment: chainBet.commitment,
      txhashCreate: pending?.txHash ?? `admin_import_${chainBetId}`,
      makerSide: pending?.makerSide as 'heads' | 'tails' | undefined,
      makerSecret: pending?.makerSecret,
    });

    if (pending) {
      await pendingSecretsService.delete(chainBet.commitment).catch(() => {});
    }

    logger.info({ chainBetId, maker: chainBet.maker, secretRecovered: !!pending }, 'admin: imported orphaned bet');

    return c.json({
      data: {
        betId: chainBetId,
        status: 'imported',
        secretRecovered: !!pending,
        message: pending
          ? 'Bet imported with secret — auto-reveal will work.'
          : 'Bet imported WITHOUT secret — manual cancel recommended.',
      },
    });
  } catch (err: any) {
    logger.error({ err, chainBetId }, 'admin: import orphaned bet failed');
    return c.json({ error: { code: 'IMPORT_FAILED', message: err.message } }, 500);
  }
});

// ═══════════════════════════════════════════
// Pending Secrets (debug view)
// ═══════════════════════════════════════════

adminRouter.get('/pending-secrets', async (c) => {
  const db = getDb();
  const rows = await db.select({
    commitment: sql<string>`substring(${pendingBetSecrets.commitment}, 1, 16) || '...'`,
    makerSide: pendingBetSecrets.makerSide,
    txHash: pendingBetSecrets.txHash,
    createdAt: pendingBetSecrets.createdAt,
  })
    .from(pendingBetSecrets)
    .orderBy(desc(pendingBetSecrets.createdAt))
    .limit(100);

  return c.json({
    data: rows.map(r => ({
      ...r,
      createdAt: r.createdAt?.toISOString() ?? null,
      age: r.createdAt ? `${Math.round((Date.now() - r.createdAt.getTime()) / 60000)}m` : null,
    })),
  });
});

// ═══════════════════════════════════════════
// Admin Actions
// ═══════════════════════════════════════════

// POST /api/v1/admin/actions/heal-system — one-click fix for all stuck bets
adminRouter.post('/actions/heal-system', async (c) => {
  try {
    const { runHealSweep } = await import('../services/background-tasks.js');
    const result = await runHealSweep();
    logger.info({ admin: c.get('address'), result: result.message }, 'admin: heal-system completed');
    return c.json({ data: result });
  } catch (err: any) {
    logger.error({ err }, 'admin: heal-system failed');
    return c.json({ error: { code: 'HEAL_FAILED', message: err.message } }, 500);
  }
});

// POST /api/v1/admin/actions/unlock-funds — force-unlock stuck funds for a user
const UnlockFundsSchema = z.object({
  userId: z.string().uuid(),
  amount: z.string(),
});

adminRouter.post('/actions/unlock-funds', zValidator('json', UnlockFundsSchema), async (c) => {
  const { userId, amount } = c.req.valid('json');

  try {
    await vaultService.unlockFunds(userId, amount);
    logger.info({ userId, amount, admin: c.get('address') }, 'admin: force-unlocked funds');
    return c.json({ data: { status: 'ok', message: `Unlocked ${amount} for user ${userId}` } });
  } catch (err: any) {
    return c.json({ error: { code: 'UNLOCK_FAILED', message: err.message } }, 500);
  }
});

// POST /api/v1/admin/actions/force-cancel — force-cancel a stuck bet in DB
const ForceCancelSchema = z.object({
  betId: z.coerce.number(),
});

adminRouter.post('/actions/force-cancel', zValidator('json', ForceCancelSchema), async (c) => {
  const { betId } = c.req.valid('json');

  try {
    const bet = await betService.getBetById(BigInt(betId));
    if (!bet) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Bet not found' } }, 404);
    }

    await betService.updateBetStatus(BigInt(betId), 'canceled', true);

    // Unlock maker's locked funds
    await vaultService.unlockFunds(bet.makerUserId, bet.amount).catch(err =>
      logger.warn({ err }, 'admin: force-cancel unlock maker failed'));

    // If bet was accepted, also unlock acceptor's funds
    if (bet.acceptorUserId && ['accepting', 'accepted'].includes(bet.status)) {
      await vaultService.unlockFunds(bet.acceptorUserId, bet.amount).catch(err =>
        logger.warn({ err }, 'admin: force-cancel unlock acceptor failed'));
    }

    logger.info({ betId, previousStatus: bet.status, admin: c.get('address') }, 'admin: force-canceled bet');

    return c.json({
      data: {
        betId,
        previousStatus: bet.status,
        newStatus: 'canceled',
        message: 'Bet force-canceled and funds unlocked.',
      },
    });
  } catch (err: any) {
    return c.json({ error: { code: 'CANCEL_FAILED', message: err.message } }, 500);
  }
});

// POST /api/v1/admin/actions/recover-secret — recover a missing secret from pending_bet_secrets
const RecoverSecretSchema = z.object({
  betId: z.coerce.number(),
});

adminRouter.post('/actions/recover-secret', zValidator('json', RecoverSecretSchema), async (c) => {
  const { betId } = c.req.valid('json');
  const db = getDb();

  try {
    const bet = await betService.getBetById(BigInt(betId));
    if (!bet) return c.json({ error: { code: 'NOT_FOUND', message: 'Bet not found' } }, 404);

    if (bet.makerSecret) {
      return c.json({ data: { status: 'already_present', message: 'Secret already exists for this bet.' } });
    }

    const pending = await pendingSecretsService.getByCommitment(bet.commitment);
    if (!pending) {
      return c.json({ error: { code: 'NO_SECRET', message: 'No pending secret found for this commitment.' } }, 404);
    }

    await db.update(bets)
      .set({
        makerSide: pending.makerSide,
        makerSecret: pending.makerSecret,
      })
      .where(eq(bets.betId, BigInt(betId)));

    await pendingSecretsService.delete(bet.commitment).catch(() => {});

    logger.info({ betId, admin: c.get('address') }, 'admin: recovered secret for bet');

    return c.json({
      data: {
        status: 'recovered',
        betId,
        makerSide: pending.makerSide,
        message: 'Secret recovered — auto-reveal will now work for this bet.',
      },
    });
  } catch (err: any) {
    return c.json({ error: { code: 'RECOVER_FAILED', message: err.message } }, 500);
  }
});

// ═══════════════════════════════════════════
// Economy Overview — full P&L, COIN circulation
// ═══════════════════════════════════════════

adminRouter.get('/economy/overview', async (c) => {
  const db = getDb();

  try {
    // --- AXM P&L ---
    // Total commission earned (treasury ledger)
    const [commStats] = await db.select({
      totalEarned: sql<string>`coalesce(sum(amount::numeric), 0)::text`,
      entries: sql<number>`count(*)::int`,
    }).from(treasuryLedgerTable);

    // Referral payouts
    const [refStats] = await db.select({
      totalPaid: sql<string>`coalesce(sum(amount::numeric), 0)::text`,
      count: sql<number>`count(*)::int`,
    }).from(referralRewards);

    // Jackpot payouts (completed pools with winners)
    const [jackpotStats] = await db.select({
      totalPaid: sql<string>`coalesce(sum(current_amount::numeric), 0)::text`,
      count: sql<number>`count(*)::int`,
    }).from(jackpotPools).where(sql`status = 'completed' AND winner_user_id IS NOT NULL`);

    // Jackpot contributions (1% of each pot accumulated)
    const [jackpotContribStats] = await db.select({
      totalContributed: sql<string>`coalesce(sum(amount::numeric), 0)::text`,
      betsCount: sql<number>`count(distinct bet_id)::int`,
    }).from(jackpotContributions);

    // Partner payouts
    const [partnerStats] = await db.select({
      totalPaid: sql<string>`coalesce(sum(amount::numeric), 0)::text`,
      count: sql<number>`count(*)::int`,
    }).from(partnerLedger);

    // Staking rewards (LAUNCH stakers)
    const [stakingStats] = await db.select({
      totalAccrued: sql<string>`coalesce(sum(amount::numeric), 0)::text`,
      totalFlushed: sql<string>`coalesce(sum(case when status = 'flushed' then amount::numeric else 0 end), 0)::text`,
      pending: sql<string>`coalesce(sum(case when status = 'pending' then amount::numeric else 0 end), 0)::text`,
      count: sql<number>`count(*)::int`,
    }).from(stakingLedger);

    // Event prizes distributed (AXM)
    const [eventStats] = await db.select({
      totalPrizes: sql<string>`coalesce(sum(ep.prize_amount::numeric), 0)::text`,
      winnersCount: sql<number>`count(*) filter (where ep.prize_amount::numeric > 0)::int`,
    }).from(sql`event_participants ep`);

    // Team withdrawals (already taken from treasury)
    const [teamWithdrawals] = await db.select({
      totalWithdrawn: sql<string>`coalesce(sum(amount::numeric), 0)::text`,
      count: sql<number>`count(*)::int`,
    }).from(treasuryLedgerTable).where(sql`source = 'team_withdrawal'`);

    // --- COIN Economy ---
    // Total COIN in circulation (sum of all user coin_balances)
    const [coinCirculation] = await db.select({
      totalCoin: sql<string>`coalesce(sum(coin_balance::numeric), 0)::text`,
      holdersCount: sql<number>`count(*) filter (where coin_balance::numeric > 0)::int`,
    }).from(vaultBalances);

    // COIN purchased via shop
    const [shopStats] = await db.select({
      totalCoinSold: sql<string>`coalesce(sum(coin_amount::numeric), 0)::text`,
      totalAxmRevenue: sql<string>`coalesce(sum(axm_amount::numeric), 0)::text`,
      purchasesCount: sql<number>`count(*) filter (where status = 'confirmed')::int`,
      uniqueBuyers: sql<number>`count(distinct user_id) filter (where status = 'confirmed')::int`,
    }).from(shopPurchases);

    // COIN from achievement claims
    const [achieveStats] = await db.select({
      totalCoin: sql<string>`coalesce(sum(coin_amount::numeric), 0)::text`,
      claimsCount: sql<number>`count(*)::int`,
    }).from(achievementClaims);

    // COIN transfers (P2P) — fees burned
    const [transferStats] = await db.execute(sql`
      SELECT
        coalesce(sum(amount::numeric), 0)::text AS total_transferred,
        coalesce(sum(fee::numeric), 0)::text AS total_fees,
        count(*)::int AS count
      FROM coin_transfers
    `);
    const xferRow = (transferStats as unknown as Array<{ total_transferred: string; total_fees: string; count: number }>)[0];

    // COIN spent on chat (premium messages, coin drops)
    const [chatSpend] = await db.execute(sql`
      SELECT coalesce(sum(amount::numeric), 0)::text AS total_drops
      FROM chat_coin_drops
    `) as unknown as Array<{ total_drops: string }>;

    // --- AXM Vault totals ---
    const [vaultTotals] = await db.select({
      totalAvailable: sql<string>`coalesce(sum(available::numeric), 0)::text`,
      totalLocked: sql<string>`coalesce(sum(locked::numeric), 0)::text`,
      totalBonus: sql<string>`coalesce(sum(bonus::numeric), 0)::text`,
      totalOffchainSpent: sql<string>`coalesce(sum(offchain_spent::numeric), 0)::text`,
      usersWithBalance: sql<number>`count(*) filter (where available::numeric > 0 or bonus::numeric > 0)::int`,
    }).from(vaultBalances);

    // Total bet volume and commission from bets
    const [betTotals] = await db.select({
      totalVolume: sql<string>`coalesce(sum(amount::numeric), 0)::text`,
      totalCommission: sql<string>`coalesce(sum(commission_amount::numeric), 0)::text`,
      resolvedCount: sql<number>`count(*) filter (where status in ('revealed', 'timeout_claimed'))::int`,
      totalBets: sql<number>`count(*)::int`,
      totalUsers: sql<number>`count(distinct maker_user_id)::int`,
    }).from(bets);

    return c.json({
      data: {
        // AXM P&L
        axm: {
          // Treasury sweep total (AXM withdrawn from contract to admin wallet)
          treasurySwept: commStats!.totalEarned,
          treasurySweptEntries: commStats!.entries,
          // Per-category breakdown (from actual ledger tables)
          referralPaid: refStats!.totalPaid,
          referralCount: refStats!.count,
          jackpotPaid: jackpotStats!.totalPaid,
          jackpotPaidCount: jackpotStats!.count,
          jackpotContributed: jackpotContribStats!.totalContributed,
          jackpotContribBets: jackpotContribStats!.betsCount,
          partnerPaid: partnerStats!.totalPaid,
          partnerCount: partnerStats!.count,
          stakingAccrued: stakingStats!.totalAccrued,
          stakingFlushed: stakingStats!.totalFlushed,
          stakingPending: stakingStats!.pending,
          stakingCount: stakingStats!.count,
          eventPrizes: eventStats!.totalPrizes,
          eventWinners: eventStats!.winnersCount,
          // Team share = total 10% commission - referrals - jackpot - staking - partners - already withdrawn
          teamShare: (() => {
            const totalComm = BigInt(betTotals!.totalCommission);
            const spent = BigInt(refStats!.totalPaid)
              + BigInt(jackpotContribStats!.totalContributed)
              + BigInt(stakingStats!.totalAccrued)
              + BigInt(partnerStats!.totalPaid)
              + BigInt(teamWithdrawals!.totalWithdrawn);
            return (totalComm - spent).toString();
          })(),
          teamWithdrawn: teamWithdrawals!.totalWithdrawn,
          teamWithdrawnCount: teamWithdrawals!.count,
        },
        // COIN Economy
        coin: {
          totalCirculating: coinCirculation!.totalCoin,
          holdersCount: coinCirculation!.holdersCount,
          shopSold: shopStats!.totalCoinSold,
          shopAxmRevenue: shopStats!.totalAxmRevenue,
          shopPurchases: shopStats!.purchasesCount,
          shopUniqueBuyers: shopStats!.uniqueBuyers,
          achievementsClaimed: achieveStats!.totalCoin,
          achievementsCount: achieveStats!.claimsCount,
          transfersTotal: xferRow?.total_transferred ?? '0',
          transfersFees: xferRow?.total_fees ?? '0',
          transfersCount: xferRow?.count ?? 0,
          coinDropsTotal: chatSpend?.total_drops ?? '0',
        },
        // AXM user vault totals
        vaultTotals: {
          totalAvailable: vaultTotals!.totalAvailable,
          totalLocked: vaultTotals!.totalLocked,
          totalBonus: vaultTotals!.totalBonus,
          totalOffchainSpent: vaultTotals!.totalOffchainSpent,
          usersWithBalance: vaultTotals!.usersWithBalance,
        },
        // Betting overview
        betting: {
          totalVolume: betTotals!.totalVolume,
          totalCommission: betTotals!.totalCommission,
          resolvedBets: betTotals!.resolvedCount,
          totalBets: betTotals!.totalBets,
          uniquePlayers: betTotals!.totalUsers,
        },
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'admin: economy overview failed');
    return c.json({ error: { code: 'ECONOMY_FAILED', message: err.message } }, 500);
  }
});

// GET /api/v1/admin/diagnostics — comprehensive system health check
adminRouter.get('/diagnostics', async (c) => {
  const db = getDb();

  try {
    const [betStats] = await db.select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where status = 'open')::int`,
      accepted: sql<number>`count(*) filter (where status = 'accepted')::int`,
      accepting: sql<number>`count(*) filter (where status = 'accepting')::int`,
      canceling: sql<number>`count(*) filter (where status = 'canceling')::int`,
      creating: sql<number>`count(*) filter (where status = 'creating')::int`,
      revealed: sql<number>`count(*) filter (where status = 'revealed')::int`,
      canceled: sql<number>`count(*) filter (where status = 'canceled')::int`,
      timeout: sql<number>`count(*) filter (where status = 'timeout_claimed')::int`,
      missingSecrets: sql<number>`count(*) filter (where status = 'accepted' and maker_secret is null)::int`,
    }).from(bets);

    const [vaultStats] = await db.select({
      totalUsers: sql<number>`count(*)::int`,
      totalAvailable: sql<string>`coalesce(sum(available::numeric), 0)::text`,
      totalLocked: sql<string>`coalesce(sum(locked::numeric), 0)::text`,
      negativeAvailable: sql<number>`count(*) filter (where available::numeric < 0)::int`,
      negativeLocked: sql<number>`count(*) filter (where locked::numeric < 0)::int`,
      usersWithLocked: sql<number>`count(*) filter (where locked::numeric > 0)::int`,
    }).from(vaultBalances);

    const [pendingSecretStats] = await db.select({
      count: sql<number>`count(*)::int`,
      oldest: sql<string>`min(created_at)::text`,
    }).from(pendingBetSecrets);

    // Check users with locked balance but no active bets
    const stuckLocked = await db.execute(sql`
      SELECT vb.user_id, vb.locked, u.address
      FROM vault_balances vb
      JOIN users u ON u.id = vb.user_id
      WHERE vb.locked::numeric > 0
        AND NOT EXISTS (
          SELECT 1 FROM bets b
          WHERE (b.maker_user_id = vb.user_id OR b.acceptor_user_id = vb.user_id)
            AND b.status IN ('open', 'accepted', 'accepting', 'canceling', 'creating')
        )
    `);

    return c.json({
      data: {
        bets: betStats,
        vault: vaultStats,
        pendingSecrets: pendingSecretStats,
        stuckLockedFunds: (stuckLocked as unknown as Array<{ user_id: string; locked: string; address: string }>).map(r => ({
          userId: r.user_id,
          address: r.address,
          locked: r.locked,
        })),
        coinFlipStats: getCoinFlipStats(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'admin: diagnostics failed');
    return c.json({ error: { code: 'DIAGNOSTICS_FAILED', message: err.message } }, 500);
  }
});

// ─── Jackpot Admin ────────────────────────────────────

// GET /admin/jackpot/tiers — all tiers with current pools
adminRouter.get('/jackpot/tiers', async (c) => {
  const data = await jackpotService.getTiersWithPools();
  return c.json({ data });
});

// PUT /admin/jackpot/tiers/:tierId — update tier settings
adminRouter.put(
  '/jackpot/tiers/:tierId',
  zValidator(
    'json',
    z.object({
      targetAmount: z.string().optional(),
      minGames: z.number().int().min(0).optional(),
      isActive: z.number().int().min(0).max(1).optional(),
    }),
  ),
  async (c) => {
    const tierId = Number(c.req.param('tierId'));
    if (Number.isNaN(tierId)) return c.json({ error: { code: 'INVALID_TIER_ID', message: 'Invalid tier ID' } }, 400);

    const body = c.req.valid('json');
    await jackpotService.updateTier(tierId, body);
    return c.json({ data: { status: 'ok' } });
  },
);

// POST /admin/jackpot/force-draw/:poolId — force a draw
adminRouter.post('/jackpot/force-draw/:poolId', async (c) => {
  const poolId = c.req.param('poolId');
  const result = await jackpotService.forceDrawPool(poolId);
  if (!result.success) return c.json({ error: { code: 'FORCE_DRAW_FAILED', message: result.message } }, 400);
  return c.json({ data: result });
});

// POST /admin/jackpot/reset-pool/:poolId — reset pool to 0
adminRouter.post('/jackpot/reset-pool/:poolId', async (c) => {
  const poolId = c.req.param('poolId');
  const result = await jackpotService.resetPool(poolId);
  if (!result.success) return c.json({ error: { code: 'RESET_FAILED', message: result.message } }, 400);
  return c.json({ data: result });
});

// ═══════════════════════════════════════════
// Announcements
// ═══════════════════════════════════════════

const AnnouncementCreateSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  priority: z.enum(['normal', 'important']).default('normal'),
});

// POST /admin/announcements — create and broadcast announcement
adminRouter.post('/announcements', zValidator('json', AnnouncementCreateSchema), async (c) => {
  const { title, message, priority } = c.req.valid('json');
  const db = getDb();

  // Auto-translate
  const i18n = await translationService.translateAnnouncement(title, message);

  // Get all user IDs
  const allUsers = await db.select({ id: users.id }).from(users);
  const sentCount = allUsers.length;

  // Insert announcement record
  const [announcement] = await db.insert(announcements).values({
    title,
    message,
    priority,
    sentCount,
    titleEn: i18n.titleEn,
    titleRu: i18n.titleRu,
    messageEn: i18n.messageEn,
    messageRu: i18n.messageRu,
  }).returning({ id: announcements.id });

  // Insert notification for each user
  if (allUsers.length > 0) {
    const notifValues = allUsers.map((u) => ({
      userId: u.id,
      type: 'announcement' as const,
      title,
      message,
      metadata: { announcementId: announcement!.id, priority },
    }));

    // Batch insert in chunks of 500
    for (let i = 0; i < notifValues.length; i += 500) {
      await db.insert(userNotifications).values(notifValues.slice(i, i + 500));
    }
  }

  // Broadcast via WebSocket to all connected clients
  wsService.broadcast({
    type: 'announcement',
    data: {
      id: announcement!.id,
      title,
      message,
      priority,
      titleEn: i18n.titleEn,
      titleRu: i18n.titleRu,
      messageEn: i18n.messageEn,
      messageRu: i18n.messageRu,
    },
  });

  logger.info({ announcementId: announcement!.id, sentCount, admin: c.get('address') }, 'admin: announcement sent');

  return c.json({ data: { id: announcement!.id, sentCount } });
});

const AnnouncementListSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// GET /admin/announcements — list past announcements (exclude deleted)
adminRouter.get('/announcements', zValidator('query', AnnouncementListSchema), async (c) => {
  const { limit, offset } = c.req.valid('query');
  const db = getDb();

  const notDeleted = sql`${announcements.status} != 'deleted'`;

  const [rows, countResult] = await Promise.all([
    db.select().from(announcements).where(notDeleted).orderBy(desc(announcements.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(announcements).where(notDeleted),
  ]);

  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      title: r.title,
      message: r.message,
      priority: r.priority,
      status: r.status,
      sentCount: r.sentCount,
      userId: r.userId,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      pricePaid: r.pricePaid,
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: {
      total: countResult[0]?.count ?? 0,
      limit,
      offset,
      hasMore: offset + limit < (countResult[0]?.count ?? 0),
    },
  });
});

// DELETE /admin/announcements/:id — soft delete
adminRouter.delete('/announcements/:id', async (c) => {
  const id = c.req.param('id');
  await announcementService.deleteAnnouncement(id);
  logger.info({ announcementId: id, admin: c.get('address') }, 'admin: announcement deleted');
  return c.json({ data: { status: 'ok' } });
});

// GET /admin/announcements/pending — pending sponsored requests
adminRouter.get('/announcements/pending', async (c) => {
  const pending = await announcementService.getPending();
  return c.json({ data: pending });
});

// POST /admin/announcements/:id/approve — approve sponsored
adminRouter.post('/announcements/:id/approve', async (c) => {
  const id = c.req.param('id');
  const result = await announcementService.approveSponsored(id);
  logger.info({ announcementId: id, admin: c.get('address') }, 'admin: sponsored announcement approved');
  return c.json({ data: result });
});

// POST /admin/announcements/:id/reject — reject sponsored
adminRouter.post(
  '/announcements/:id/reject',
  zValidator('json', z.object({ reason: z.string().optional() })),
  async (c) => {
    const id = c.req.param('id');
    const { reason } = c.req.valid('json');
    const result = await announcementService.rejectSponsored(id, reason);
    logger.info({ announcementId: id, reason, admin: c.get('address') }, 'admin: sponsored announcement rejected');
    return c.json({ data: result });
  },
);

// ═══════════════════════════════════════════
// VIP Administration
// ═══════════════════════════════════════════

// GET /admin/vip/stats — VIP revenue and subscriber counts
adminRouter.get('/vip/stats', async (c) => {
  const stats = await vipService.getStats();
  return c.json({ data: stats });
});

// GET /admin/vip/subscribers — list active VIP subscribers
const VipSubscribersQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

adminRouter.get('/vip/subscribers', zValidator('query', VipSubscribersQuerySchema), async (c) => {
  const { limit, offset } = c.req.valid('query');
  const subscribers = await vipService.getSubscribers(limit, offset);
  return c.json({ data: subscribers });
});

// POST /admin/vip/grant — grant free VIP to a user
const AdminGrantVipSchema = z.object({
  userId: z.string().uuid(),
  tier: z.enum(['silver', 'gold', 'diamond']),
  days: z.number().int().min(1).max(365).default(30),
});

adminRouter.post('/vip/grant', zValidator('json', AdminGrantVipSchema), async (c) => {
  const { userId, tier, days } = c.req.valid('json');
  await vipService.grantVip(userId, tier, days);
  logger.info({ userId, tier, days, admin: c.get('address') }, 'admin: VIP granted');
  return c.json({ data: { status: 'ok', message: `Granted ${tier} VIP for ${days} days` } });
});

// POST /admin/vip/revoke — revoke a user's VIP
const AdminRevokeVipSchema = z.object({
  userId: z.string().uuid(),
});

adminRouter.post('/vip/revoke', zValidator('json', AdminRevokeVipSchema), async (c) => {
  const { userId } = c.req.valid('json');
  await vipService.revokeVip(userId);
  logger.info({ userId, admin: c.get('address') }, 'admin: VIP revoked');
  return c.json({ data: { status: 'ok', message: 'VIP subscription revoked' } });
});

// PUT /admin/vip/config — update tier price/active status
const AdminUpdateVipConfigSchema = z.object({
  tier: z.enum(['silver', 'gold', 'diamond']),
  price: z.string().optional(),
  yearlyPrice: z.string().optional(),
  isActive: z.boolean().optional(),
});

adminRouter.put('/vip/config', zValidator('json', AdminUpdateVipConfigSchema), async (c) => {
  const body = c.req.valid('json');
  await vipService.updateConfig(body.tier, { price: body.price, yearlyPrice: body.yearlyPrice, isActive: body.isActive });
  logger.info({ ...body, admin: c.get('address') }, 'admin: VIP config updated');
  return c.json({ data: { status: 'ok' } });
});

// ═══════════════════════════════════════════
// Platform Config
// ═══════════════════════════════════════════

// GET /admin/config — all config entries
adminRouter.get('/config', async (c) => {
  const entries = await configService.getAll();
  return c.json({ data: entries });
});

// GET /admin/config/:category — config by category
adminRouter.get('/config/:category', async (c) => {
  const category = c.req.param('category');
  const entries = await configService.getByCategory(category);
  return c.json({ data: entries });
});

// PUT /admin/config/:key — update single config value
adminRouter.put(
  '/config/:key',
  zValidator('json', z.object({ value: z.string() })),
  async (c) => {
    const key = c.req.param('key');
    const { value } = c.req.valid('json');
    await configService.set(key, value, c.get('address'));
    return c.json({ data: { status: 'ok' } });
  },
);

// PUT /admin/config — bulk update config
adminRouter.put(
  '/config',
  zValidator('json', z.object({
    entries: z.array(z.object({ key: z.string(), value: z.string() })),
  })),
  async (c) => {
    const { entries } = c.req.valid('json');
    await configService.bulkSet(entries, c.get('address'));
    return c.json({ data: { status: 'ok', updated: entries.length } });
  },
);

// POST /admin/maintenance/toggle — toggle maintenance mode
adminRouter.post('/maintenance/toggle', async (c) => {
  const current = await configService.isMaintenanceMode();
  await configService.set('MAINTENANCE_MODE', String(!current), c.get('address'));
  logger.info({ enabled: !current, admin: c.get('address') }, 'admin: maintenance mode toggled');
  return c.json({ data: { enabled: !current } });
});

// ═══════════════════════════════════════════
// Commission Distribution + Partners
// ═══════════════════════════════════════════

// GET /admin/commission/breakdown — current commission distribution
adminRouter.get('/commission/breakdown', async (c) => {
  const result = await configService.validateCommissionDistribution();
  return c.json({ data: result });
});

// GET /admin/partners — list all partners
adminRouter.get('/partners', async (c) => {
  const partners = await partnerService.getAllPartners();
  return c.json({ data: partners });
});

// POST /admin/partners — add new partner
adminRouter.post(
  '/partners',
  zValidator('json', z.object({
    name: z.string().min(1).max(100),
    address: z.string().min(1),
    bps: z.number().int().min(0).max(1000),
  })),
  async (c) => {
    const { name, address, bps } = c.req.valid('json');
    const partner = await partnerService.addPartner(name, address, bps);

    // Validate commission distribution after adding
    const validation = await configService.validateCommissionDistribution();
    if (!validation.valid) {
      // Rollback — deactivate the partner
      await partnerService.deactivatePartner(partner.id);
      return c.json({ error: { code: 'COMMISSION_OVERFLOW', message: validation.error } }, 400);
    }

    logger.info({ partnerId: partner.id, name, bps, admin: c.get('address') }, 'admin: partner added');
    return c.json({ data: { id: partner.id, status: 'ok' } });
  },
);

// PUT /admin/partners/:id — update partner
adminRouter.put(
  '/partners/:id',
  zValidator('json', z.object({
    name: z.string().min(1).max(100).optional(),
    address: z.string().min(1).optional(),
    bps: z.number().int().min(0).max(1000).optional(),
    isActive: z.number().int().min(0).max(1).optional(),
  })),
  async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    await partnerService.updatePartner(id, body);

    // Validate after update
    const validation = await configService.validateCommissionDistribution();
    if (!validation.valid) {
      return c.json({ error: { code: 'COMMISSION_OVERFLOW', message: validation.error } }, 400);
    }

    logger.info({ partnerId: id, ...body, admin: c.get('address') }, 'admin: partner updated');
    return c.json({ data: { status: 'ok' } });
  },
);

// DELETE /admin/partners/:id — deactivate partner
adminRouter.delete('/partners/:id', async (c) => {
  const id = c.req.param('id');
  await partnerService.deactivatePartner(id);
  logger.info({ partnerId: id, admin: c.get('address') }, 'admin: partner deactivated');
  return c.json({ data: { status: 'ok' } });
});

// GET /admin/partners/:id/ledger — partner earnings ledger
adminRouter.get(
  '/partners/:id/ledger',
  zValidator('query', z.object({
    limit: z.coerce.number().min(1).max(100).default(50),
    offset: z.coerce.number().min(0).default(0),
  })),
  async (c) => {
    const id = c.req.param('id');
    const { limit, offset } = c.req.valid('query');
    const result = await partnerService.getPartnerLedger(id, limit, offset);
    return c.json({
      data: result.rows,
      pagination: { total: result.total, limit, offset, hasMore: offset + limit < result.total },
    });
  },
);

// GET /admin/partners/:id/stats — partner stats
adminRouter.get('/partners/:id/stats', async (c) => {
  const id = c.req.param('id');
  const stats = await partnerService.getPartnerStats(id);
  return c.json({ data: stats });
});

// POST /admin/partners/payout — pay all partners their accrued earnings via native AXM
adminRouter.post('/partners/payout', async (c) => {
  const unpaid = await partnerService.getUnpaidEarnings();
  if (unpaid.length === 0) {
    return c.json({ data: { status: 'nothing_to_pay', results: [] } });
  }

  const results: Array<{
    partnerId: string;
    name: string;
    address: string;
    amount: string;
    txHash?: string;
    error?: string;
  }> = [];

  for (const p of unpaid) {
    try {
      const result = await treasuryService.sendPrize(p.address, p.unpaid);
      await partnerService.markAsPaid(p.partnerId, result.txHash);

      // Record in treasury ledger
      try {
        await getDb().insert(treasuryLedgerTable).values({
          txhash: result.txHash,
          amount: p.unpaid,
          denom: gameDenom(),
          source: 'partner_payout',
        });
      } catch { /* non-critical */ }

      results.push({ partnerId: p.partnerId, name: p.name, address: p.address, amount: p.unpaid, txHash: result.txHash });
      logger.info({ partnerId: p.partnerId, name: p.name, amount: p.unpaid, txHash: result.txHash }, 'admin: partner payout sent');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ partnerId: p.partnerId, name: p.name, address: p.address, amount: p.unpaid, error: msg });
      logger.error({ err, partnerId: p.partnerId, name: p.name, amount: p.unpaid }, 'admin: partner payout failed');
    }
  }

  return c.json({ data: { status: 'completed', results } });
});

// ═══════════════════════════════════════════
// News Posts
// ═══════════════════════════════════════════

const NewsListSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// GET /admin/news — list all posts
adminRouter.get('/news', zValidator('query', NewsListSchema), async (c) => {
  const { limit, offset } = c.req.valid('query');
  const result = await newsService.listPosts(limit, offset);
  return c.json({
    data: result.rows,
    pagination: { total: result.total, limit, offset, hasMore: offset + limit < result.total },
  });
});

// POST /admin/news — create news post
adminRouter.post(
  '/news',
  zValidator('json', z.object({
    type: z.enum(['update', 'announcement']).default('update'),
    title: z.string().min(1).max(300),
    content: z.string().min(1).max(5000),
    priority: z.enum(['normal', 'important']).default('normal'),
  })),
  async (c) => {
    const body = c.req.valid('json');
    const post = await newsService.createPost(body);
    logger.info({ postId: post.id, admin: c.get('address') }, 'admin: news post created');
    return c.json({ data: { id: post.id } }, 201);
  },
);

// PUT /admin/news/:id — update news post
adminRouter.put(
  '/news/:id',
  zValidator('json', z.object({
    title: z.string().min(1).max(300).optional(),
    content: z.string().min(1).max(5000).optional(),
    priority: z.enum(['normal', 'important']).optional(),
    isPublished: z.number().int().min(0).max(1).optional(),
  })),
  async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    await newsService.updatePost(id, body);
    logger.info({ postId: id, admin: c.get('address') }, 'admin: news post updated');
    return c.json({ data: { status: 'ok' } });
  },
);

// DELETE /admin/news/:id — delete news post
adminRouter.delete('/news/:id', async (c) => {
  const id = c.req.param('id');
  await newsService.deletePost(id);
  logger.info({ postId: id, admin: c.get('address') }, 'admin: news post deleted');
  return c.json({ data: { status: 'ok' } });
});

// ═══════════════════════════════════════════
// Treasury Sweep — collect offchain_spent from users
// ═══════════════════════════════════════════

// GET /admin/treasury/sweep/preview — show candidates for sweep
adminRouter.get('/treasury/sweep/preview', async (c) => {
  const preview = await treasurySweepService.getSweepPreview();
  return c.json({ data: preview });
});

// POST /admin/treasury/sweep/execute — start sweep
adminRouter.post(
  '/treasury/sweep/execute',
  zValidator('json', z.object({ maxUsers: z.number().int().min(1).max(100).default(20) })),
  async (c) => {
    if (treasurySweepService.isRunning()) {
      return c.json({ error: { message: 'Sweep already in progress' } }, 409);
    }

    const { maxUsers } = c.req.valid('json');
    logger.info({ admin: c.get('address'), maxUsers }, 'admin: treasury sweep started');
    const summary = await treasurySweepService.executeSweep(maxUsers);
    return c.json({ data: summary });
  },
);

// GET /admin/treasury/sweep/status — check if sweep is running
adminRouter.get('/treasury/sweep/status', async (c) => {
  return c.json({ data: { running: treasurySweepService.isRunning() } });
});

// ═══════════════════════════════════════════
// Staking (LAUNCH staker rewards)
// ═══════════════════════════════════════════

adminRouter.get('/staking/stats', async (c) => {
  const stats = await stakingService.getStats();
  return c.json({ data: stats });
});

adminRouter.get('/staking/pending', async (c) => {
  const pendingTotal = await stakingService.getPendingTotal();
  return c.json({ data: { pendingTotal } });
});

adminRouter.post('/staking/flush', async (c) => {
  const result = await stakingService.flushToContract();
  if (!result) {
    return c.json({ data: { status: 'nothing_to_flush' } });
  }
  logger.info({ txHash: result.txHash, amount: result.amount, admin: c.get('address') }, 'admin: staking flush executed');
  return c.json({ data: { status: 'flushed', ...result } });
});

// ═══════════════════════════════════════════
// Production Reset
// ═══════════════════════════════════════════

const ProductionResetSchema = z.object({
  confirmation: z.literal('RESET_TO_PRODUCTION'),
  archiveFinancials: z.boolean().default(true),
});

adminRouter.post('/system/production-reset', zValidator('json', ProductionResetSchema), async (c) => {
  const { archiveFinancials } = c.req.valid('json');
  const adminAddr = c.get('address') as string;
  const db = getDb();

  logger.warn({ admin: adminAddr }, '🚨 PRODUCTION RESET INITIATED');

  const counts: Record<string, number> = {};

  try {
    // Phase 1: Archive financial tables (optional — copy to *_archive suffix)
    if (archiveFinancials) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      for (const tbl of ['treasury_ledger', 'vault_transactions', 'shop_purchases', 'vip_subscriptions']) {
        const archiveName = `${tbl}_archive_${timestamp}`;
        await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS "${archiveName}" AS SELECT * FROM "${tbl}"`));
        logger.info({ table: tbl, archive: archiveName }, 'Archived table');
      }
      counts.archived = 4;
    }

    // Phase 2: Zero out balances (keep records, reset amounts)
    const [vbResult] = await db.execute(sql`
      UPDATE vault_balances SET available = '0', locked = '0', bonus = '0',
        offchain_spent = '0', coin_balance = '0', updated_at = now()
    `);
    counts.vaultBalancesZeroed = Number((vbResult as any)?.rowCount ?? 0);

    const [rbResult] = await db.execute(sql`
      UPDATE referral_balances SET unclaimed = '0', total_earned = '0', updated_at = now()
    `);
    counts.referralBalancesZeroed = Number((rbResult as any)?.rowCount ?? 0);

    // Phase 3: Delete game data (order matters — FK constraints)
    // bet_messages references bets
    const [r1] = await db.delete(betMessages).returning({ id: betMessages.id });
    counts.betMessages = r1 ? 1 : 0;
    await db.execute(sql`DELETE FROM bet_messages`).then(r => counts.betMessages = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    // jackpot_contributions references jackpot_pools
    await db.execute(sql`DELETE FROM jackpot_contributions`).then(r => counts.jackpotContributions = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});
    await db.execute(sql`DELETE FROM jackpot_pools`).then(r => counts.jackpotPools = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    // event_participants references events
    await db.execute(sql`DELETE FROM event_participants`).then(r => counts.eventParticipants = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    // partner_ledger references bets
    await db.execute(sql`DELETE FROM partner_ledger`).then(r => counts.partnerLedger = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    // staking_ledger references bets
    await db.execute(sql`DELETE FROM staking_ledger`).then(r => counts.stakingLedger = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    // referral_rewards references bets
    await db.execute(sql`DELETE FROM referral_rewards`).then(r => counts.referralRewards = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    // achievement_claims references bets (achievementId)
    await db.execute(sql`DELETE FROM achievement_claims`).then(r => counts.achievementClaims = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    // bets (main game table)
    await db.execute(sql`DELETE FROM bets`).then(r => counts.bets = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    // pending_bet_secrets
    await db.execute(sql`DELETE FROM pending_bet_secrets`).then(r => counts.pendingBetSecrets = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    // referrals (relationships — codes kept)
    await db.execute(sql`DELETE FROM referrals`).then(r => counts.referrals = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    // Phase 4: Financial ledgers (cleared after archiving)
    await db.execute(sql`DELETE FROM treasury_ledger`).then(r => counts.treasuryLedger = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});
    await db.execute(sql`DELETE FROM vault_transactions`).then(r => counts.vaultTransactions = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});
    await db.execute(sql`DELETE FROM shop_purchases`).then(r => counts.shopPurchases = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});
    await db.execute(sql`DELETE FROM vip_subscriptions`).then(r => counts.vipSubscriptions = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});
    await db.execute(sql`DELETE FROM coin_transfers`).then(r => counts.coinTransfers = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    // Phase 5: Social & chat
    await db.execute(sql`DELETE FROM global_chat_messages`).then(r => counts.chatMessages = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});
    await db.execute(sql`DELETE FROM profile_reactions`).then(r => counts.profileReactions = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});
    await db.execute(sql`DELETE FROM user_favorites`).then(r => counts.userFavorites = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});
    await db.execute(sql`DELETE FROM user_notifications`).then(r => counts.notifications = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    // Phase 6: VIP cosmetics & boosts (keep configs)
    await db.execute(sql`DELETE FROM bet_pins`).then(r => counts.betPins = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});
    await db.execute(sql`DELETE FROM boost_usage`).then(r => counts.boostUsage = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});
    await db.execute(sql`DELETE FROM vip_customization`).then(r => counts.vipCustomization = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    // Phase 7: Audit logs
    await db.execute(sql`DELETE FROM tx_events`).then(r => counts.txEvents = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});
    await db.execute(sql`DELETE FROM relayer_transactions`).then(r => counts.relayerTransactions = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    // Phase 8: Sessions (force re-auth)
    await db.execute(sql`DELETE FROM sessions`).then(r => counts.sessions = Number((r as any)[0]?.rowCount ?? 0)).catch(() => {});

    logger.warn({ admin: adminAddr, counts }, '🚨 PRODUCTION RESET COMPLETED');

    return c.json({
      data: {
        status: 'completed',
        message: 'Production reset completed. All game data cleared, user accounts preserved.',
        counts,
        preserved: ['users', 'referral_codes', 'platform_config', 'partner_config', 'vip_config', 'jackpot_tiers', 'news_posts', 'events (structure)'],
      },
    });
  } catch (err: any) {
    logger.error({ err, admin: adminAddr }, 'PRODUCTION RESET FAILED');
    return c.json({ error: { code: 'RESET_FAILED', message: err.message } }, 500);
  }
});

// ═══════════════════════════════════════════
// AI Bot
// ═══════════════════════════════════════════

/** Get AI bot config */
adminRouter.get('/ai-bot/config', async (c) => {
  const config = await aiBotService.getConfig();
  return c.json({ data: config });
});

/** Update AI bot config */
adminRouter.put('/ai-bot/config', zValidator('json', z.object({
  commentaryEnabled: z.boolean().optional(),
  chatBotEnabled: z.boolean().optional(),
  botName: z.string().min(1).max(30).optional(),
  systemPrompt: z.string().max(5000).optional(),
  model: z.string().optional(),
  chatCooldownSec: z.number().int().min(5).max(300).optional(),
  bigBetThreshold: z.number().int().min(1).optional(),
  streakThreshold: z.number().int().min(2).max(20).optional(),
  silenceMinutes: z.number().int().min(5).max(120).optional(),
  respondToMentions: z.boolean().optional(),
  reactToBigBets: z.boolean().optional(),
  reactToStreaks: z.boolean().optional(),
  postOnSilence: z.boolean().optional(),
  extraContext: z.string().max(2000).optional(),
  activePersonaId: z.string().nullable().optional(),
  personas: z.array(z.object({
    id: z.string(),
    name: z.string(),
    prompt: z.string(),
  })).optional(),
}).strict()), async (c) => {
  const body = c.req.valid('json');
  await aiBotService.updateConfig(body);
  const config = await aiBotService.getConfig();
  return c.json({ data: config });
});

/** Get recent AI commentary (for admin preview) */
adminRouter.get('/ai-bot/commentary', async (c) => {
  const limit = Number(c.req.query('limit') ?? 20);
  const commentary = await aiBotService.getRecentCommentary(Math.min(limit, 50));
  return c.json({ data: commentary });
});

/** Get AI bot stats */
adminRouter.get('/ai-bot/stats', async (c) => {
  const stats = await aiBotService.getStats();
  return c.json({ data: stats });
});

/** Get recent bot chat messages */
adminRouter.get('/ai-bot/chat-messages', async (c) => {
  const limit = Number(c.req.query('limit') ?? 20);
  const messages = await aiBotService.getRecentBotChatMessages(Math.min(limit, 50));
  return c.json({ data: messages });
});

/** Clear all AI commentary */
adminRouter.delete('/ai-bot/commentary', async (c) => {
  const deleted = await aiBotService.clearCommentary();
  logger.info({ deleted, admin: c.get('address') }, 'Admin cleared AI commentary');
  return c.json({ data: { deleted } });
});

/** Clear all bot chat messages */
adminRouter.delete('/ai-bot/chat-messages', async (c) => {
  const deleted = await aiBotService.clearBotChatMessages();
  logger.info({ deleted, admin: c.get('address') }, 'Admin cleared bot chat messages');
  return c.json({ data: { deleted } });
});
