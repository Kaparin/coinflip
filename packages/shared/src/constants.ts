// ---- Game Parameters (must match smart contract defaults) ----

/** Reveal timeout in seconds (5 minutes) */
export const REVEAL_TIMEOUT_SECS = 300;

/** Maximum open bets per wallet */
export const MAX_OPEN_BETS_PER_USER = 10;

/** Minimum bet size in LAUNCH (smallest unit) */
export const MIN_BET_AMOUNT = '10';

/** Commission in basis points (1000 = 10%) */
export const COMMISSION_BPS = 1000;

/** Authz grant duration in days */
export const AUTHZ_GRANT_DURATION_DAYS = 30;

/** Daily max amount in play per wallet */
export const MAX_DAILY_AMOUNT = '10000';

// ---- Preset bet amounts ----
export const BET_PRESETS = ['10', '25', '50', '100', '250', '500', '1000'] as const;

// ---- Commitment prefix ----
export const COMMITMENT_PREFIX = 'coinflip_v1';

// ---- Bet statuses ----
export const BET_STATUS = {
  OPEN: 'open',
  ACCEPTED: 'accepted',
  REVEALED: 'revealed',
  CANCELED: 'canceled',
  TIMEOUT_CLAIMED: 'timeout_claimed',
} as const;

// ---- Sides ----
export const SIDE = {
  HEADS: 'heads',
  TAILS: 'tails',
} as const;

// ---- API versions ----
export const API_V1_PREFIX = '/api/v1';
