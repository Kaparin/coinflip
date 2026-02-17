'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebWallet, type WebWalletState } from '@/hooks/use-web-wallet';

/** Extended wallet context — includes modal control */
interface WalletContextValue extends WebWalletState {
  /** Open the connect wallet modal (optionally to switch to a specific wallet) */
  openConnectModal: (switchToAddress?: string) => void;
  /** Whether the connect modal is open */
  isConnectModalOpen: boolean;
  /** Close the connect modal */
  closeConnectModal: () => void;
  /** Shorthand for `connect` — opens modal */
  connect: () => void;
  /** When set, modal opens directly to unlock this wallet */
  connectModalSwitchTo: string | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWebWallet();
  const queryClient = useQueryClient();
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [connectModalSwitchTo, setConnectModalSwitchTo] = useState<string | null>(null);

  // Invalidate all cached queries when the connected wallet address changes.
  // Many query keys (vault balance, bets, grants) don't include the address,
  // so stale data from the previous wallet would persist without this.
  const prevAddressRef = useRef<string | null>(wallet.address);
  useEffect(() => {
    const prev = prevAddressRef.current;
    prevAddressRef.current = wallet.address;
    if (prev !== wallet.address && prev !== null && wallet.address !== null) {
      queryClient.invalidateQueries();
    }
  }, [wallet.address, queryClient]);

  const openConnectModal = useCallback((switchToAddress?: string) => {
    setConnectModalSwitchTo(switchToAddress ?? null);
    setIsConnectModalOpen(true);
  }, []);
  const closeConnectModal = useCallback(() => {
    setIsConnectModalOpen(false);
    setConnectModalSwitchTo(null);
  }, []);

  // connect is an alias for openConnectModal (for backward compat with existing UI)
  const connect = openConnectModal;

  return (
    <WalletContext.Provider value={{
      ...wallet,
      openConnectModal,
      isConnectModalOpen,
      closeConnectModal,
      connect,
      connectModalSwitchTo,
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
