/**
 * Web Wallet Signer — client-side transaction signing for Axiome chain.
 *
 * All signing happens in the browser using CosmJS.
 * No private keys or mnemonics are ever sent to the server.
 *
 * Deposit flow (optimized):
 *   1. Sign tx locally with cached client + fixed gas (no simulate RPC call)
 *   2. Send signed tx bytes to server via POST /api/v1/vault/deposit/broadcast
 *   3. Server broadcasts directly to RPC node (bypasses Vercel proxy)
 *   4. Server polls REST API for confirmation (2s intervals, same as relayer)
 *
 * This eliminates the slow path: Browser → Vercel CDN → Next.js → RPC node
 * and replaces it with: Browser → API server → RPC node (direct connection).
 */

import type { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { SigningStargateClient, GasPrice, calculateFee } from '@cosmjs/stargate';
import { DEFAULT_GAS_PRICE } from '@coinflip/shared/chain';
import { COINFLIP_CONTRACT, LAUNCH_CW20_CONTRACT } from '@/lib/constants';
import { toMicroLaunch } from '@coinflip/shared/constants';
import { Registry } from '@cosmjs/proto-signing';
import { defaultRegistryTypes } from '@cosmjs/stargate';
import { MsgExec, MsgGrant } from 'cosmjs-types/cosmos/authz/v1beta1/tx';
import { GenericAuthorization } from 'cosmjs-types/cosmos/authz/v1beta1/authz';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';

/**
 * Get the RPC URL for signing.
 * In the browser, we proxy through Next.js to avoid CORS issues.
 * The proxy route `/chain-rpc/...` is set up in next.config.ts.
 */
function getRpcUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/chain-rpc`;
  }
  return 'http://49.13.3.227:26657';
}

// ---- Signing Client Cache ----
// Reuse the CosmWasm client across deposits to avoid the ~1-2s connection overhead.
// The client maintains a WebSocket connection to the RPC node via the Next.js proxy.

let _cachedCosmWasmClient: SigningCosmWasmClient | null = null;
let _cachedWalletAddr: string | null = null;

async function getCachedCosmWasmClient(
  wallet: DirectSecp256k1HdWallet,
): Promise<SigningCosmWasmClient> {
  const accounts = await wallet.getAccounts();
  const addr = accounts[0]!.address;

  if (_cachedCosmWasmClient && _cachedWalletAddr === addr) {
    return _cachedCosmWasmClient;
  }

  // Cleanup old client
  if (_cachedCosmWasmClient) {
    try { _cachedCosmWasmClient.disconnect(); } catch { /* ignore */ }
  }

  const rpcUrl = getRpcUrl();
  _cachedCosmWasmClient = await SigningCosmWasmClient.connectWithSigner(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(DEFAULT_GAS_PRICE),
  });
  _cachedWalletAddr = addr;
  return _cachedCosmWasmClient;
}

/** Clear the cached signing client (call on wallet change / disconnect). */
export function clearSigningClientCache(): void {
  if (_cachedCosmWasmClient) {
    try { _cachedCosmWasmClient.disconnect(); } catch { /* ignore */ }
    _cachedCosmWasmClient = null;
    _cachedWalletAddr = null;
  }
}

/** Create a SigningCosmWasmClient for CW20 operations (legacy, non-cached). */
export async function getCosmWasmClient(
  wallet: DirectSecp256k1HdWallet,
): Promise<SigningCosmWasmClient> {
  const rpcUrl = getRpcUrl();
  return SigningCosmWasmClient.connectWithSigner(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(DEFAULT_GAS_PRICE),
    broadcastTimeoutMs: 60_000,
    broadcastPollIntervalMs: 2_000,
  });
}

/** Create a SigningStargateClient for Cosmos SDK messages (authz). */
export async function getStargateClient(
  wallet: DirectSecp256k1HdWallet,
): Promise<SigningStargateClient> {
  const registry = new Registry(defaultRegistryTypes);
  registry.register('/cosmos.authz.v1beta1.MsgGrant', MsgGrant);
  registry.register('/cosmos.authz.v1beta1.MsgExec', MsgExec);

  const rpcUrl = getRpcUrl();
  return SigningStargateClient.connectWithSigner(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(DEFAULT_GAS_PRICE),
    registry,
  });
}

// ---- Deposit (CW20 Send) — Optimized: sign-only ----

/**
 * Fixed gas limit for CW20 Send → CoinFlip deposit.
 * CW20 Send with deposit submessage typically uses 250k-400k gas.
 * 500k provides headroom without wasting fees.
 * Eliminates the extra `simulate` RPC call that 'auto' gas requires.
 */
const DEPOSIT_GAS_LIMIT = 500_000;

/** Convert Uint8Array to base64 string (browser-safe). */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Sign a deposit transaction locally and return the raw tx bytes (base64).
 * Does NOT broadcast — the caller sends bytes to the API server for direct broadcast.
 *
 * This is the optimized path: only 1 RPC roundtrip (account sequence query),
 * then pure local signing. No simulate, no broadcast through proxy.
 *
 * @returns base64-encoded signed tx bytes ready for broadcast
 */
export async function signDepositTxBytes(
  wallet: DirectSecp256k1HdWallet,
  address: string,
  humanAmount: number,
): Promise<{ txBytes: string }> {
  let client: SigningCosmWasmClient;
  try {
    client = await getCachedCosmWasmClient(wallet);
  } catch {
    // Cached client connection may be stale — recreate
    clearSigningClientCache();
    client = await getCachedCosmWasmClient(wallet);
  }

  const microAmount = toMicroLaunch(humanAmount);

  const msg = {
    typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
    value: MsgExecuteContract.fromPartial({
      sender: address,
      contract: LAUNCH_CW20_CONTRACT,
      msg: new TextEncoder().encode(JSON.stringify({
        send: {
          contract: COINFLIP_CONTRACT,
          amount: microAmount,
          msg: btoa(JSON.stringify({ deposit: {} })),
        },
      })),
      funds: [],
    }),
  };

  const fee = calculateFee(DEPOSIT_GAS_LIMIT, GasPrice.fromString(DEFAULT_GAS_PRICE));

  let txRaw: TxRaw;
  try {
    txRaw = await client.sign(address, [msg], fee, 'CoinFlip deposit');
  } catch (err) {
    // Connection might be stale — try reconnecting once
    const errMsg = err instanceof Error ? err.message : '';
    if (errMsg.includes('WebSocket') || errMsg.includes('socket') || errMsg.includes('connect')) {
      clearSigningClientCache();
      const freshClient = await getCachedCosmWasmClient(wallet);
      txRaw = await freshClient.sign(address, [msg], fee, 'CoinFlip deposit');
    } else {
      throw err;
    }
  }

  const txBytes = TxRaw.encode(txRaw).finish();
  return { txBytes: uint8ToBase64(txBytes) };
}

export interface DepositResult {
  txHash: string;
  height: number;
}

/**
 * Legacy: Deposit LAUNCH tokens with full client-side sign + broadcast.
 * Kept as fallback; prefer signDepositTxBytes() + server broadcast.
 */
export async function signDeposit(
  wallet: DirectSecp256k1HdWallet,
  address: string,
  humanAmount: number,
): Promise<DepositResult> {
  const client = await getCachedCosmWasmClient(wallet);
  const microAmount = toMicroLaunch(humanAmount);

  const sendMsg = {
    send: {
      contract: COINFLIP_CONTRACT,
      amount: microAmount,
      msg: btoa(JSON.stringify({ deposit: {} })),
    },
  };

  const fee = calculateFee(DEPOSIT_GAS_LIMIT, GasPrice.fromString(DEFAULT_GAS_PRICE));

  const result = await client.execute(
    address,
    LAUNCH_CW20_CONTRACT,
    sendMsg,
    fee,
    'CoinFlip deposit',
  );

  return {
    txHash: result.transactionHash,
    height: result.height,
  };
}

// ---- Authz Grant ----

export interface AuthzGrantResult {
  txHash: string;
  height: number;
}

/**
 * Grant Authz permission to the relayer for MsgExecuteContract.
 * This enables "1-click play" — the relayer can submit game actions on behalf of the user.
 *
 * @param wallet - CosmJS wallet instance
 * @param address - Granter's axm1... address
 * @param grantee - Relayer's axm1... address
 * @param expirationSeconds - Grant duration in seconds (default: 30 days)
 */
export async function signAuthzGrant(
  wallet: DirectSecp256k1HdWallet,
  address: string,
  grantee: string,
  expirationSeconds: number = 30 * 24 * 60 * 60,
): Promise<AuthzGrantResult> {
  const client = await getStargateClient(wallet);

  const expiration = new Date(Date.now() + expirationSeconds * 1000);

  const msgGrant = {
    typeUrl: '/cosmos.authz.v1beta1.MsgGrant',
    value: MsgGrant.fromPartial({
      granter: address,
      grantee,
      grant: {
        authorization: {
          typeUrl: '/cosmos.authz.v1beta1.GenericAuthorization',
          value: GenericAuthorization.encode(
            GenericAuthorization.fromPartial({
              msg: '/cosmwasm.wasm.v1.MsgExecuteContract',
            }),
          ).finish(),
        },
        expiration: {
          seconds: BigInt(Math.floor(expiration.getTime() / 1000)),
          nanos: 0,
        },
      },
    }),
  };

  const result = await client.signAndBroadcast(address, [msgGrant], 'auto', 'CoinFlip 1-click authorization');

  if (result.code !== 0) {
    throw new Error(`Authz grant failed: ${result.rawLog}`);
  }

  return {
    txHash: result.transactionHash,
    height: result.height,
  };
}

// ---- Withdraw (direct, for treasury/advanced users) ----

/**
 * Direct withdraw from vault — signs and broadcasts a MsgExecuteContract.
 * This is for cases where the user wants to withdraw without going through the relayer.
 */
export async function signDirectWithdraw(
  wallet: DirectSecp256k1HdWallet,
  address: string,
  microAmount: string,
): Promise<{ txHash: string; height: number }> {
  const client = await getCosmWasmClient(wallet);

  const withdrawMsg = { withdraw: { amount: microAmount } };

  const result = await client.execute(
    address,
    COINFLIP_CONTRACT,
    withdrawMsg,
    'auto',
    'CoinFlip withdraw',
  );

  return {
    txHash: result.transactionHash,
    height: result.height,
  };
}
