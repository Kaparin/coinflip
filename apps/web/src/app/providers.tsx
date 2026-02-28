'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { WalletProvider, useWalletContext } from '@/contexts/wallet-context';
import { PendingBalanceProvider } from '@/contexts/pending-balance-context';
import { TelegramProvider, useTelegramContext } from '@/contexts/telegram-context';
import { ConnectWalletModal } from '@/components/features/auth/connect-wallet-modal';
import { I18nProvider } from '@/lib/i18n';
import { NotificationProvider } from '@/components/features/notifications/notification-provider';
import { captureRefCode, registerCapturedRef } from '@/hooks/use-referral';
import { parseTelegramHashResult, consumeTelegramAuthPending } from '@/components/features/profile/telegram-login-button';
import { customFetch } from '@coinflip/api-client/custom-fetch';
import { useToast } from '@/components/ui/toast';
import { useTranslation } from '@/lib/i18n';
import { useRouter } from 'next/navigation';

/** Capture referral code from URL on mount */
function RefCodeCapture() {
  useEffect(() => { captureRefCode(); }, []);
  return null;
}

/** Global handler for Telegram OAuth redirect callback.
 *  Telegram redirects to origin/#tgAuthResult=base64 (always root).
 *  This component detects the hash, sends auth data to API, and redirects to profile. */
function TelegramAuthCallback() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { address } = useWalletContext();
  const { addToast } = useToast();
  const { t } = useTranslation();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    const user = parseTelegramHashResult();
    if (!user) return;
    handledRef.current = true;

    // Clean up hash from URL immediately
    window.history.replaceState(null, '', window.location.pathname);

    if (!address) {
      addToast('error', t('profile.telegramLinkError'));
      return;
    }

    (async () => {
      try {
        await customFetch({
          url: '/api/v1/users/me/telegram',
          method: 'POST',
          data: user,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/v1/users/me'] });
        addToast('success', t('profile.telegramLinked'));
      } catch {
        addToast('error', t('profile.telegramLinkError'));
      }
      router.push('/game/profile');
    })();
  }, [address, router, queryClient, addToast, t]);

  return null;
}

/** Inner component that can use wallet context */
function WalletModalBridge({ children }: { children: React.ReactNode }) {
  const { isConnectModalOpen, closeConnectModal, isConnected, address } = useWalletContext();
  const { isTelegramApp, telegramUser, linkWallet } = useTelegramContext();
  const registeredRef = useRef(false);
  const tgLinkedRef = useRef(false);

  useEffect(() => {
    if (isConnected && !registeredRef.current) {
      registeredRef.current = true;
      registerCapturedRef();
    }
  }, [isConnected]);

  // Auto-link wallet to Telegram user when wallet connects inside TG Mini App
  useEffect(() => {
    if (isTelegramApp && telegramUser && isConnected && address && !tgLinkedRef.current) {
      tgLinkedRef.current = true;
      linkWallet(address).catch(() => {});
    }
  }, [isTelegramApp, telegramUser, isConnected, address, linkWallet]);

  return (
    <>
      <TelegramAuthCallback />
      {children}
      <ConnectWalletModal open={isConnectModalOpen} onClose={closeConnectModal} />
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 3_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <I18nProvider>
      <RefCodeCapture />
      <QueryClientProvider client={queryClient}>
        <TelegramProvider>
          <WalletProvider>
            <PendingBalanceProvider>
              <ToastProvider>
                <NotificationProvider>
                  <WalletModalBridge>{children}</WalletModalBridge>
                </NotificationProvider>
              </ToastProvider>
            </PendingBalanceProvider>
          </WalletProvider>
        </TelegramProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
