// ---- Token Decimals ----

/**
 * LAUNCH CW20 token has 6 decimals.
 * 1 LAUNCH (human) = 1,000,000 micro-LAUNCH (on-chain).
 * All contract/API values are in micro-LAUNCH.
 * UI displays in LAUNCH (human-readable).
 */
export const LAUNCH_DECIMALS = 6;
export const LAUNCH_MULTIPLIER = 10 ** LAUNCH_DECIMALS; // 1_000_000

/** Convert human-readable LAUNCH to micro-LAUNCH (on-chain) */
export function toMicroLaunch(human: number | string): string {
  const n = typeof human === 'string' ? parseFloat(human) : human;
  return Math.round(n * LAUNCH_MULTIPLIER).toString();
}

/** Convert micro-LAUNCH (on-chain) to human-readable LAUNCH */
export function fromMicroLaunch(micro: string | number | bigint): number {
  const n = typeof micro === 'bigint' ? Number(micro) : Number(micro);
  return n / LAUNCH_MULTIPLIER;
}

/** Format human-readable LAUNCH for display (e.g. 1,234.56) */
export function formatLaunch(micro: string | number | bigint): string {
  const human = fromMicroLaunch(micro);
  if (human >= 1_000_000) return `${(human / 1_000_000).toFixed(human % 1_000_000 === 0 ? 0 : 2)}M`;
  if (human >= 1_000) {
    // Show up to 2 decimals, strip trailing zeros
    return human.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return human.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

// ---- Game Parameters (must match smart contract defaults) ----

/** Reveal timeout in seconds (5 minutes) — time for maker to reveal after acceptance */
export const REVEAL_TIMEOUT_SECS = 300;

/** Open bet TTL in seconds (3 hours) — open bets auto-cancel after this */
export const OPEN_BET_TTL_SECS = 3 * 60 * 60; // 10800 seconds = 3 hours

/** Maximum open bets per wallet (matches contract config: 255, will be 1000 after migration) */
export const MAX_OPEN_BETS_PER_USER = 255;

/** Maximum bets in a single batch request */
export const MAX_BATCH_SIZE = 20;

/** Minimum bets in a batch request */
export const MIN_BATCH_SIZE = 2;

/** Minimum bet size in micro-LAUNCH (on-chain). 1 LAUNCH = 1,000,000 micro */
export const MIN_BET_AMOUNT = '1000000'; // = 1 LAUNCH

/** Commission in basis points (1000 = 10%) */
export const COMMISSION_BPS = 1000;

/** Authz grant duration in days */
export const AUTHZ_GRANT_DURATION_DAYS = 30;

/** Limit for chain open_bets query (contract pagination) */
export const CHAIN_OPEN_BETS_LIMIT = 200;

/** Daily max amount in play per wallet (micro-LAUNCH) */
export const MAX_DAILY_AMOUNT = '1000000000000'; // = 1,000,000 LAUNCH

// ---- Preset bet amounts ----
// Values are in HUMAN-READABLE LAUNCH. Frontend converts to micro for API.
export const BET_PRESETS = [1, 5, 10, 50, 100, 500] as const;
export const BET_PRESET_LABELS = ['1', '5', '10', '50', '100', '500'] as const;

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
