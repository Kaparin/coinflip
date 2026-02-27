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
import { COINFLIP_CONTRACT, LAUNCH_CW20_CONTRACT, PRESALE_CONTRACT } from '@/lib/constants';
import { toMicroLaunch } from '@coinflip/shared/constants';
import { Registry } from '@cosmjs/proto-signing';
import { defaultRegistryTypes } from '@cosmjs/stargate';
import { MsgExec, MsgGrant } from 'cosmjs-types/cosmos/authz/v1beta1/tx';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
import { ContractExecutionAuthorization, AcceptedMessageKeysFilter, MaxCallsLimit } from 'cosmjs-types/cosmwasm/wasm/v1/authz';
import { MsgGrantAllowance } from 'cosmjs-types/cosmos/feegrant/v1beta1/tx';
import { BasicAllowance } from 'cosmjs-types/cosmos/feegrant/v1beta1/feegrant';
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
  // Server-side fallback: use env var or Next.js proxy
  return process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:26657';
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
  registry.register('/cosmos.feegrant.v1beta1.MsgGrantAllowance', MsgGrantAllowance);

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

/**
 * Fixed gas limit for MsgGrant (authz) + MsgGrantAllowance (feegrant).
 * MsgGrant typically uses 80k-150k gas, MsgGrantAllowance ~80k.
 * 400k provides headroom for both messages in a single tx.
 * Eliminates the `simulate` RPC call that 'auto' gas requires —
 * this avoids stale sequence issues for new accounts after deposit.
 */
const AUTHZ_GAS_LIMIT = 400_000;

export interface AuthzGrantResult {
  txHash: string;
  height: number;
}

