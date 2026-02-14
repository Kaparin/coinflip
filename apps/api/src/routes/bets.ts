import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  CreateBetRequestSchema,
  AcceptBetRequestSchema,
  RevealRequestSchema,
  BetListQuerySchema,
  BetHistoryQuerySchema,
} from '@coinflip/shared/schemas';
import { MIN_BET_AMOUNT, MAX_OPEN_BETS_PER_USER } from '@coinflip/shared/constants';
import { authMiddleware } from '../middleware/auth.js';
import { betService } from '../services/bet.service.js';
import { vaultService } from '../services/vault.service.js';
import { wsService } from '../services/ws.service.js';
import { formatBetResponse } from '../lib/format.js';
import { Errors } from '../lib/errors.js';

export const betsRouter = new Hono();

// GET /api/v1/bets — List open bets (public, no auth)
betsRouter.get('/', zValidator('query', BetListQuerySchema), async (c) => {
  const { cursor, limit, status, min_amount, max_amount } = c.req.valid('query');

  const result = await betService.getOpenBets({
    cursor: cursor ?? undefined,
    limit,
    minAmount: min_amount,
    maxAmount: max_amount,
  });

  return c.json({
    data: result.data.map((bet) => formatBetResponse(bet)),
    cursor: result.cursor,
    has_more: result.has_more,
  });
});

// GET /api/v1/bets/history — Bet history (auth required)
betsRouter.get('/history', authMiddleware, zValidator('query', BetHistoryQuerySchema), async (c) => {
  const user = c.get('user') as { id: string };
  const { cursor, limit } = c.req.valid('query');

  const result = await betService.getUserBetHistory({
    userId: user.id,
    cursor: cursor ?? undefined,
    limit,
  });

  return c.json({
    data: result.data.map((bet) => formatBetResponse(bet)),
    cursor: result.cursor,
    has_more: result.has_more,
  });
});

// GET /api/v1/bets/:betId — Get bet details (public)
betsRouter.get('/:betId', async (c) => {
  const betId = BigInt(c.req.param('betId'));
  const bet = await betService.getBetById(betId);

  if (!bet) throw Errors.betNotFound(betId.toString());

  return c.json({ data: formatBetResponse(bet) });
});

// POST /api/v1/bets — Create bet (auth required)
betsRouter.post('/', authMiddleware, zValidator('json', CreateBetRequestSchema), async (c) => {
  const user = c.get('user') as { id: string };
  const { amount, commitment } = c.req.valid('json');

  // Validate min bet
  if (BigInt(amount) < BigInt(MIN_BET_AMOUNT)) {
    throw Errors.belowMinBet(MIN_BET_AMOUNT);
  }

  // Check balance
  const balance = await vaultService.getBalance(user.id);
  if (BigInt(balance.available) < BigInt(amount)) {
    throw Errors.insufficientBalance(amount, balance.available);
  }

  // Check open bets count
  const openCount = await betService.getOpenBetCountForUser(user.id);
  if (openCount >= MAX_OPEN_BETS_PER_USER) {
    throw Errors.tooManyOpenBets(MAX_OPEN_BETS_PER_USER);
  }

  // TODO: In production, submit MsgExec to chain via relayer and get real betId + txhash
  // For now, create locally in DB
  const betId = BigInt(Date.now()); // placeholder — real ID comes from chain
  const txhash = `placeholder_${Date.now()}`; // placeholder

  // Lock funds in vault
  await vaultService.lockFunds(user.id, amount);

  // Create bet record
  const bet = await betService.createBet({
    betId,
    makerUserId: user.id,
    amount,
    commitment,
    txhashCreate: txhash,
  });

  // Broadcast to WebSocket clients
  wsService.emitBetCreated(formatBetResponse(bet) as unknown as Record<string, unknown>);

  return c.json({ data: formatBetResponse(bet) }, 201);
});

