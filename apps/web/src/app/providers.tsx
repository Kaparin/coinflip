'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { WalletProvider, useWalletContext } from '@/contexts/wallet-context';
import { PendingBalanceProvider } from '@/contexts/pending-balance-context';
import { TelegramProvider, useTelegramContext } from '@/contexts/telegram-context';
import { ConnectWalletModal } from '@/components/features/auth/connect-wallet-modal';
import { I18nProvider } from '@/lib/i18n';
import { NotificationProvider } from '@/components/features/notifications/notification-provider';
import { captureRefCode, registerCapturedRef } from '@/hooks/use-referral';

/** Capture referral code from URL on mount */
function RefCodeCapture() {
  useEffect(() => { captureRefCode(); }, []);
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
