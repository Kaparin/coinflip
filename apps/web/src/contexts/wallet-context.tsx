'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useWebWallet, type WebWalletState } from '@/hooks/use-web-wallet';

/** Extended wallet context — includes modal control */
interface WalletContextValue extends WebWalletState {
  /** Open the connect wallet modal */
  openConnectModal: () => void;
  /** Whether the connect modal is open */
  isConnectModalOpen: boolean;
  /** Close the connect modal */
  closeConnectModal: () => void;
  /** Shorthand for `connect` — opens modal */
  connect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWebWallet();
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  const openConnectModal = useCallback(() => setIsConnectModalOpen(true), []);
  const closeConnectModal = useCallback(() => setIsConnectModalOpen(false), []);

  // connect is an alias for openConnectModal (for backward compat with existing UI)
  const connect = openConnectModal;

  return (
    <WalletContext.Provider value={{
      ...wallet,
      openConnectModal,
      isConnectModalOpen,
      closeConnectModal,
      connect,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWalletContext must be used within WalletProvider');
  }
  return ctx;
}
