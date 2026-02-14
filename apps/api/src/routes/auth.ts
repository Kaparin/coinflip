import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ConnectRequestSchema } from '@coinflip/shared/schemas';

export const authRouter = new Hono();

// POST /api/v1/auth/connect — Connect wallet
authRouter.post('/connect', zValidator('json', ConnectRequestSchema), async (c) => {
  const body = c.req.valid('json');
  // TODO: verify signature, create/update user, create session
  return c.json({
    data: {
      session_id: 'placeholder',
      address: body.address,
    },
  });
});

// GET /api/v1/auth/grants — Check authz + feegrant status
authRouter.get('/grants', async (c) => {
  // TODO: query chain for authz grants and feegrant allowance
  return c.json({
    data: {
      authz_granted: false,
      authz_expires_at: null,
      authz_calls_remaining: null,
      fee_grant_active: false,
      fee_grant_daily_remaining: null,
    },
  });
});
