'use client';

import { useState, useCallback, useEffect } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';

/**
 * Wallet connection state for Axiome Chain.
 *
 * For now, uses a simplified "address-based" connection model:
 * - User provides their axiome1... address
 * - Backend creates a session
 *
 * Future: integrate with Axiome Connect (axiomesign:// deeplinks)
 * or Keplr wallet for full signing capabilities.
 */

export interface WalletState {
  /** Connected Axiome address (axiome1...) */
  address: string | null;
  /** Whether the wallet is connected */
  isConnected: boolean;
  /** Whether connection is in progress */
  isConnecting: boolean;
  /** Connect with an address */
  connect: (address: string) => void;
  /** Disconnect wallet */
  disconnect: () => void;
  /** Short display address (axiome1abc...xyz) */
  shortAddress: string | null;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Restore from session storage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem(STORAGE_KEYS.CONNECTED_ADDRESS);
    if (stored && stored.startsWith('axiome1')) {
      setAddress(stored);
    }
  }, []);

  const connect = useCallback((addr: string) => {
    if (!addr.startsWith('axiome1')) {
      throw new Error('Invalid Axiome address: must start with axiome1');
    }

    setIsConnecting(true);
    try {
      setAddress(addr);
      sessionStorage.setItem(STORAGE_KEYS.CONNECTED_ADDRESS, addr);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    sessionStorage.removeItem(STORAGE_KEYS.CONNECTED_ADDRESS);
  }, []);

  const shortAddress = address
    ? `${address.slice(0, 10)}...${address.slice(-4)}`
    : null;

  return {
    address,
    isConnected: address !== null,
    isConnecting,
    connect,
    disconnect,
    shortAddress,
  };
}
