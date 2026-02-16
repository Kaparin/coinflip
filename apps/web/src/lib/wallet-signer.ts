/**
 * Web Wallet Signer — client-side transaction signing for Axiome chain.
 *
 * All signing happens in the browser using CosmJS.
 * No private keys or mnemonics are ever sent to the server.
 */

import type { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { SigningStargateClient, GasPrice } from '@cosmjs/stargate';
import { DEFAULT_GAS_PRICE } from '@coinflip/shared/chain';
import { COINFLIP_CONTRACT, LAUNCH_CW20_CONTRACT } from '@/lib/constants';
import { toMicroLaunch } from '@coinflip/shared/constants';
import { Registry } from '@cosmjs/proto-signing';
import { defaultRegistryTypes } from '@cosmjs/stargate';
import { MsgExec, MsgGrant } from 'cosmjs-types/cosmos/authz/v1beta1/tx';
import { GenericAuthorization } from 'cosmjs-types/cosmos/authz/v1beta1/authz';

/**
 * Get the RPC URL for signing.
 * In the browser, we proxy through Next.js to avoid CORS issues.
 * The proxy route `/chain-rpc/...` is set up in next.config.ts.
 */
function getRpcUrl(): string {
  if (typeof window !== 'undefined') {
    // In browser: use the Next.js proxy to avoid CORS
    return `${window.location.origin}/chain-rpc`;
  }
  return 'http://49.13.3.227:26657';
}

// ---- Signing Clients ----

/** Create a SigningCosmWasmClient for CW20 operations (deposits). */
export async function getCosmWasmClient(
  wallet: DirectSecp256k1HdWallet,
): Promise<SigningCosmWasmClient> {
  const rpcUrl = getRpcUrl();
  return SigningCosmWasmClient.connectWithSigner(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(DEFAULT_GAS_PRICE),
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

// ---- Deposit (CW20 Send) ----

export interface DepositResult {
  txHash: string;
  height: number;
}

/**
 * Deposit LAUNCH tokens into the CoinFlip vault.
 * Signs a CW20 Send transaction client-side.
 *
 * @param wallet - CosmJS wallet instance
 * @param address - Sender's axm1... address
 * @param humanAmount - Amount in human-readable LAUNCH (e.g. 100)
 */
export async function signDeposit(
  wallet: DirectSecp256k1HdWallet,
  address: string,
  humanAmount: number,
): Promise<DepositResult> {
  const client = await getCosmWasmClient(wallet);
  const microAmount = toMicroLaunch(humanAmount);

  const sendMsg = {
    send: {
      contract: COINFLIP_CONTRACT,
      amount: microAmount,
      msg: btoa(JSON.stringify({ deposit: {} })),
    },
  };

  const result = await client.execute(
    address,
    LAUNCH_CW20_CONTRACT,
    sendMsg,
    'auto',
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
