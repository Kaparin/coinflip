'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslation } from '@/lib/i18n';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    Telegram?: {
      Login: {
        auth: (
          options: { bot_id: string; request_access?: string; lang?: string },
          callback: (user: TelegramUser | false) => void,
        ) => void;
      };
    };
  }
}

let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks: Array<() => void> = [];

function ensureTelegramScript(): Promise<void> {
  if (scriptLoaded && window.Telegram?.Login) return Promise.resolve();

  return new Promise((resolve) => {
    if (scriptLoading) {
      loadCallbacks.push(resolve);
      return;
    }
    scriptLoading = true;
    loadCallbacks.push(resolve);

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      scriptLoading = false;
      for (const cb of loadCallbacks) cb();
      loadCallbacks.length = 0;
    };
    script.onerror = () => {
      scriptLoading = false;
      for (const cb of loadCallbacks) cb();
      loadCallbacks.length = 0;
    };
    document.head.appendChild(script);
  });
}

export function TelegramLoginButton({
  botName,
  onAuth,
  lang = 'en',
}: {
  botName: string;
  onAuth: (user: TelegramUser) => void;
  buttonSize?: 'large' | 'medium' | 'small';
  lang?: string;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  useEffect(() => {
    ensureTelegramScript();
  }, []);

  const handleClick = useCallback(async () => {
    setLoading(true);
    await ensureTelegramScript();

    if (!window.Telegram?.Login) {
      setLoading(false);
      return;
    }

    // Safety timeout: if Telegram popup is blocked or callback never fires, reset loading
    const timeout = setTimeout(() => setLoading(false), 60_000);

    try {
      window.Telegram.Login.auth(
        { bot_id: botName, request_access: 'write', lang },
        (user) => {
          clearTimeout(timeout);
          setLoading(false);
          if (user) onAuthRef.current(user);
        },
      );
    } catch {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [botName, lang]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#2AABEE] px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-[#229ED9] active:scale-[0.98] disabled:opacity-70"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
      {loading ? t('profile.telegramLinking') : t('profile.telegramConnect')}
    </button>
  );
}
