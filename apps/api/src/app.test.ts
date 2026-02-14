import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

// Mock all service dependencies to avoid DB/Redis connections
vi.mock('./lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./lib/db.js', () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock('./services/user.service.js', () => ({
  userService: {
    findOrCreateUser: vi.fn(async (address: string) => ({
      id: 'mock_user_id',
      address,
      profileNickname: null,
      avatarUrl: null,
    })),
    getUserByAddress: vi.fn(),
    getActiveSession: vi.fn(),
    createSession: vi.fn(),
  },
}));

vi.mock('./services/bet.service.js', () => ({
  betService: {
    getOpenBets: vi.fn(async () => ({ data: [], cursor: null, has_more: false })),
    getBetById: vi.fn(),
    createBet: vi.fn(),
    getOpenBetCountForUser: vi.fn(async () => 0),
  },
}));

vi.mock('./services/vault.service.js', () => ({
  vaultService: {
    getBalance: vi.fn(async () => ({ available: '1000', locked: '0', total: '1000' })),
    lockFunds: vi.fn(),
    unlockFunds: vi.fn(),
  },
}));

vi.mock('./services/ws.service.js', () => ({
  wsService: {
    emitBetCreated: vi.fn(),
    emitBetAccepted: vi.fn(),
    emitBetRevealed: vi.fn(),
    emitBetCanceled: vi.fn(),
    emitBetTimeoutClaimed: vi.fn(),
    emitBalanceUpdated: vi.fn(),
  },
}));

const { app } = await import('./app.js');

describe('Health Endpoint', () => {
  it('GET /health returns 200 with status ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const body = await res.json() as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTruthy();
    // Verify ISO format
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});

describe('404 Handler', () => {
  it('returns structured 404 for unknown routes', async () => {
    const res = await app.request('/nonexistent');
    expect(res.status).toBe(404);

    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Route not found');
  });
});

describe('CORS', () => {
  it('includes CORS headers', async () => {
    const res = await app.request('/health', {
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });
});

describe('Bets API (mocked)', () => {
  it('GET /api/v1/bets returns 200 with empty list', async () => {
    const res = await app.request('/api/v1/bets?limit=20');
    expect(res.status).toBe(200);

    const body = await res.json() as { data: unknown[]; has_more: boolean };
    expect(body.data).toEqual([]);
    expect(body.has_more).toBe(false);
  });

  it('GET /api/v1/bets/:betId returns 404 for nonexistent bet', async () => {
    const { betService } = await import('./services/bet.service.js');
    (betService.getBetById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await app.request('/api/v1/bets/999');
    expect(res.status).toBe(404);
  });

  it('POST /api/v1/bets requires auth', async () => {
    const res = await app.request('/api/v1/bets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: '100', commitment: 'abc' }),
    });
    // Without wallet header, should be 401
    expect(res.status).toBe(401);
  });
});

describe('Vault API (mocked)', () => {
  it('GET /api/v1/vault/balance requires auth', async () => {
    const res = await app.request('/api/v1/vault/balance');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/vault/balance with auth returns balance', async () => {
    const res = await app.request('/api/v1/vault/balance', {
      headers: { 'x-wallet-address': 'axm1testuser' },
    });
    expect(res.status).toBe(200);

    const body = await res.json() as { data: { available: string } };
    expect(body.data.available).toBe('1000');
  });
});

describe('Users API (mocked)', () => {
  it('GET /api/v1/users/me requires auth', async () => {
    const res = await app.request('/api/v1/users/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/users/me with auth returns user profile', async () => {
    const res = await app.request('/api/v1/users/me', {
      headers: { 'x-wallet-address': 'axm1testuser' },
    });
    expect(res.status).toBe(200);

    const body = await res.json() as { data: { address: string } };
    expect(body.data.address).toBe('axm1testuser');
  });
});