// POST /api/v1/bets/:betId/accept — Accept bet (auth required)
betsRouter.post('/:betId/accept', authMiddleware, zValidator('json', AcceptBetRequestSchema), async (c) => {
  const user = c.get('user') as { id: string };
  const betId = BigInt(c.req.param('betId'));
  const { guess } = c.req.valid('json');

  const existing = await betService.getBetById(betId);
  if (!existing) throw Errors.betNotFound(betId.toString());
  if (existing.status !== 'open') throw Errors.invalidState('accept', existing.status);
  if (existing.makerUserId === user.id) throw Errors.selfAccept();

  // Check balance
  const balance = await vaultService.getBalance(user.id);
  if (BigInt(balance.available) < BigInt(existing.amount)) {
    throw Errors.insufficientBalance(existing.amount, balance.available);
  }

  // Lock acceptor funds
  await vaultService.lockFunds(user.id, existing.amount);

  // TODO: Submit MsgExec to chain
  const txhash = `placeholder_accept_${Date.now()}`;

  const bet = await betService.acceptBet({
    betId,
    acceptorUserId: user.id,
    acceptorGuess: guess,
    txhashAccept: txhash,
  });

  if (bet) {
    wsService.emitBetAccepted(formatBetResponse(bet) as unknown as Record<string, unknown>);
  }

  return c.json({ data: bet ? formatBetResponse(bet) : null });
});

// POST /api/v1/bets/:betId/reveal — Reveal (auth required)
betsRouter.post('/:betId/reveal', authMiddleware, zValidator('json', RevealRequestSchema), async (c) => {
  const user = c.get('user') as { id: string };
  const betId = BigInt(c.req.param('betId'));
  const { side, secret } = c.req.valid('json');

  const existing = await betService.getBetById(betId);
  if (!existing) throw Errors.betNotFound(betId.toString());
  if (existing.status !== 'accepted') throw Errors.invalidState('reveal', existing.status);
  if (existing.makerUserId !== user.id) throw Errors.unauthorized();

  // TODO: Submit MsgExec to chain — chain verifies commitment and resolves
  // For now, mark as revealed in DB (real logic happens on-chain)
  const txhash = `placeholder_reveal_${Date.now()}`;

  // Placeholder resolution — in production, indexer handles this from chain events
  const bet = await betService.resolveBet({
    betId,
    winnerUserId: user.id, // placeholder — real winner determined by chain
    commissionAmount: '0',
    payoutAmount: existing.amount,
    txhashResolve: txhash,
    status: 'revealed',
  });

  if (bet) {
    wsService.emitBetRevealed(formatBetResponse(bet) as unknown as Record<string, unknown>);
  }

  return c.json({ data: bet ? formatBetResponse(bet) : null });
});

// POST /api/v1/bets/:betId/cancel — Cancel (auth required)
betsRouter.post('/:betId/cancel', authMiddleware, async (c) => {
  const user = c.get('user') as { id: string };
  const betId = BigInt(c.req.param('betId'));

  const existing = await betService.getBetById(betId);
  if (!existing) throw Errors.betNotFound(betId.toString());
  if (existing.status !== 'open') throw Errors.invalidState('cancel', existing.status);
  if (existing.makerUserId !== user.id) throw Errors.unauthorized();

  // Unlock funds
  await vaultService.unlockFunds(user.id, existing.amount);

  const bet = await betService.cancelBet(betId);

  if (bet) {
    wsService.emitBetCanceled(formatBetResponse(bet) as unknown as Record<string, unknown>);
  }

  return c.json({ data: bet ? formatBetResponse(bet) : null });
});

// POST /api/v1/bets/:betId/claim-timeout — Claim timeout (auth required)
betsRouter.post('/:betId/claim-timeout', authMiddleware, async (c) => {
  const user = c.get('user') as { id: string };
  const betId = BigInt(c.req.param('betId'));

  const existing = await betService.getBetById(betId);
  if (!existing) throw Errors.betNotFound(betId.toString());
  if (existing.status !== 'accepted') throw Errors.invalidState('claim_timeout', existing.status);
  if (existing.acceptorUserId !== user.id) throw Errors.unauthorized();

  // TODO: Submit MsgExec to chain
  const txhash = `placeholder_timeout_${Date.now()}`;

  const bet = await betService.resolveBet({
    betId,
    winnerUserId: user.id,
    commissionAmount: '0',
    payoutAmount: existing.amount,
    txhashResolve: txhash,
    status: 'timeout_claimed',
  });

  if (bet) {
    wsService.emitBetTimeoutClaimed(formatBetResponse(bet) as unknown as Record<string, unknown>);
  }

  return c.json({ data: bet ? formatBetResponse(bet) : null });
});
