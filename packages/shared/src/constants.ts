// ---- Token Decimals ----

/**
 * COIN CW20 token has 6 decimals.
 * 1 COIN (human) = 1,000,000 micro-COIN (on-chain).
 * All contract/API values are in micro-COIN.
 * UI displays in COIN (human-readable).
 */
export const LAUNCH_DECIMALS = 6;
export const LAUNCH_MULTIPLIER = 10 ** LAUNCH_DECIMALS; // 1_000_000

/** Convert human-readable COIN to micro-COIN (on-chain) */
export function toMicroLaunch(human: number | string): string {
  const n = typeof human === 'string' ? parseFloat(human) : human;
  return Math.round(n * LAUNCH_MULTIPLIER).toString();
}

/** Convert micro-COIN (on-chain) to human-readable COIN */
export function fromMicroLaunch(micro: string | number | bigint): number {
  const n = typeof micro === 'bigint' ? Number(micro) : Number(micro);
  return n / LAUNCH_MULTIPLIER;
}

/** Format human-readable COIN for display (e.g. 1,234.56) */
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

/** Minimum bet size in micro-COIN (on-chain). 1 COIN = 1,000,000 micro */
export const MIN_BET_AMOUNT = '1000000'; // = 1 COIN

/** Commission in basis points (1000 = 10%) */
export const COMMISSION_BPS = 1000;

/** Authz grant duration in days */
export const AUTHZ_GRANT_DURATION_DAYS = 30;

/** Limit for chain open_bets query (contract pagination) */
export const CHAIN_OPEN_BETS_LIMIT = 200;

/** Daily max amount in play per wallet (micro-COIN) */
export const MAX_DAILY_AMOUNT = '1000000000000'; // = 1,000,000 COIN

// ---- Preset bet amounts ----
// Values are in HUMAN-READABLE COIN. Frontend converts to micro for API.
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

// ---- Events ----
export const EVENT_TYPE = {
  CONTEST: 'contest',
  RAFFLE: 'raffle',
} as const;

export const EVENT_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  CALCULATING: 'calculating',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;

export const CONTEST_METRIC = {
  TURNOVER: 'turnover',
  WINS: 'wins',
  PROFIT: 'profit',
} as const;

/** Leaderboard cache TTL (30 seconds) */
export const LEADERBOARD_CACHE_TTL_MS = 30_000;

/** Grace period before auto-archiving empty calculating events (5 minutes) */
export const EMPTY_EVENT_ARCHIVE_GRACE_MS = 5 * 60 * 1000;

/** Grace period before auto-approving calculating events with results (10 minutes) */
export const EVENT_AUTO_APPROVE_GRACE_MS = 10 * 60 * 1000;

// ---- Jackpot ----
/** Total jackpot contribution from each pot in basis points (100 = 1%) */
export const JACKPOT_TOTAL_BPS = 100;

/** Number of jackpot tiers (contribution split evenly) */
export const JACKPOT_TIER_COUNT = 5;

/** Per-tier contribution in basis points = JACKPOT_TOTAL_BPS / JACKPOT_TIER_COUNT */
export const JACKPOT_PER_TIER_BPS = JACKPOT_TOTAL_BPS / JACKPOT_TIER_COUNT; // 20

export const JACKPOT_TIER_NAME = {
  MINI: 'mini',
  MEDIUM: 'medium',
  LARGE: 'large',
  MEGA: 'mega',
  SUPER_MEGA: 'super_mega',
} as const;

export const JACKPOT_POOL_STATUS = {
  FILLING: 'filling',
  DRAWING: 'drawing',
  COMPLETED: 'completed',
} as const;

// ---- VIP Subscriptions ----

export const VIP_TIER = {
  SILVER: 'silver',
  GOLD: 'gold',
  DIAMOND: 'diamond',
} as const;

export type VipTier = (typeof VIP_TIER)[keyof typeof VIP_TIER];

/** VIP subscription duration in days */
export const VIP_DURATION_DAYS = 30;

/** Default prices in micro-COIN (admin-editable via vip_config table) */
export const VIP_DEFAULT_PRICES: Record<VipTier, string> = {
  silver: '50000000',   // 50 COIN
  gold: '100000000',    // 100 COIN
  diamond: '200000000', // 200 COIN
};

/** Daily boost limits by tier (null = unlimited) */
export const BOOST_LIMITS: Record<VipTier | 'free', number | null> = {
  free: 3,
  silver: 10,
  gold: null,
  diamond: null,
};

// ---- Bet Pins (auction system) ----

/** Number of pin slots at the top of the bet list */
export const PIN_SLOTS = 3;

/** Minimum pin price in micro-COIN (3 COIN) */
export const PIN_MIN_PRICE = '3000000';

/** Multiplier to outbid current pin holder */
export const PIN_OUTBID_MULTIPLIER = 2;

/** Refund percentage (BPS) when pinned bet expires naturally (50%) */
export const PIN_EXPIRE_REFUND_BPS = 5000;

// ---- VIP Jackpot Tiers ----
/** Minimum VIP tier required to be eligible for VIP-exclusive jackpot tiers.
 *  mini & medium: open to all (no entry).
 *  large: Silver VIP, mega: Gold VIP, super_mega: Diamond VIP. */
export const VIP_JACKPOT_TIERS: Partial<Record<string, VipTier>> = {
  large: 'silver',
  mega: 'gold',
  super_mega: 'diamond',
};

// ---- API versions ----
export const API_V1_PREFIX = '/api/v1';