/**
 * Grant Authz permission to the relayer for MsgExecuteContract.
 * This enables "1-click play" — the relayer can submit game actions on behalf of the user.
 *
 * Uses fixed gas and retries on sequence mismatch — new accounts often hit this
 * when the Authz grant follows a deposit (sequence advances but RPC returns stale value).
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

  // Build scoped ContractExecutionAuthorization grants.
  // Each grant specifies a contract address + allowed message keys + call limit.
  // This is MUCH safer than GenericAuthorization which allows ANY contract execution.
  // `limit` is REQUIRED by wasmd — omitting it causes "limit: undefined limit: invalid type".
  const maxCallsLimit = {
    typeUrl: '/cosmwasm.wasm.v1.MaxCallsLimit',
    value: MaxCallsLimit.encode(
      MaxCallsLimit.fromPartial({ remaining: BigInt(999_999) }),
    ).finish(),
  };

  const contractGrants: Array<{
    contract: string;
    limit: { typeUrl: string; value: Uint8Array };
    filter: { typeUrl: string; value: Uint8Array };
  }> = [];

  // CoinFlip contract: game actions + withdraw
  if (COINFLIP_CONTRACT) {
    contractGrants.push({
      contract: COINFLIP_CONTRACT,
      limit: maxCallsLimit,
      filter: {
        typeUrl: '/cosmwasm.wasm.v1.AcceptedMessageKeysFilter',
        value: AcceptedMessageKeysFilter.encode(
          AcceptedMessageKeysFilter.fromPartial({
            keys: ['create_bet', 'accept_bet', 'accept_and_reveal', 'reveal', 'cancel_bet', 'claim_timeout', 'withdraw'],
          }),
        ).finish(),
      },
    });
  }

  // LAUNCH CW20 contract: transfer (needed for branch-change fee payment)
  if (LAUNCH_CW20_CONTRACT) {
    contractGrants.push({
      contract: LAUNCH_CW20_CONTRACT,
      limit: maxCallsLimit,
      filter: {
        typeUrl: '/cosmwasm.wasm.v1.AcceptedMessageKeysFilter',
        value: AcceptedMessageKeysFilter.encode(
          AcceptedMessageKeysFilter.fromPartial({
            keys: ['transfer'],
          }),
        ).finish(),
      },
    });
  }

  const msgGrant = {
    typeUrl: '/cosmos.authz.v1beta1.MsgGrant',
    value: MsgGrant.fromPartial({
      granter: address,
      grantee,
      grant: {
        authorization: {
          typeUrl: '/cosmwasm.wasm.v1.ContractExecutionAuthorization',
          value: ContractExecutionAuthorization.encode(
            ContractExecutionAuthorization.fromPartial({
              grants: contractGrants,
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

  // Build MsgGrantAllowance: user → relayer feegrant (for non-VIP gas payment)
  const msgFeegrant = {
    typeUrl: '/cosmos.feegrant.v1beta1.MsgGrantAllowance',
    value: MsgGrantAllowance.fromPartial({
      granter: address,
      grantee,
      allowance: {
        typeUrl: '/cosmos.feegrant.v1beta1.BasicAllowance',
        value: BasicAllowance.encode(
          BasicAllowance.fromPartial({
            spendLimit: [{ denom: 'uaxm', amount: '10000000' }], // 10 AXM
            expiration: {
              seconds: BigInt(Math.floor(expiration.getTime() / 1000)),
              nanos: 0,
            },
          }),
        ).finish(),
      },
    }),
  };

  const fee = calculateFee(AUTHZ_GAS_LIMIT, GasPrice.fromString(DEFAULT_GAS_PRICE));

  try {
    const result = await client.signAndBroadcast(address, [msgGrant, msgFeegrant], fee, 'CoinFlip 1-click authorization');
    if (result.code !== 0) {
      throw new Error(`Authz grant failed: ${result.rawLog}`);
    }
    return { txHash: result.transactionHash, height: result.height };
  } catch (err) {
    // Handle sequence mismatch — common for new accounts right after deposit.
    // Parse the expected sequence from the error and retry with explicit SignerData.
    const errMsg = err instanceof Error ? err.message : String(err);
    const seqMatch = errMsg.match(/expected (\d+), got (\d+)/);
    if (!seqMatch) throw err;

    const expectedSeq = parseInt(seqMatch[1]!, 10);
    const { accountNumber } = await client.getSequence(address);
    const chainId = await client.getChainId();

    const txRaw = await client.sign(
      address, [msgGrant, msgFeegrant], fee, 'CoinFlip 1-click authorization',
      { accountNumber, sequence: expectedSeq, chainId },
    );
    const txBytes = TxRaw.encode(txRaw).finish();
    const result = await client.broadcastTx(txBytes);

    if (result.code !== 0) {
      throw new Error(`Authz grant failed: ${result.rawLog}`);
    }
    return { txHash: result.transactionHash, height: result.height };
  }
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

// ---- Presale: Buy COIN with native AXM ----

/**
 * Fixed gas for presale buy.
 * MsgExecuteContract with native funds + CW20 transfer sub-message uses ~250k-400k gas.
 * 600k provides headroom. Eliminates the `simulate` RPC call that 'auto' requires.
 */
const PRESALE_BUY_GAS_LIMIT = 600_000;

export interface PresaleBuyResult {
  txHash: string;
  height?: number;
  /** True if the tx was submitted but confirmation timed out (may still succeed) */
  timedOut?: boolean;
}

/**
 * Buy COIN tokens by sending native AXM to the presale contract.
 * Uses cached client + fixed gas for speed. Handles timeout gracefully.
 *
 * @param wallet - CosmJS wallet instance
 * @param address - Buyer's axm1... address
 * @param microAxmAmount - Amount in uaxm (micro-AXM) to spend
 * @param onStep - Progress callback: 'signing' | 'broadcasting' | 'confirming'
 */
