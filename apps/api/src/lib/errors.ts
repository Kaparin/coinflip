export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Pre-defined errors
export const Errors = {
  insufficientBalance: (need: string, have: string) =>
    new AppError('INSUFFICIENT_BALANCE', `Insufficient balance: need ${need}, have ${have}`, 400, { need, have }),
  betNotFound: (betId: string) =>
    new AppError('BET_NOT_FOUND', `Bet ${betId} not found`, 404),
  invalidState: (action: string, status: string) =>
    new AppError('INVALID_STATE', `Cannot ${action} bet in ${status} state`, 400),
  unauthorized: () =>
    new AppError('UNAUTHORIZED', 'Authentication required', 401),
  selfAccept: () =>
    new AppError('SELF_ACCEPT', 'Cannot accept your own bet', 400),
  tooManyOpenBets: (max: number) =>
    new AppError('TOO_MANY_OPEN_BETS', `Maximum ${max} open bets allowed`, 400),
  belowMinBet: (min: string) =>
    new AppError('BELOW_MIN_BET', `Minimum bet amount is ${min}`, 400),
  dailyLimitExceeded: (max: string) =>
    new AppError('DAILY_LIMIT_EXCEEDED', `Daily limit of ${max} exceeded`, 400),
  userNotFound: () =>
    new AppError('USER_NOT_FOUND', 'User not found', 404),
  validationError: (message: string) =>
    new AppError('VALIDATION_ERROR', message, 422),
} as const;
