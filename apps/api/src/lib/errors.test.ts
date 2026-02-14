import { describe, it, expect } from 'vitest';
import { AppError, Errors } from './errors.js';

describe('AppError', () => {
  it('creates an error with code, message, and status', () => {
    const err = new AppError('TEST_CODE', 'test message', 400);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err.status).toBe(400);
    expect(err.name).toBe('AppError');
  });

  it('defaults status to 400', () => {
    const err = new AppError('CODE', 'msg');
    expect(err.status).toBe(400);
  });

  it('includes optional details', () => {
    const details = { foo: 'bar' };
    const err = new AppError('CODE', 'msg', 400, details);
    expect(err.details).toEqual(details);
  });
});

describe('Errors factory', () => {
  it('insufficientBalance returns correct error', () => {
    const err = Errors.insufficientBalance('100', '50');
    expect(err.code).toBe('INSUFFICIENT_BALANCE');
    expect(err.status).toBe(400);
    expect(err.message).toContain('100');
    expect(err.message).toContain('50');
    expect(err.details).toEqual({ need: '100', have: '50' });
  });

  it('betNotFound returns 404', () => {
    const err = Errors.betNotFound('42');
    expect(err.code).toBe('BET_NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.message).toContain('42');
  });

  it('invalidState includes action and status', () => {
    const err = Errors.invalidState('cancel', 'accepted');
    expect(err.code).toBe('INVALID_STATE');
    expect(err.message).toContain('cancel');
    expect(err.message).toContain('accepted');
  });

  it('unauthorized returns 401', () => {
    const err = Errors.unauthorized();
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.status).toBe(401);
  });

  it('selfAccept returns correct error', () => {
    const err = Errors.selfAccept();
    expect(err.code).toBe('SELF_ACCEPT');
    expect(err.status).toBe(400);
  });

  it('tooManyOpenBets includes max', () => {
    const err = Errors.tooManyOpenBets(10);
    expect(err.code).toBe('TOO_MANY_OPEN_BETS');
    expect(err.message).toContain('10');
  });

  it('belowMinBet includes min', () => {
    const err = Errors.belowMinBet('50');
    expect(err.code).toBe('BELOW_MIN_BET');
    expect(err.message).toContain('50');
  });

  it('dailyLimitExceeded includes max', () => {
    const err = Errors.dailyLimitExceeded('10000');
    expect(err.code).toBe('DAILY_LIMIT_EXCEEDED');
    expect(err.message).toContain('10000');
  });

  it('userNotFound returns 404', () => {
    const err = Errors.userNotFound();
    expect(err.code).toBe('USER_NOT_FOUND');
    expect(err.status).toBe(404);
  });

  it('validationError returns 422', () => {
    const err = Errors.validationError('bad field');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.status).toBe(422);
    expect(err.message).toContain('bad field');
  });
});
