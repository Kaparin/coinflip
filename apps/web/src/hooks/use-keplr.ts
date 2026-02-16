'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { getAxiomeChainConfig, AXIOME_COIN_TYPE, DEFAULT_CHAIN_ID } from '@coinflip/shared/chain';
import { CHAIN_ID, STORAGE_KEYS } from '@/lib/constants';
import { API_URL } from '@/lib/constants';

/* ------------------------------------------------------------------ */
/*  Keplr types (minimal subset, no extra dependency)                  */
/* ------------------------------------------------------------------ */

interface KeplrChainInfo {
  chainId: string;
  chainName: string;
  rpc: string;
  rest: string;
  bip44: { coinType: number };
  bech32Config: {
    bech32PrefixAccAddr: string;
    bech32PrefixAccPub: string;
    bech32PrefixValAddr: string;
    bech32PrefixValPub: string;
    bech32PrefixConsAddr: string;
    bech32PrefixConsPub: string;
  };
  currencies: Array<{
    coinDenom: string;
    coinMinimalDenom: string;
    coinDecimals: number;
    coinType?: number;
  }>;
  feeCurrencies: Array<{
    coinDenom: string;
    coinMinimalDenom: string;
    coinDecimals: number;
    gasPriceStep?: { low: number; average: number; high: number };
  }>;
  stakeCurrency: {
    coinDenom: string;
    coinMinimalDenom: string;
    coinDecimals: number;
  };
}

interface KeplrWindow {
  keplr?: {
    experimentalSuggestChain(chainInfo: KeplrChainInfo): Promise<void>;
    enable(chainId: string): Promise<void>;
    getKey(chainId: string): Promise<{
      name: string;
      algo: string;
      pubKey: Uint8Array;
      address: Uint8Array;
      bech32Address: string;
      isNanoLedger: boolean;
    }>;
    getOfflineSigner(chainId: string): unknown;
    getOfflineSignerAuto(chainId: string): Promise<unknown>;
    signAmino(
      chainId: string,
      signer: string,
      signDoc: unknown,
    ): Promise<{ signed: unknown; signature: { pub_key: unknown; signature: string } }>;
  };
}

/* ------------------------------------------------------------------ */
/*  Build Keplr chain config for Axiome                                */
/* ------------------------------------------------------------------ */

function buildKeplrChainInfo(): KeplrChainInfo {
  const config = getAxiomeChainConfig({
    chainId: CHAIN_ID,
  });

  return {
    chainId: config.chainId,
    chainName: config.chainName,
    rpc: config.rpc,
    rest: config.rest,
    bip44: { coinType: AXIOME_COIN_TYPE },
    bech32Config: config.bech32Config,
    currencies: config.currencies.map((c) => ({
      ...c,
      coinType: AXIOME_COIN_TYPE,
    })),
    feeCurrencies: config.feeCurrencies,
    stakeCurrency: config.stakeCurrency,
  };
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export interface KeplrWalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isKeplrAvailable: boolean;
  shortAddress: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  getOfflineSigner: () => unknown | null;
  error: string | null;
}

export function useKeplr(): KeplrWalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isKeplrAvailable, setIsKeplrAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keplrRef = useRef<KeplrWindow['keplr']>(null);

  // Check if Keplr is available
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkKeplr = () => {
      const keplr = (window as unknown as KeplrWindow).keplr;
      if (keplr) {
        keplrRef.current = keplr;
        setIsKeplrAvailable(true);
      }
    };

    // Check immediately
    checkKeplr();

    // Also check after window.onload (Keplr injects after DOM ready)
    window.addEventListener('keplr_keystorechange', checkKeplr);

    // Retry after a short delay for slow injection
    const timer = setTimeout(checkKeplr, 1000);

    return () => {
      window.removeEventListener('keplr_keystorechange', checkKeplr);
      clearTimeout(timer);
    };
  }, []);

  // Auto-reconnect from storage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem(STORAGE_KEYS.CONNECTED_ADDRESS);
    if (stored && stored.startsWith('axm1')) {
      setAddress(stored);
    }
  }, []);

  const connect = useCallback(async () => {
    const keplr = (window as unknown as KeplrWindow).keplr;
    if (!keplr) {
      setError('Keplr wallet not found. Please install the Keplr extension.');
      return;
    }
    keplrRef.current = keplr;

    setIsConnecting(true);
    setError(null);

    try {
      // Suggest Axiome chain to Keplr (adds it if not already there)
      const chainInfo = buildKeplrChainInfo();
      await keplr.experimentalSuggestChain(chainInfo);

      // Enable the chain
      await keplr.enable(chainInfo.chainId);

      // Get the account
      const key = await keplr.getKey(chainInfo.chainId);
      const addr = key.bech32Address;

      if (!addr.startsWith('axm1')) {
        throw new Error(`Wrong address prefix: ${addr}. Expected axm1...`);
      }

      setAddress(addr);
      sessionStorage.setItem(STORAGE_KEYS.CONNECTED_ADDRESS, addr);

      // Register session with backend
      try {
        await fetch(`${API_URL}/api/v1/auth/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-wallet-address': addr },
          credentials: 'include',
          body: JSON.stringify({ address: addr }),
        });
      } catch {
        // Non-fatal — session cookie is optional
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect Keplr';
      setError(msg);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
    sessionStorage.removeItem(STORAGE_KEYS.CONNECTED_ADDRESS);
  }, []);

  const getOfflineSigner = useCallback(() => {
    if (!keplrRef.current) return null;
    return keplrRef.current.getOfflineSigner(CHAIN_ID);
  }, []);

  const shortAddress = address
    ? `${address.slice(0, 10)}...${address.slice(-4)}`
    : null;

  return {
    address,
    isConnected: address !== null,
    isConnecting,
    isKeplrAvailable,
    shortAddress,
    connect,
    disconnect,
    getOfflineSigner,
    error,
  };
}
