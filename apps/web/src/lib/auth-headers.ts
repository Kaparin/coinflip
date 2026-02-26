/**
 * Get auth headers for API requests.
 *
 * Resolves the auth token from all possible sources:
 * 1. Web wallet auth token (coinflip_auth_token)
 * 2. Telegram Mini App auth token (coinflip_tg_auth_token)
 *
 * In environments where cookies are blocked (iOS Safari ITP, Telegram Mobile WebView),
 * the Bearer token is the only way to authenticate requests.
 */
export function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const token =
    sessionStorage.getItem('coinflip_auth_token') ||
    sessionStorage.getItem('coinflip_tg_auth_token');

  if (token) {
    return { Authorization: `Bearer ${token}` };
  }

  return {};
}

/**
 * Get the connected wallet address from sessionStorage.
 */
export function getStoredAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('coinflip_connected_address');
}
