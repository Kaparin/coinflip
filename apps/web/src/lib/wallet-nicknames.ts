/**
 * Simple localStorage cache for wallet nicknames.
 *
 * When a user connects and has a nickname, we persist it locally.
 * This lets us show nicknames in the wallet list even for disconnected wallets.
 */

const STORAGE_KEY = 'coinflip_wallet_nicknames';

function loadMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMap(map: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore quota errors */ }
}

/** Get cached nickname for an address (or null). */
export function getCachedNickname(address: string): string | null {
  const map = loadMap();
  return map[address.toLowerCase()] ?? null;
}

/** Save nickname for an address to local cache. */
export function setCachedNickname(address: string, nickname: string | null): void {
  const map = loadMap();
  const key = address.toLowerCase();
  if (nickname) {
    map[key] = nickname;
  } else {
    delete map[key];
  }
  saveMap(map);
}
