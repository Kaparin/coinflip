/**
 * Maps technical API errors to user-friendly messages.
 * Use with t() from useTranslation to get localized strings.
 */

export type TFunction = (key: string, params?: Record<string, string | number>) => string;

/** Extract error code and raw message from API error or thrown value */
export function extractErrorPayload(err: unknown): { code?: string; message: string } {
  if (err instanceof Error) {
    return { message: err.message };
  }
  if (typeof err === 'object' && err && 'error' in err) {
    const apiErr = (err as { error?: { code?: string; message?: string } }).error;
    return {
      code: apiErr?.code,
      message: apiErr?.message ?? '',
    };
  }
  if (typeof err === 'object' && err && 'message' in err) {
    return { message: String((err as { message: string }).message) };
  }
  return { message: String(err ?? '') };
}

/** Check if error indicates "action in progress" (429 / rate limit) */
export function isActionInProgress(msg: string): boolean {
  return (
    msg.includes('still processing') ||
    msg.includes('ACTION_IN_PROGRESS') ||
    msg.includes('Please wait')
  );
}

/** Check if error indicates bet was canceled */
export function isBetCanceled(msg: string): boolean {
  return msg.includes('BET_CANCELED') || msg.includes('bet canceled') || msg.includes('bet has been canceled');
}

/** Check if error indicates bet was already claimed by someone else */
export function isBetClaimed(msg: string): boolean {
  return msg.includes('BET_ALREADY_CLAIMED') || msg.includes('already being accepted');
}

/** Check if error indicates bet is gone (410) */
export function isBetGone(msg: string): boolean {
  return msg.includes('410') || msg.includes('Gone') || msg.includes('no longer available');
}

/**
 * Get a user-friendly error message for toasts.
 * Maps known error codes and message patterns to localized strings.
 */
export function getUserFriendlyError(
  err: unknown,
  t: TFunction,
  context: 'create' | 'accept' | 'cancel' | 'withdraw' | 'deposit' | 'generic' = 'generic',
): string {
  const { code, message } = extractErrorPayload(err);
  const msg = message.toLowerCase();

  // Action in progress — handled separately as warning in components
  if (isActionInProgress(message)) {
    return t('errors.actionInProgress');
  }

  // Map by error code first
  const codeMap: Record<string, string> = {
    INSUFFICIENT_BALANCE: t('errors.insufficientBalance'),
    BELOW_MIN_BET: t('errors.belowMinBet'),
    TOO_MANY_OPEN_BETS: t('errors.tooManyOpenBets'),
    DAILY_LIMIT_EXCEEDED: t('errors.dailyLimitExceeded'),
    BET_NOT_FOUND: t('errors.betNotFound'),
    BET_CANCELED: t('errors.betCanceled'),
    BET_ALREADY_CLAIMED: t('errors.betTakenByOther'),
    SELF_ACCEPT: t('errors.selfAccept'),
    UNAUTHORIZED: t('errors.unauthorized'),
    RELAYER_NOT_READY: t('errors.relayerNotReady'),
    CHAIN_TX_FAILED: t('errors.chainTxFailed'),
    CHAIN_TX_TIMEOUT: t('errors.chainTxTimeout'),
    VALIDATION_ERROR: t('errors.validationError'),
    INTERNAL_ERROR: t('errors.serverError'),
  };

  if (code && codeMap[code]) {
    return codeMap[code] as string;
  }

  // Map by message content (for errors that don't have code in response)
  if (isBetCanceled(message)) return t('errors.betCanceled');
  if (isBetClaimed(message)) return t('errors.betTakenByOther');
  if (isBetGone(message)) return t('errors.betUnavailable');
  if (msg.includes('insufficient balance') || msg.includes('insufficient funds') || msg.includes('not enough')) return t('errors.insufficientBalance');
  if (msg.includes('minimum bet') || msg.includes('below min')) return t('errors.belowMinBet');
  if (msg.includes('too many open') || msg.includes('max open bets')) return t('errors.tooManyOpenBets');
  if (msg.includes('timeout') || msg.includes('not yet confirmed')) return t('errors.chainTxTimeout');
  if (msg.includes('relayer') || msg.includes('relayer not available')) return t('errors.relayerNotReady');

  // Context-specific fallbacks
  const fallbacks: Record<'create' | 'accept' | 'cancel' | 'withdraw' | 'deposit' | 'generic', string> = {
    create: t('errors.createFailed'),
    accept: t('errors.acceptFailed'),
    cancel: t('errors.cancelFailed'),
    withdraw: t('errors.withdrawFailed'),
    deposit: t('errors.depositFailed'),
    generic: t('errors.somethingWentWrong'),
  };
  return fallbacks[context];
}
