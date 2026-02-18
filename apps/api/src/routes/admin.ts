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
import { users, bets, vaultBalances, pendingBetSecrets } from '@coinflip/db/schema';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { getCoinFlipStats } from './bets.js';
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

  // Attach vault balances
  const userIds = rows.map(u => u.id);
  const balances = userIds.length > 0
    ? await db.select({
        userId: vaultBalances.userId,
        available: vaultBalances.available,
        locked: vaultBalances.locked,
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

  const data = rows.map(u => ({
    id: u.id,
    address: u.address,
    nickname: u.nickname,
    createdAt: u.createdAt?.toISOString() ?? null,
    vault: {
      available: balanceMap.get(u.id)?.available ?? '0',
      locked: balanceMap.get(u.id)?.locked ?? '0',
    },
    totalBets: betCountMap.get(u.id) ?? 0,
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
  if (user.address && env.COINFLIP_CONTRACT_ADDR) {
    try {
      const vbQuery = btoa(JSON.stringify({ vault_balance: { address: user.address } }));
      const vbRes = await fetch(
        `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${vbQuery}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (vbRes.ok) {
        const vbData = await vbRes.json() as { data: { available: string; locked: string } };
        chainBalance = vbData.data;
      }
      const ubQuery = btoa(JSON.stringify({ user_bets: { address: user.address, limit: 20 } }));
      const ubRes = await fetch(
        `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${ubQuery}`,
        { signal: AbortSignal.timeout(5000) },
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
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

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
    const res = await fetch(
      `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${encoded}`,
      { signal: AbortSignal.timeout(5000) },
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
    const res = await fetch(
      `${env.AXIOME_REST_URL}/cosmwasm/wasm/v1/contract/${env.COINFLIP_CONTRACT_ADDR}/smart/${encoded}`,
      { signal: AbortSignal.timeout(5000) },
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
