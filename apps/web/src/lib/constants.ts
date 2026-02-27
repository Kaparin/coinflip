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

/** Contract addresses */
export const COINFLIP_CONTRACT = process.env.NEXT_PUBLIC_COINFLIP_CONTRACT ?? '';
export const LAUNCH_CW20_CONTRACT = process.env.NEXT_PUBLIC_LAUNCH_CW20 ?? '';
export const PRESALE_CONTRACT = process.env.NEXT_PUBLIC_PRESALE_CONTRACT ?? '';

/** Admin wallet address (for showing admin link in UI) */
export const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? '';

/** Telegram bot name for login widget */
export const TELEGRAM_BOT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME ?? '';

/** Local storage keys */
export const STORAGE_KEYS = {
  CONNECTED_ADDRESS: 'coinflip_connected_address',
  THEME: 'coinflip_theme',
} as const;
