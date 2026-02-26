'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { Secp256k1, Sha256, Bip39, Slip10, Slip10Curve, stringToPath, EnglishMnemonic } from '@cosmjs/crypto';
import { toHex } from '@cosmjs/encoding';
import {
  deriveWallet,
  encryptMnemonic,
  decryptMnemonic,
  loadStoredWallet,
  loadStoredWalletByAddress,
  saveWallet,
  forgetWallet as forgetStoredWallet,
  hasSavedWallet,
  validateMnemonicFormat,
  type StoredWallet,
} from '@/lib/wallet-core';
import { clearSigningClientCache } from '@/lib/wallet-signer';
import { API_URL, STORAGE_KEYS } from '@/lib/constants';
import { AXIOME_HD_PATH } from '@coinflip/shared/chain';

// ---- Session persistence keys ----
const SESSION_WALLET_KEY = 'coinflip_session_wallet';
const SESSION_PWD_KEY = 'coinflip_session_pwd';
/** Key for storing auth token (needed for iOS Safari where cookies are blocked by ITP) */
const SESSION_AUTH_TOKEN_KEY = 'coinflip_auth_token';

/** Generate a random password for session wallet serialization */
function generateSessionPassword(): string {
  const arr = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Save serialized wallet to sessionStorage for persistence across refreshes */
async function saveSessionWallet(wallet: DirectSecp256k1HdWallet): Promise<void> {
  try {
    const pwd = generateSessionPassword();
    const serialized = await wallet.serialize(pwd);
    sessionStorage.setItem(SESSION_WALLET_KEY, serialized);
    sessionStorage.setItem(SESSION_PWD_KEY, pwd);
  } catch {
    // Non-fatal: worst case user will need to re-enter PIN on refresh
  }
}

/** Restore wallet from sessionStorage */
async function restoreSessionWallet(): Promise<DirectSecp256k1HdWallet | null> {
  try {
    const serialized = sessionStorage.getItem(SESSION_WALLET_KEY);
    const pwd = sessionStorage.getItem(SESSION_PWD_KEY);
    if (!serialized || !pwd) return null;
    return await DirectSecp256k1HdWallet.deserialize(serialized, pwd);
  } catch {
    // Corrupted/expired — clean up
    sessionStorage.removeItem(SESSION_WALLET_KEY);
    sessionStorage.removeItem(SESSION_PWD_KEY);
    return null;
  }
}

/** Clear session wallet data */
function clearSessionWallet(): void {
  sessionStorage.removeItem(SESSION_WALLET_KEY);
  sessionStorage.removeItem(SESSION_PWD_KEY);
  sessionStorage.removeItem(SESSION_AUTH_TOKEN_KEY);
}

export interface WebWalletState {
  /** Current axm1... address (null if not connected) */
  address: string | null;
  /** Whether wallet is connected and ready to sign */
  isConnected: boolean;
  /** Whether we're currently deriving/decrypting */
  isConnecting: boolean;
  /** Whether there's a saved wallet in storage */
  hasSaved: boolean;
  /** Saved address for display (before unlock) — first wallet when multiple */
  savedAddress: string | null;
  /** List of saved wallet addresses (for multi-wallet UI) */
  savedWallets: { address: string }[];
  /** Short address for compact display */
  shortAddress: string | null;
  /** Error message if any */
  error: string | null;

  /** Connect with a new mnemonic */
  connectWithMnemonic: (mnemonic: string, pin: string, rememberMe: boolean) => Promise<void>;
  /** Unlock a saved wallet with PIN (address required when multiple wallets) */
  unlockWithPin: (pin: string, address?: string) => Promise<void>;
  /** Switch to another saved wallet (requires PIN) */
  switchWallet: (address: string, pin: string) => Promise<void>;
  /** Disconnect (keep saved wallets) */
  disconnect: () => void;
  /** Forget wallet (specific address, or all if none given) */
  forgetWallet: (address?: string) => void;

  /** Refresh saved wallets list from storage (call when modal opens) */
  refreshSavedWallets: () => void;

  /** Get the wallet instance for signing (null if not connected) */
  getWallet: () => DirectSecp256k1HdWallet | null;
}

function refreshSavedState(
  setHasSaved: (v: boolean) => void,
  setSavedAddress: (v: string | null) => void,
  setSavedWallets: (v: { address: string }[]) => void,
) {
  const info = hasSavedWallet();
  setHasSaved(info.saved);
  setSavedAddress(info.address ?? null);
  setSavedWallets(info.wallets);
}

export function useWebWallet(): WebWalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [savedAddress, setSavedAddress] = useState<string | null>(null);
  const [savedWallets, setSavedWallets] = useState<{ address: string }[]>([]);

  // In-memory wallet (never persisted as-is)
  const walletRef = useRef<DirectSecp256k1HdWallet | null>(null);

  /**
   * Register session with backend using challenge-response auth.
   * If mnemonic is provided, performs cryptographic signature verification.
   * Falls back to legacy /auth/connect if signature auth fails.
   */
  const registerSession = useCallback(async (addr: string, mnemonic?: string) => {
    try {
      // If mnemonic available, use secure challenge-response auth
      if (mnemonic) {
        try {
          // Step 1: Get challenge from server
          const challengeRes = await fetch(
            `${API_URL}/api/v1/auth/challenge?address=${encodeURIComponent(addr)}`,
            { credentials: 'include' },
          );
          if (challengeRes.ok) {
            const challengeData = await challengeRes.json();
            const nonce = challengeData.data?.challenge;
            if (nonce) {
              // Step 2: Sign the challenge with wallet's private key
              const seed = await Bip39.mnemonicToSeed(
                new EnglishMnemonic(mnemonic.trim().toLowerCase()),
              );
              const { privkey } = Slip10.derivePath(
                Slip10Curve.Secp256k1,
                seed,
                stringToPath(AXIOME_HD_PATH),
              );
              const { pubkey } = await Secp256k1.makeKeypair(privkey);
              const compressedPubkey = Secp256k1.compressPubkey(pubkey);

              const messageHash = new Sha256(new TextEncoder().encode(nonce)).digest();
              const signature = await Secp256k1.createSignature(messageHash, privkey);
              const sigBytes = new Uint8Array([
                ...signature.r(32),
                ...signature.s(32),
              ]);

              // Step 3: Verify with server
              const verifyRes = await fetch(`${API_URL}/api/v1/auth/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  address: addr,
                  signature: toHex(sigBytes),
                  pubkey: toHex(compressedPubkey),
                }),
              });

              if (verifyRes.ok) {
                // Store token for iOS Safari (cookies blocked by ITP)
                try {
                  const verifyData = await verifyRes.json();
                  const token = verifyData?.data?.token;
                  if (token) {
                    sessionStorage.setItem(SESSION_AUTH_TOKEN_KEY, token);
                  }
                } catch { /* non-fatal */ }
                return; // Authenticated via signature
              }
            }
          }
        } catch {
          // Challenge-response failed — fall back to legacy
        }
      }

      // Fallback: legacy connect (still sets session cookie in dev mode)
      await fetch(`${API_URL}/api/v1/auth/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-wallet-address': addr },
        credentials: 'include',
        body: JSON.stringify({ address: addr }),
      });
    } catch {
      // Non-fatal
    }
  }, []);

  // Check for saved wallets on mount + try to auto-restore session
  useEffect(() => {
    if (typeof window === 'undefined') return;

    refreshSavedState(setHasSaved, setSavedAddress, setSavedWallets);

    // Try to restore wallet from session (persists across page refreshes within same tab)
    const sessionAddr = sessionStorage.getItem(STORAGE_KEYS.CONNECTED_ADDRESS);
    if (sessionAddr && sessionAddr.startsWith('axm1')) {
      setIsConnecting(true);
      restoreSessionWallet().then(async (wallet) => {
        if (wallet) {
          const [account] = await wallet.getAccounts();
          if (account?.address === sessionAddr) {
            walletRef.current = wallet;
            setAddress(sessionAddr);
            setIsConnecting(false);
            // Register session in background (fire-and-forget)
            registerSession(sessionAddr, wallet.mnemonic).catch((err) => {
              console.error('[useWebWallet] Session registration failed:', err);
            });
          } else {
            // Address mismatch — clear stale session
            clearSessionWallet();
            sessionStorage.removeItem(STORAGE_KEYS.CONNECTED_ADDRESS);
            setIsConnecting(false);
          }
        } else {
          setIsConnecting(false);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Connect with a new mnemonic + PIN */
  const connectWithMnemonic = useCallback(async (mnemonic: string, pin: string, rememberMe: boolean) => {
    setIsConnecting(true);
    setError(null);

    try {
      // Validate format first
      const validation = validateMnemonicFormat(mnemonic);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Derive wallet
      const { wallet, address: addr } = await deriveWallet(mnemonic);

      // Clear old signing client — new wallet needs a fresh connection
      clearSigningClientCache();

      walletRef.current = wallet;

      // Encrypt and save to localStorage
      const { encrypted, salt, iv } = await encryptMnemonic(mnemonic.trim().toLowerCase(), pin);
      const storedWallet: StoredWallet = {
        address: addr,
        encryptedMnemonic: encrypted,
        salt,
        iv,
        ephemeral: !rememberMe,
      };
      saveWallet(storedWallet);

      // Save serialized wallet to sessionStorage for refresh persistence
      await saveSessionWallet(wallet);

      // Register session BEFORE updating address state (same reason as unlockWithPin)
      await registerSession(addr, mnemonic.trim().toLowerCase());

      // Update state — session cookie is already set, so queries will use correct wallet
      setAddress(addr);
      refreshSavedState(setHasSaved, setSavedAddress, setSavedWallets);
      sessionStorage.setItem(STORAGE_KEYS.CONNECTED_ADDRESS, addr);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(msg);
      walletRef.current = null;
    } finally {
      setIsConnecting(false);
    }
  }, [registerSession]);

  /** Unlock saved wallet with PIN. Pass address when multiple wallets. */
  const unlockWithPin = useCallback(async (pin: string, targetAddress?: string) => {
    setIsConnecting(true);
    setError(null);

    try {
      const stored = targetAddress
        ? loadStoredWalletByAddress(targetAddress)
        : loadStoredWallet();
      if (!stored) {
        throw new Error('No saved wallet found');
      }

      // Decrypt mnemonic (stays in memory only during this call)
      const mnemonic = await decryptMnemonic(
        stored.encryptedMnemonic,
        stored.salt,
        stored.iv,
        pin,
      );

      // Derive wallet from decrypted mnemonic
      const { wallet, address: addr } = await deriveWallet(mnemonic);

      // IMPORTANT: Clear old signing client before switching wallet reference.
      // The cached SigningCosmWasmClient holds a WebSocket + keys from the previous wallet.
      // Without this, deposits/authz after switching would use the OLD wallet's keys.
      clearSigningClientCache();

      walletRef.current = wallet;

      // Verify address matches
      if (addr !== stored.address) {
        throw new Error('Address mismatch — wallet data may be corrupted');
      }

      // Save serialized wallet to sessionStorage for refresh persistence
      await saveSessionWallet(wallet);

      // Register session BEFORE updating address state.
      // This ensures the session cookie is set for the new wallet
      // before React re-renders trigger queries (useGrantStatus, etc.)
      // that depend on the cookie for authentication.
      await registerSession(addr, mnemonic);

      setAddress(addr);
      sessionStorage.setItem(STORAGE_KEYS.CONNECTED_ADDRESS, addr);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to unlock wallet';
      setError(msg);
      walletRef.current = null;
    } finally {
      setIsConnecting(false);
    }
  }, [registerSession]);

  /** Switch to another saved wallet (disconnect, then unlock with PIN) */
  const switchWallet = useCallback(async (targetAddress: string, pin: string) => {
    // Disconnect current first
    walletRef.current = null;
    setAddress(null);
    clearSessionWallet();
    clearSigningClientCache();
    sessionStorage.removeItem(STORAGE_KEYS.CONNECTED_ADDRESS);

    // Unlock the target
    await unlockWithPin(pin, targetAddress);
  }, [unlockWithPin]);

  /** Disconnect (keep saved wallet for later unlock) */
  const disconnect = useCallback(() => {
    walletRef.current = null;
    setAddress(null);
    setError(null);
    clearSessionWallet();
    clearSigningClientCache();
    sessionStorage.removeItem(STORAGE_KEYS.CONNECTED_ADDRESS);
  }, []);

  /** Refresh saved wallets from storage */
  const refreshSavedWallets = useCallback(() => {
    refreshSavedState(setHasSaved, setSavedAddress, setSavedWallets);
  }, []);

  /** Forget wallet (by address) or all if no address given */
  const forgetWallet = useCallback((targetAddress?: string) => {
    const wasCurrent = !targetAddress || address === targetAddress;
    if (wasCurrent) {
      walletRef.current = null;
      setAddress(null);
      clearSessionWallet();
      clearSigningClientCache();
      sessionStorage.removeItem(STORAGE_KEYS.CONNECTED_ADDRESS);
    }
    setError(null);
    forgetStoredWallet(targetAddress);
    refreshSavedState(setHasSaved, setSavedAddress, setSavedWallets);
  }, [address]);

  /** Get wallet for signing */
  const getWallet = useCallback(() => walletRef.current, []);

  const shortAddress =
    address && typeof address === 'string'
      ? `${address.slice(0, 10)}...${address.slice(-4)}`
      : null;

  return {
    address,
    isConnected: address !== null && walletRef.current !== null,
    isConnecting,
    hasSaved,
    savedAddress,
    savedWallets,
    shortAddress,
    error,
    connectWithMnemonic,
    unlockWithPin,
    switchWallet,
    disconnect,
    forgetWallet,
    refreshSavedWallets,
    getWallet,
  };
}
