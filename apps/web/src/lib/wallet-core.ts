/**
 * Web Wallet Core — client-side only wallet for Axiome chain.
 *
 * SECURITY:
 * - Mnemonic NEVER leaves the browser.
 * - Encrypted with user's PIN via AES-256-GCM (Web Crypto API).
 * - Stored in localStorage (encrypted) or sessionStorage (ephemeral).
 * - Private key exists only in memory during active session.
 *
 * All crypto operations use standard, auditable libraries:
 * - CosmJS for key derivation and signing
 * - Web Crypto API (SubtleCrypto) for AES encryption
 */

import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { stringToPath } from '@cosmjs/crypto';

// ---- Constants ----

const AXIOME_HD_PATH = stringToPath("m/44'/546'/0'/0/0");
const AXIOME_PREFIX = 'axm';
const STORAGE_KEY_WALLET_V1 = 'coinflip_wallet_v1';
const STORAGE_KEY_WALLETS_V2 = 'coinflip_wallets_v2';

export interface StoredWallet {
  /** The axm1... address (not sensitive, used for display) */
  address: string;
  /** AES-256-GCM encrypted mnemonic (Base64) */
  encryptedMnemonic: string;
  /** Salt used for PBKDF2 key derivation (Base64) */
  salt: string;
  /** IV used for AES-GCM (Base64) */
  iv: string;
  /** Whether this is a session-only wallet */
  ephemeral: boolean;
}

// ---- Mnemonic Validation ----

/**
 * Quick validation: 12 or 24 lowercase words separated by spaces.
 * Full BIP39 validation happens during derivation.
 */
export function validateMnemonicFormat(mnemonic: string): { valid: boolean; error?: string } {
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) {
    return { valid: false, error: `Expected 12 or 24 words, got ${words.length}` };
  }
  if (words.some((w) => !/^[a-z]+$/.test(w))) {
    return { valid: false, error: 'Words must contain only lowercase letters' };
  }
  return { valid: true };
}

// ---- Key Derivation ----

/**
 * Derive wallet from mnemonic.
 * Returns a DirectSecp256k1HdWallet instance (CosmJS) and the bech32 address.
 * Throws if mnemonic is invalid.
 */
export async function deriveWallet(mnemonic: string): Promise<{
  wallet: DirectSecp256k1HdWallet;
  address: string;
}> {
  const cleaned = mnemonic.trim().toLowerCase();
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(cleaned, {
    hdPaths: [AXIOME_HD_PATH],
    prefix: AXIOME_PREFIX,
  });
  const [account] = await wallet.getAccounts();
  return { wallet, address: account!.address };
}

// ---- Encryption (AES-256-GCM via Web Crypto API) ----

/**
 * Derive an AES-256-GCM key from a PIN using PBKDF2.
 * Uses 100,000 iterations for brute-force resistance.
 */
async function deriveAesKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt mnemonic with a PIN. Returns Base64-encoded ciphertext + salt + iv. */
export async function encryptMnemonic(
  mnemonic: string,
  pin: string,
): Promise<{ encrypted: string; salt: string; iv: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(pin, salt);

  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    enc.encode(mnemonic) as BufferSource,
  );

  return {
    encrypted: bufToBase64(new Uint8Array(ciphertext)),
    salt: bufToBase64(salt),
    iv: bufToBase64(iv),
  };
}

/** Decrypt mnemonic with a PIN. Throws if PIN is wrong. */
export async function decryptMnemonic(
  encrypted: string,
  salt: string,
  iv: string,
  pin: string,
): Promise<string> {
  const key = await deriveAesKey(pin, base64ToBuf(salt));
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBuf(iv) as BufferSource },
      key,
      base64ToBuf(encrypted) as BufferSource,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('Wrong PIN or corrupted data');
  }
}

// ---- Storage (Multi-Wallet v2) ----

/** Runtime check: is this a valid StoredWallet object? */
function isValidStoredWallet(w: unknown): w is StoredWallet {
  return (
    typeof w === 'object' &&
    w !== null &&
    typeof (w as StoredWallet).address === 'string' &&
    (w as StoredWallet).address.length > 0 &&
    typeof (w as StoredWallet).encryptedMnemonic === 'string' &&
    typeof (w as StoredWallet).salt === 'string' &&
    typeof (w as StoredWallet).iv === 'string'
  );
}

