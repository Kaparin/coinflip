'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { WalletProvider, useWalletContext } from '@/contexts/wallet-context';
import { PendingBalanceProvider } from '@/contexts/pending-balance-context';
import { ConnectWalletModal } from '@/components/features/auth/connect-wallet-modal';
import { I18nProvider } from '@/lib/i18n';
import { captureRefCode, registerCapturedRef } from '@/hooks/use-referral';

/** Capture referral code from URL on mount */
function RefCodeCapture() {
  useEffect(() => { captureRefCode(); }, []);
  return null;
}

/** Inner component that can use wallet context */
function WalletModalBridge({ children }: { children: React.ReactNode }) {
  const { isConnectModalOpen, closeConnectModal, isConnected } = useWalletContext();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (isConnected && !registeredRef.current) {
      registeredRef.current = true;
      registerCapturedRef();
    }
  }, [isConnected]);

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
            staleTime: 5_000,
            refetchOnWindowFocus: false,
            retry: 1, // At most 1 retry for queries (custom-fetch already retries GETs)
          },
          mutations: {
            retry: false, // Never auto-retry mutations (chain txs are not idempotent)
          },
        },
      }),
  );

  return (
    <I18nProvider>
      <RefCodeCapture />
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <PendingBalanceProvider>
            <ToastProvider>
              <WalletModalBridge>{children}</WalletModalBridge>
            </ToastProvider>
          </PendingBalanceProvider>
        </WalletProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
