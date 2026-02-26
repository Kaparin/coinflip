'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { API_URL } from '@/lib/constants';

// ─── Types ────────────────────────────────────────────────

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  is_premium?: boolean;
  language_code?: string;
}

interface TelegramContextValue {
  /** Whether we're running inside a Telegram Mini App */
  isTelegramApp: boolean;
  /** Telegram user data (null if not in TG or not yet loaded) */
  telegramUser: TelegramUser | null;
  /** Whether TG auth is in progress */
  isAuthenticating: boolean;
  /** Whether TG user has a linked wallet */
  hasWallet: boolean;
  /** Auth token from TG auth (for API calls) */
  token: string | null;
  /** User ID from TG auth */
  userId: string | null;
  /** Linked wallet address */
  walletAddress: string | null;
  /** Link a wallet to the Telegram-authenticated user */
  linkWallet: (address: string) => Promise<void>;
}

const TelegramContext = createContext<TelegramContextValue>({
  isTelegramApp: false,
  telegramUser: null,
  isAuthenticating: false,
  hasWallet: false,
  token: null,
  userId: null,
  walletAddress: null,
  linkWallet: async () => {},
});

// ─── Session Storage Keys ─────────────────────────────────

const TG_AUTH_TOKEN_KEY = 'coinflip_tg_auth_token';
const TG_USER_KEY = 'coinflip_tg_user';
const TG_USER_ID_KEY = 'coinflip_tg_user_id';
const TG_WALLET_KEY = 'coinflip_tg_wallet';

// ─── Telegram Mini App Detection ──────────────────────────

/**
 * Check if running inside a Telegram Mini App.
 * The Telegram WebView injects tgWebAppData into the URL hash
 * or window.Telegram.WebApp is available.
 */
function detectTelegramMiniApp(): boolean {
  if (typeof window === 'undefined') return false;

  // Check for Telegram WebApp object
  if ((window as unknown as Record<string, unknown>).Telegram) {
    const tg = (window as unknown as Record<string, { WebApp?: { initData?: string } }>).Telegram;
    if (tg?.WebApp?.initData) return true;
  }

  // Check URL hash for tgWebAppData
  if (window.location.hash.includes('tgWebAppData')) return true;

  // Check URL search params
  const params = new URLSearchParams(window.location.search);
  if (params.has('tgWebAppData')) return true;

  return false;
}

/**
 * Extract initData raw string from Telegram WebApp.
 */
function getInitDataRaw(): string | null {
  if (typeof window === 'undefined') return null;

  const tg = (window as unknown as Record<string, { WebApp?: { initData?: string } }>).Telegram;
  if (tg?.WebApp?.initData) return tg.WebApp.initData;

  // Fallback: parse from URL hash
  const hash = window.location.hash.slice(1);
  if (hash.includes('tgWebAppData=')) {
    const params = new URLSearchParams(hash);
    return params.get('tgWebAppData');
  }

  return null;
}

// ─── Provider ─────────────────────────────────────────────

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [isTelegramApp, setIsTelegramApp] = useState(false);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // Detect Telegram and auto-authenticate
  useEffect(() => {
    const isTg = detectTelegramMiniApp();
    setIsTelegramApp(isTg);

    if (!isTg) {
      // Restore TG session from storage (for page refreshes in TG)
      try {
        const storedUser = sessionStorage.getItem(TG_USER_KEY);
        const storedToken = sessionStorage.getItem(TG_AUTH_TOKEN_KEY);
        const storedUserId = sessionStorage.getItem(TG_USER_ID_KEY);
        const storedWallet = sessionStorage.getItem(TG_WALLET_KEY);
        if (storedUser && storedToken) {
          setTelegramUser(JSON.parse(storedUser));
          setToken(storedToken);
          setUserId(storedUserId);
          setWalletAddress(storedWallet);
          setHasWallet(!!storedWallet);
          setIsTelegramApp(true);
        }
      } catch {
        // ignore
      }
      return;
    }

    // Auto-authenticate with backend
    const initDataRaw = getInitDataRaw();
    if (!initDataRaw) return;

    setIsAuthenticating(true);
    fetch(`${API_URL}/api/v1/auth/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ initData: initDataRaw }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('TG auth failed');
        const json = await res.json();
        const data = json.data;

        const tgUser: TelegramUser = data.telegram;
        setTelegramUser(tgUser);
        setUserId(data.user_id);
        setHasWallet(data.has_wallet);
        setWalletAddress(data.address);
        setToken(data.token);

        // Persist to sessionStorage for page refreshes
        sessionStorage.setItem(TG_USER_KEY, JSON.stringify(tgUser));
        if (data.token) sessionStorage.setItem(TG_AUTH_TOKEN_KEY, data.token);
        if (data.user_id) sessionStorage.setItem(TG_USER_ID_KEY, data.user_id);
        if (data.address) sessionStorage.setItem(TG_WALLET_KEY, data.address);

        // Expand viewport if Telegram WebApp is available
        try {
          const tg = (window as unknown as Record<string, { WebApp?: { expand?: () => void; ready?: () => void } }>).Telegram;
          tg?.WebApp?.expand?.();
          tg?.WebApp?.ready?.();
        } catch {
          // ignore
        }
      })
      .catch((err) => {
        console.error('[TelegramProvider] Auth failed:', err);
      })
      .finally(() => {
        setIsAuthenticating(false);
      });
  }, []);

  const linkWallet = useCallback(async (address: string) => {
    if (!token || !userId) return;

    const res = await fetch(`${API_URL}/api/v1/auth/telegram/link-wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
      body: JSON.stringify({
        telegram_user_id: String(telegramUser?.id),
        address,
      }),
    });

    if (res.ok) {
      setHasWallet(true);
      setWalletAddress(address);
      sessionStorage.setItem(TG_WALLET_KEY, address);
    }
  }, [token, userId, telegramUser]);

  return (
    <TelegramContext.Provider
      value={{
        isTelegramApp,
        telegramUser,
        isAuthenticating,
        hasWallet,
        token,
        userId,
        walletAddress,
        linkWallet,
      }}
    >
      {children}
    </TelegramContext.Provider>
  );
}

export function useTelegramContext(): TelegramContextValue {
  return useContext(TelegramContext);
}
