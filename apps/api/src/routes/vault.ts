import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { DepositRequestSchema, WithdrawRequestSchema } from '@coinflip/shared/schemas';

export const vaultRouter = new Hono();

// GET /api/v1/vault/balance
vaultRouter.get('/balance', async (c) => {
  // TODO: query vault balance from DB / chain
  return c.json({
    data: { available: '0', locked: '0', total: '0' },
  });
});

// POST /api/v1/vault/deposit
vaultRouter.post('/deposit', zValidator('json', DepositRequestSchema), async (c) => {
  const body = c.req.valid('json');
  // TODO: generate Axiome Connect payload for CW20 Send
  return c.json({
    data: {
      axiome_connect_payload: `axiomesign://...`,
      amount: body.amount,
    },
  });
});

// POST /api/v1/vault/withdraw
vaultRouter.post('/withdraw', zValidator('json', WithdrawRequestSchema), async (c) => {
  const body = c.req.valid('json');
  // TODO: validate balance, submit MsgExec for withdraw
  return c.json({
    data: { status: 'pending', amount: body.amount },
  });
});
