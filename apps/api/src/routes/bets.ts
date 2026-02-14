import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  CreateBetRequestSchema,
  AcceptBetRequestSchema,
  RevealRequestSchema,
  BetListQuerySchema,
  BetHistoryQuerySchema,
} from '@coinflip/shared/schemas';

export const betsRouter = new Hono();

// GET /api/v1/bets — List open bets
betsRouter.get('/', zValidator('query', BetListQuerySchema), async (c) => {
  const query = c.req.valid('query');
  // TODO: implement query from DB
  return c.json({ data: [], cursor: null, has_more: false });
});

// POST /api/v1/bets — Create bet
betsRouter.post('/', zValidator('json', CreateBetRequestSchema), async (c) => {
  const body = c.req.valid('json');
  // TODO: validate user session, check balances, submit MsgExec via relayer
  return c.json({ data: { id: 1, ...body, status: 'open' } }, 201);
});

// GET /api/v1/bets/history — Bet history
betsRouter.get('/history', zValidator('query', BetHistoryQuerySchema), async (c) => {
  const query = c.req.valid('query');
  // TODO: query resolved bets from DB
  return c.json({ data: [], cursor: null, has_more: false });
});

// GET /api/v1/bets/:betId — Get bet details
betsRouter.get('/:betId', async (c) => {
  const betId = c.req.param('betId');
  // TODO: query bet from DB
  return c.json({ data: { id: betId, status: 'open' } });
});

// POST /api/v1/bets/:betId/accept — Accept bet
betsRouter.post('/:betId/accept', zValidator('json', AcceptBetRequestSchema), async (c) => {
  const betId = c.req.param('betId');
  const body = c.req.valid('json');
  // TODO: validate, submit MsgExec
  return c.json({ data: { id: betId, ...body, status: 'accepted' } });
});

// POST /api/v1/bets/:betId/reveal — Reveal
betsRouter.post('/:betId/reveal', zValidator('json', RevealRequestSchema), async (c) => {
  const betId = c.req.param('betId');
  const body = c.req.valid('json');
  // TODO: validate commitment, submit MsgExec
  return c.json({ data: { id: betId, ...body, status: 'revealed' } });
});

// POST /api/v1/bets/:betId/cancel — Cancel bet
betsRouter.post('/:betId/cancel', async (c) => {
  const betId = c.req.param('betId');
  // TODO: validate ownership, submit MsgExec
  return c.json({ data: { id: betId, status: 'canceled' } });
});

// POST /api/v1/bets/:betId/claim-timeout — Claim timeout
betsRouter.post('/:betId/claim-timeout', async (c) => {
  const betId = c.req.param('betId');
  // TODO: validate timeout, submit MsgExec
  return c.json({ data: { id: betId, status: 'timeout_claimed' } });
});
