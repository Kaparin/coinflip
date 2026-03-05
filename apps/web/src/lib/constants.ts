/**
 * Frontend constants for the CoinFlip dApp.
 * Chain-related config is in @coinflip/shared/chain.
 */

/** API base URL */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** WebSocket URL — auto-detect ws:// vs wss:// based on page protocol */
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ??
  (typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? `wss://${window.location.host}/ws`
    : 'ws://localhost:3001/ws');

/** Explorer base URL for transaction links */
export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL ?? 'https://axiomechain.org';

/** Chain ID override */
export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID ?? 'axiome-1';

/** Axiome Connect protocol prefix */
export const AXIOME_CONNECT_PREFIX = 'axiomesign://';

/** Game currency mode: 'coin' = CW20 COIN token, 'axm' = native AXM */
export const GAME_CURRENCY = (process.env.NEXT_PUBLIC_GAME_CURRENCY ?? 'coin') as 'coin' | 'axm';

/** Returns true if game runs on native AXM instead of CW20 COIN */
export function isAxmMode(): boolean {
  return GAME_CURRENCY === 'axm';
}

/** Contract addresses */
export const COINFLIP_CONTRACT = process.env.NEXT_PUBLIC_COINFLIP_CONTRACT ?? '';
export const COINFLIP_NATIVE_CONTRACT = process.env.NEXT_PUBLIC_COINFLIP_NATIVE_CONTRACT ?? '';
export const LAUNCH_CW20_CONTRACT = process.env.NEXT_PUBLIC_LAUNCH_CW20 ?? '';
export const PRESALE_CONTRACT = process.env.NEXT_PUBLIC_PRESALE_CONTRACT ?? '';

/** Active CoinFlip contract address based on GAME_CURRENCY */
export const ACTIVE_CONTRACT = isAxmMode() ? COINFLIP_NATIVE_CONTRACT : COINFLIP_CONTRACT;

/** Native denom for AXM mode */
export const AXM_DENOM = process.env.NEXT_PUBLIC_AXM_DENOM ?? 'uaxm';

/** Treasury wallet address (receives AXM for shop purchases) */
export const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? '';

/** Admin wallet address (for showing admin link in UI) */
export const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? '';

/** Telegram bot name for display */
export const TELEGRAM_BOT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME ?? '';
/** Telegram bot numeric ID for OAuth (first part of bot token) */
export const TELEGRAM_BOT_ID = process.env.NEXT_PUBLIC_TELEGRAM_BOT_ID ?? '';

/** Local storage keys */
export const STORAGE_KEYS = {
  CONNECTED_ADDRESS: 'coinflip_connected_address',
  THEME: 'coinflip_theme',
} as const;
