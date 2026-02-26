'use client';

import { useTelegramContext } from '@/contexts/telegram-context';
import { useWalletContext } from '@/contexts/wallet-context';
import { useTranslation } from '@/lib/i18n';
import { Wallet } from 'lucide-react';

/**
 * Welcome banner for Telegram Mini App users who haven't connected a wallet yet.
 * Shows their TG identity and prompts them to connect a wallet.
 */
export function TgWelcomeBanner() {
  const { isTelegramApp, telegramUser, isAuthenticating } = useTelegramContext();
  const { isConnected, connect } = useWalletContext();
  const { t } = useTranslation();

  // Only show in Telegram Mini App when user has TG auth but no wallet
  if (!isTelegramApp || !telegramUser || isConnected || isAuthenticating) return null;

  return (
    <div className="rounded-2xl border border-[#2AABEE]/30 bg-gradient-to-br from-[#2AABEE]/10 via-transparent to-[#2AABEE]/5 p-4">
      <div className="flex items-center gap-3">
        {/* TG avatar or fallback */}
        {telegramUser.photo_url ? (
          <img
            src={telegramUser.photo_url}
            alt=""
            className="h-11 w-11 rounded-full border-2 border-[#2AABEE]/30 object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2AABEE]/20 border-2 border-[#2AABEE]/30">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-[#2AABEE]">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">
            {t('telegram.welcome', { name: telegramUser.first_name })}
            {telegramUser.is_premium && (
              <span className="ml-1 text-[10px] text-[#2AABEE]">Premium</span>
            )}
          </p>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
            {t('telegram.connectWalletHint')}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => connect()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
      >
        <Wallet size={16} />
        {t('telegram.connectWallet')}
      </button>
    </div>
  );
}