/** Migrate from single-wallet v1 format to multi-wallet v2. Runs once on first load. */
function migrateFromV1IfNeeded(): void {
  for (const storage of [localStorage, sessionStorage]) {
    const rawV1 = storage.getItem(STORAGE_KEY_WALLET_V1);
    if (rawV1) {
      try {
        const legacy = JSON.parse(rawV1) as unknown;
        if (isValidStoredWallet(legacy)) {
          const arr: StoredWallet[] = [legacy];
          storage.setItem(STORAGE_KEY_WALLETS_V2, JSON.stringify(arr));
        }
      } catch {
        // Corrupted v1 data — just remove it
      }
      storage.removeItem(STORAGE_KEY_WALLET_V1);
    }
  }
}

/** Load wallets array from storage with runtime validation — drops invalid entries. */
function loadWalletsArray(storage: Storage): StoredWallet[] {
  const raw = storage.getItem(STORAGE_KEY_WALLETS_V2);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      storage.removeItem(STORAGE_KEY_WALLETS_V2);
      return [];
    }
    return parsed.filter(isValidStoredWallet);
  } catch {
    storage.removeItem(STORAGE_KEY_WALLETS_V2);
    return [];
  }
}

/** Get all saved wallets (address only, no decryption). Persistent + ephemeral merged. */
export function listSavedWallets(): { address: string; ephemeral: boolean }[] {
  if (typeof window === 'undefined') return [];
  migrateFromV1IfNeeded();

  const persistent = loadWalletsArray(localStorage);
  const ephemeral = loadWalletsArray(sessionStorage);
  const seen = new Set<string>();

  return [...persistent, ...ephemeral]
    .filter((w) => {
      if (!w.address || typeof w.address !== 'string') return false;
      if (seen.has(w.address)) return false;
      seen.add(w.address);
      return true;
    })
    .map((w) => ({ address: w.address, ephemeral: w.ephemeral ?? false }));
}

/** Load stored wallet by address. Returns null if not found. */
export function loadStoredWalletByAddress(address: string): StoredWallet | null {
  if (typeof window === 'undefined') return null;
  migrateFromV1IfNeeded();

  for (const storage of [localStorage, sessionStorage]) {
    const arr = loadWalletsArray(storage);
    const w = arr.find((x) => x.address === address);
    if (w) return w;
  }
  return null;
}

/** Save or update wallet in storage. If address exists, replaces; otherwise appends. */
export function saveWallet(wallet: StoredWallet): void {
  migrateFromV1IfNeeded();
  const storage = wallet.ephemeral ? sessionStorage : localStorage;
  const arr = loadWalletsArray(storage);
  const idx = arr.findIndex((w) => w.address === wallet.address);
  if (idx >= 0) arr[idx] = wallet;
  else arr.push(wallet);
  storage.setItem(STORAGE_KEY_WALLETS_V2, JSON.stringify(arr));
}

/** Remove wallet by address from all storages. */
export function forgetWallet(address?: string): void {
  migrateFromV1IfNeeded();

  const removeFrom = (storage: Storage) => {
    const arr = loadWalletsArray(storage);
    const filtered = address ? arr.filter((w) => w.address !== address) : [];
    if (filtered.length === 0) storage.removeItem(STORAGE_KEY_WALLETS_V2);
    else storage.setItem(STORAGE_KEY_WALLETS_V2, JSON.stringify(filtered));
  };

  removeFrom(localStorage);
  removeFrom(sessionStorage);
}

/** Backward compat: load "first" stored wallet (for single-wallet flows). */
export function loadStoredWallet(): StoredWallet | null {
  const list = listSavedWallets();
  if (list.length === 0) return null;
  return loadStoredWalletByAddress(list[0]!.address);
}

/** Check if any wallet is saved (without decrypting). */
export function hasSavedWallet(): { saved: boolean; address?: string; wallets: { address: string }[] } {
  const list = listSavedWallets();
  const wallets = list.map((w) => ({ address: w.address }));
  return list.length > 0
    ? { saved: true, address: list[0]!.address, wallets }
    : { saved: false, wallets: [] };
}

// ---- Helpers ----

function bufToBase64(buf: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]!);
  }
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return buf;
}