export async function signPresaleBuy(
  wallet: DirectSecp256k1HdWallet,
  address: string,
  microAxmAmount: string,
  onStep?: (step: 'signing' | 'broadcasting' | 'confirming') => void,
): Promise<PresaleBuyResult> {
  onStep?.('signing');

  let client: SigningCosmWasmClient;
  try {
    client = await getCachedCosmWasmClient(wallet);
  } catch {
    clearSigningClientCache();
    client = await getCachedCosmWasmClient(wallet);
  }

  const msg = {
    typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
    value: MsgExecuteContract.fromPartial({
      sender: address,
      contract: PRESALE_CONTRACT,
      msg: new TextEncoder().encode(JSON.stringify({ buy: {} })),
      funds: [{ denom: 'uaxm', amount: microAxmAmount }],
    }),
  };

  const fee = calculateFee(PRESALE_BUY_GAS_LIMIT, GasPrice.fromString(DEFAULT_GAS_PRICE));

  let txRaw: TxRaw;
  try {
    txRaw = await client.sign(address, [msg], fee, 'COIN Presale purchase');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : '';
    if (errMsg.includes('WebSocket') || errMsg.includes('socket') || errMsg.includes('connect')) {
      clearSigningClientCache();
      const freshClient = await getCachedCosmWasmClient(wallet);
      txRaw = await freshClient.sign(address, [msg], fee, 'COIN Presale purchase');
    } else {
      throw err;
    }
  }

  onStep?.('broadcasting');

  const txBytes = TxRaw.encode(txRaw).finish();

  try {
    const result = await client.broadcastTx(txBytes);
    onStep?.('confirming');

    if (result.code !== 0) {
      throw new Error(result.rawLog || `Transaction failed with code ${result.code}`);
    }

    return {
      txHash: result.transactionHash,
      height: result.height,
    };
  } catch (err) {
    // CosmJS throws on timeout: "Transaction with ID XXXX was submitted but was not yet found on the chain"
    const errMsg = err instanceof Error ? err.message : String(err);
    const hashMatch = errMsg.match(/Transaction with ID ([A-Fa-f0-9]+)/i);
    if (hashMatch?.[1]) {
      // Transaction was broadcast but confirmation timed out — it likely succeeded
      return {
        txHash: hashMatch[1],
        timedOut: true,
      };
    }
    throw err;
  }
}

// ---- Presale Admin: Update Config ----

export async function signPresaleUpdateConfig(
  wallet: DirectSecp256k1HdWallet,
  address: string,
  config: {
    rate_num?: number;
    rate_denom?: number;
    enabled?: boolean;
    max_per_tx?: string;
  },
): Promise<{ txHash: string; height: number }> {
  const client = await getCosmWasmClient(wallet);

  const msg: Record<string, unknown> = {};
  if (config.rate_num !== undefined) msg.rate_num = config.rate_num;
  if (config.rate_denom !== undefined) msg.rate_denom = config.rate_denom;
  if (config.enabled !== undefined) msg.enabled = config.enabled;
  if (config.max_per_tx !== undefined) msg.max_per_tx = config.max_per_tx;

  const result = await client.execute(
    address,
    PRESALE_CONTRACT,
    { update_config: msg },
    'auto',
    'Presale config update',
  );

  return {
    txHash: result.transactionHash,
    height: result.height,
  };
}

// ---- Presale Admin: Withdraw AXM ----

export async function signPresaleWithdrawAxm(
  wallet: DirectSecp256k1HdWallet,
  address: string,
  microAmount: string,
): Promise<{ txHash: string; height: number }> {
  const client = await getCosmWasmClient(wallet);

  const result = await client.execute(
    address,
    PRESALE_CONTRACT,
    { withdraw_axm: { amount: microAmount } },
    'auto',
    'Presale AXM withdraw',
  );

  return {
    txHash: result.transactionHash,
    height: result.height,
  };
}

// ---- Presale Admin: Withdraw COIN ----

export async function signPresaleWithdrawCoin(
  wallet: DirectSecp256k1HdWallet,
  address: string,
  microAmount: string,
): Promise<{ txHash: string; height: number }> {
  const client = await getCosmWasmClient(wallet);

  const result = await client.execute(
    address,
    PRESALE_CONTRACT,
    { withdraw_coin: { amount: microAmount } },
    'auto',
    'Presale COIN withdraw',
  );

  return {
    txHash: result.transactionHash,
    height: result.height,
  };
}
