'use client';

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

const TG_CALLBACK_KEY = 'tg_auth_pending';

/** Mark that we're about to redirect to Telegram OAuth. */
export function markTelegramAuthPending() {
  try { sessionStorage.setItem(TG_CALLBACK_KEY, '1'); } catch { /* noop */ }
}

/** Check + consume the pending flag (called on page load). */
export function consumeTelegramAuthPending(): boolean {
  try {
    const v = sessionStorage.getItem(TG_CALLBACK_KEY);
    if (v) { sessionStorage.removeItem(TG_CALLBACK_KEY); return true; }
  } catch { /* noop */ }
  return false;
}

/** Parse `#tgAuthResult=<base64json>` from the URL hash. */
export function parseTelegramHashResult(): TelegramUser | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#tgAuthResult=')) return null;

  try {
    const encoded = hash.slice('#tgAuthResult='.length);
    const json = atob(decodeURIComponent(encoded));
    const data = JSON.parse(json) as TelegramUser;
    if (data && typeof data.id === 'number' && typeof data.hash === 'string') {
      return data;
    }
  } catch { /* invalid payload */ }
  return null;
}

export function TelegramLoginButton({
  botId,
  lang = 'en',
}: {
  botId: string;
  lang?: string;
}) {
  const { t } = useTranslation();

  const handleClick = () => {
    markTelegramAuthPending();
    const origin = window.location.origin;
    const returnTo = '/game/profile';
    window.location.href =
      `https://oauth.telegram.org/auth?bot_id=${encodeURIComponent(botId)}` +
      `&origin=${encodeURIComponent(origin)}` +
      `&embed=1&request_access=write&lang=${lang}` +
      `&return_to=${encodeURIComponent(returnTo)}`;
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#2AABEE] px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-[#229ED9] active:scale-[0.98]"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
      {t('profile.telegramConnect')}
    </button>
  );
}
