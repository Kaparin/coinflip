import { Hono } from 'hono';

export const usersRouter = new Hono();

// GET /api/v1/users/me — Current user profile
usersRouter.get('/me', async (c) => {
  // TODO: get user from session
  return c.json({
    data: {
      address: '',
      nickname: null,
      avatar_url: null,
      stats: { total_bets: 0, wins: 0, losses: 0, total_wagered: '0', total_won: '0' },
      authz_enabled: false,
      authz_expires_at: null,
      fee_sponsored: false,
    },
  });
});

// GET /api/v1/users/:address — Public profile
usersRouter.get('/:address', async (c) => {
  const address = c.req.param('address');
  // TODO: query user by address
  return c.json({
    data: {
      address,
      nickname: null,
      avatar_url: null,
      stats: { total_bets: 0, wins: 0, losses: 0, total_wagered: '0', total_won: '0' },
      authz_enabled: false,
      authz_expires_at: null,
      fee_sponsored: false,
    },
  });
});

// GET /api/v1/leaderboard
usersRouter.get('/../leaderboard', async (c) => {
  // TODO: query top players
  return c.json({ data: [], cursor: null, has_more: false });
});
