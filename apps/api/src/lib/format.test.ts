import { describe, it, expect } from 'vitest';
import { formatBetResponse, shortAddress } from './format.js';
import type { BetRow } from '../services/bet.service.js';

// Helper to create a mock BetRow
function makeBetRow(overrides: Partial<BetRow> = {}): BetRow {
  return {
    id: '1',
    betId: 42n,
    makerUserId: 'user_maker_123',
    amount: '100',
    status: 'open',
    commitment: 'abc123commit',
    txhashCreate: 'hash_create_xyz',
    createdTime: new Date('2026-01-15T10:00:00Z'),
    acceptorUserId: null,
    acceptorGuess: null,
    acceptedTime: null,
    txhashAccept: null,
    winnerUserId: null,
    payoutAmount: null,
    commissionAmount: null,
    resolvedTime: null,
    txhashResolve: null,
    updatedAt: new Date(),
    ...overrides,
  } as BetRow;
}

describe('formatBetResponse', () => {
  it('formats an open bet correctly', () => {
    const row = makeBetRow();
    const result = formatBetResponse(row);

    expect(result.id).toBe(42);
    expect(result.maker).toBe('user_maker_123');
    expect(result.amount).toBe('100');
    expect(result.status).toBe('open');
    expect(result.created_at).toBe('2026-01-15T10:00:00.000Z');
    expect(result.txhash_create).toBe('hash_create_xyz');
    expect(result.acceptor).toBeNull();
    expect(result.acceptor_guess).toBeNull();
    expect(result.accepted_at).toBeNull();
    expect(result.winner).toBeNull();
    expect(result.reveal_deadline).toBeNull();
    expect(result.reveal_side).toBeNull();
  });

  it('formats an accepted bet with reveal deadline', () => {
    const acceptedTime = new Date('2026-01-15T10:05:00Z');
    const row = makeBetRow({
      status: 'accepted',
      acceptorUserId: 'user_accept_456',
      acceptorGuess: 'heads',
      acceptedTime,
      txhashAccept: 'hash_accept_abc',
    });

    const result = formatBetResponse(row);

    expect(result.status).toBe('accepted');
    expect(result.acceptor).toBe('user_accept_456');
    expect(result.acceptor_guess).toBe('heads');
    expect(result.accepted_at).toBe('2026-01-15T10:05:00.000Z');
    expect(result.txhash_accept).toBe('hash_accept_abc');

    // Reveal deadline = accepted_at + 300 seconds (5 minutes)
    expect(result.reveal_deadline).toBe('2026-01-15T10:10:00.000Z');
  });

  it('formats a resolved bet', () => {
    const row = makeBetRow({
      status: 'revealed',
      acceptorUserId: 'user_accept_456',
      acceptorGuess: 'tails',
      acceptedTime: new Date('2026-01-15T10:05:00Z'),
      winnerUserId: 'user_maker_123',
      payoutAmount: '180',
      commissionAmount: '20',
      resolvedTime: new Date('2026-01-15T10:06:00Z'),
      txhashResolve: 'hash_reveal_def',
    });

    const result = formatBetResponse(row);

    expect(result.status).toBe('revealed');
    expect(result.winner).toBe('user_maker_123');
    expect(result.payout_amount).toBe('180');
    expect(result.commission_amount).toBe('20');
    expect(result.resolved_at).toBe('2026-01-15T10:06:00.000Z');
  });

  it('uses addressMap for display names', () => {
    const row = makeBetRow({
      status: 'revealed',
      acceptorUserId: 'user_accept_456',
      winnerUserId: 'user_maker_123',
    });

    const addressMap = new Map([
      ['user_maker_123', 'axiome1maker...'],
      ['user_accept_456', 'axiome1accept...'],
    ]);

    const result = formatBetResponse(row, addressMap);

    expect(result.maker).toBe('axiome1maker...');
    expect(result.acceptor).toBe('axiome1accept...');
    expect(result.winner).toBe('axiome1maker...');
  });
});

describe('shortAddress', () => {
  it('truncates long addresses', () => {
    const addr = 'axiome1abc123456789def0ghijklmnopqrstuvwxyz';
    const short = shortAddress(addr);
    expect(short).toMatch(/^axiome1abc\.\.\.uvwxyz$/);
    expect(short.length).toBeLessThan(addr.length);
  });

  it('returns short addresses unchanged', () => {
    const addr = 'short';
    expect(shortAddress(addr)).toBe('short');
  });

  it('returns 16-char addresses unchanged', () => {
    const addr = '1234567890123456';
    expect(shortAddress(addr)).toBe(addr);
  });
});
