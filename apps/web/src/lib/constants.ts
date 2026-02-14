/**
 * Frontend constants for the CoinFlip dApp.
 * Chain-related config is in @coinflip/shared/chain.
 */

/** API base URL */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** WebSocket URL */
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001/ws';

/** Explorer base URL for transaction links */
export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL ?? 'https://explorer.axiome.pro';

/** Chain ID override */
export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID ?? 'axiome-2';

/** Axiome Connect protocol prefix */
export const AXIOME_CONNECT_PREFIX = 'axiomesign://';

/** Local storage keys */
export const STORAGE_KEYS = {
  CONNECTED_ADDRESS: 'coinflip_connected_address',
  THEME: 'coinflip_theme',
} as const;
