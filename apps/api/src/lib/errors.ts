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

/**
 * Sanitize raw chain error logs before returning to clients.
 * Removes contract addresses, internal stack traces, and implementation details
 * that could help attackers probe the system.
 */
function sanitizeChainError(rawLog?: string): string {
  if (!rawLog) return 'Transaction failed';

  // Known user-facing error patterns → return clean message
  const userMessages: Array<[RegExp, string]> = [
    [/insufficient.*balance/i, 'Insufficient balance'],
    [/insufficient.*fee|fee payer.*insufficient|insufficient fees|insufficient funds.*fee/i, 'Insufficient AXM for gas fees. Top up your wallet with AXM to continue.'],
    [/bet.*not.*found/i, 'Bet not found'],
    [/bet.*expired/i, 'Bet has expired'],
    [/self.*accept.*not.*allowed/i, 'Cannot accept your own bet'],
    [/unauthorized/i, 'Authorization required for this action'],
    [/commitment.*mismatch/i, 'Commitment verification failed'],
    [/invalid.*state.*transition/i, 'This action is not available for the current bet state'],
    [/reveal.*timeout.*expired/i, 'Reveal timeout has expired'],
    [/account sequence mismatch/i, 'Transaction ordering issue — please retry'],
    [/too many open bets|max.*open.*bets|open bets.*max/i, 'Maximum open bets reached'],
  ];

  for (const [pattern, message] of userMessages) {
    if (pattern.test(rawLog)) return message;
  }

  // Fallback: generic message (never expose raw contract logs)
  return 'Transaction failed. Please try again.';
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
  relayerNotReady: () =>
    new AppError('RELAYER_NOT_READY', 'Chain relay service is not available. Try again later.', 503),
  forbidden: () =>
    new AppError('FORBIDDEN', 'Admin access required', 403),
  chainTxFailed: (txHash: string, rawLog?: string) =>
    new AppError('CHAIN_TX_FAILED', sanitizeChainError(rawLog), 422, { txHash }),
  chainTimeout: (txHash?: string) =>
    new AppError('CHAIN_TX_TIMEOUT', 'Transaction was submitted but not yet confirmed. Please wait and check your balance.', 504, { txHash }),
  actionInProgress: (estimatedWaitSec = 10) =>
    new AppError(
      'ACTION_IN_PROGRESS',
      'Your previous action is still processing. Please wait a few seconds and try again.',
      429,
      { retry_after_seconds: estimatedWaitSec },
    ),
} as const;

export { sanitizeChainError };
