#!/usr/bin/env npx tsx
/**
 * Treasury Authz & Feegrant Setup Script
 *
 * This script sets up the required on-chain grants for production:
 *
 * 1. Treasury → Relayer: Authz grant for CoinFlip contract
 *    (allows relayer to execute withdraw on behalf of treasury)
 *
 * 2. Treasury → Relayer: Authz grant for CW20 token contract
 *    (allows relayer to execute transfer on behalf of treasury)
 *
 * 3. Treasury → Relayer: Feegrant allowance
 *    (relayer submits MsgExec, treasury pays gas fees)
 *
 * Usage:
 *   npx tsx scripts/setup-treasury-grants.ts
 *
 * Required env vars (from .env):
 *   - TREASURY_MNEMONIC (treasury wallet mnemonic — NOT stored in .env normally)
 *   - RELAYER_ADDRESS
 *   - COINFLIP_CONTRACT_ADDR
 *   - LAUNCH_CW20_ADDR
 *   - AXIOME_RPC_URL
 *   - AXIOME_CHAIN_ID
 *
 * This script is safe to re-run: grants are idempotent (replaced if already exist).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { DirectSecp256k1HdWallet, Registry } from '@cosmjs/proto-signing';
import { SigningStargateClient, GasPrice } from '@cosmjs/stargate';
import { stringToPath } from '@cosmjs/crypto';
import { MsgGrant } from 'cosmjs-types/cosmos/authz/v1beta1/tx';
import { GenericAuthorization } from 'cosmjs-types/cosmos/authz/v1beta1/authz';
import { MsgGrantAllowance } from 'cosmjs-types/cosmos/feegrant/v1beta1/tx';
import { BasicAllowance } from 'cosmjs-types/cosmos/feegrant/v1beta1/feegrant';
import { Coin } from 'cosmjs-types/cosmos/base/v1beta1/coin';
import { Timestamp } from 'cosmjs-types/google/protobuf/timestamp';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

// ─── Config ──────────────────────────────────────────────────────

const AXIOME_PREFIX = 'axm';
const HD_PATH = "m/44'/546'/0'/0/0";
const FEE_DENOM = 'uaxm';

const REQUIRED_VARS = [
  'TREASURY_MNEMONIC',
  'RELAYER_ADDRESS',
  'COINFLIP_CONTRACT_ADDR',
  'LAUNCH_CW20_ADDR',
  'AXIOME_RPC_URL',
  'AXIOME_CHAIN_ID',
];

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.error(`❌ Missing env var: ${key}`);
    process.exit(1);
  }
  return val;
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('🔧 Treasury Grant Setup Script\n');

  // Validate env
  for (const key of REQUIRED_VARS) {
    getEnv(key);
  }

  const treasuryMnemonic = getEnv('TREASURY_MNEMONIC');
  const relayerAddress = getEnv('RELAYER_ADDRESS');
  const coinflipContract = getEnv('COINFLIP_CONTRACT_ADDR');
  const cw20Contract = getEnv('LAUNCH_CW20_ADDR');
  const rpcUrl = getEnv('AXIOME_RPC_URL');
  const chainId = getEnv('AXIOME_CHAIN_ID');

  // Create wallet from treasury mnemonic
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(treasuryMnemonic, {
    prefix: AXIOME_PREFIX,
    hdPaths: [stringToPath(HD_PATH)],
  });

  const [account] = await wallet.getAccounts();
  const treasuryAddress = account!.address;

  console.log(`Treasury address: ${treasuryAddress}`);
  console.log(`Relayer address:  ${relayerAddress}`);
  console.log(`CoinFlip contract: ${coinflipContract}`);
  console.log(`CW20 contract:    ${cw20Contract}`);
  console.log(`Chain ID:         ${chainId}`);
  console.log(`RPC:              ${rpcUrl}\n`);

  // Create signing client
  const registry = new Registry();
  registry.register('/cosmos.authz.v1beta1.MsgGrant', MsgGrant);
  registry.register('/cosmos.feegrant.v1beta1.MsgGrantAllowance', MsgGrantAllowance);

  const client = await SigningStargateClient.connectWithSigner(rpcUrl, wallet, {
    registry,
    gasPrice: GasPrice.fromString(`0.025${FEE_DENOM}`),
  });

  const balance = await client.getBalance(treasuryAddress, FEE_DENOM);
  console.log(`Treasury balance: ${balance.amount} ${FEE_DENOM}\n`);

  if (BigInt(balance.amount) < 100_000n) {
    console.error('❌ Insufficient balance for gas fees. Need at least 100,000 uaxm.');
    process.exit(1);
  }

  // Grant expiration: 1 year from now
  const expirationDate = new Date();
  expirationDate.setFullYear(expirationDate.getFullYear() + 1);
  const expiration = {
    seconds: BigInt(Math.floor(expirationDate.getTime() / 1000)),
    nanos: 0,
  };

  // ─── Grant 1: Authz for MsgExecuteContract (covers BOTH contracts) ───
  console.log('📝 Step 1/3: Granting Authz (MsgExecuteContract) to relayer...');

  const authzMsg = {
    typeUrl: '/cosmos.authz.v1beta1.MsgGrant',
    value: MsgGrant.fromPartial({
      granter: treasuryAddress,
      grantee: relayerAddress,
      grant: {
        authorization: {
          typeUrl: '/cosmos.authz.v1beta1.GenericAuthorization',
          value: GenericAuthorization.encode(
            GenericAuthorization.fromPartial({
              msg: '/cosmwasm.wasm.v1.MsgExecuteContract',
            }),
          ).finish(),
        },
        expiration,
      },
    }),
  };

  try {
    const result = await client.signAndBroadcast(treasuryAddress, [authzMsg], 'auto', 'CoinFlip treasury authz grant');
    if (result.code !== 0) {
      console.error(`❌ Authz grant failed: ${result.rawLog}`);
      process.exit(1);
    }
    console.log(`✅ Authz granted. Tx: ${result.transactionHash}\n`);
  } catch (err) {
    console.error('❌ Failed to broadcast authz grant:', err);
    process.exit(1);
  }

  // ─── Grant 2: Feegrant (treasury pays gas for relayer's MsgExec) ───
  console.log('📝 Step 2/3: Granting Feegrant to relayer...');

  const feegrantMsg = {
    typeUrl: '/cosmos.feegrant.v1beta1.MsgGrantAllowance',
    value: MsgGrantAllowance.fromPartial({
      granter: treasuryAddress,
      grantee: relayerAddress,
      allowance: {
        typeUrl: '/cosmos.feegrant.v1beta1.BasicAllowance',
        value: BasicAllowance.encode(
          BasicAllowance.fromPartial({
            spendLimit: [
              Coin.fromPartial({ denom: FEE_DENOM, amount: '10000000' }), // 10 AXM
            ],
            expiration: Timestamp.fromPartial(expiration),
          }),
        ).finish(),
      },
    }),
  };

  try {
    const result = await client.signAndBroadcast(treasuryAddress, [feegrantMsg], 'auto', 'CoinFlip treasury feegrant');
    if (result.code !== 0) {
      console.error(`❌ Feegrant failed: ${result.rawLog}`);
      process.exit(1);
    }
    console.log(`✅ Feegrant granted. Tx: ${result.transactionHash}\n`);
  } catch (err) {
    console.error('❌ Failed to broadcast feegrant:', err);
    process.exit(1);
  }

  // ─── Verify grants ───
  console.log('📝 Step 3/3: Verifying grants...\n');

  const restUrl = process.env.AXIOME_REST_URL || rpcUrl.replace(':26657', ':1317');

  try {
    const authzRes = await fetch(
      `${restUrl}/cosmos/authz/v1beta1/grants?granter=${treasuryAddress}&grantee=${relayerAddress}&msg_type_url=/cosmwasm.wasm.v1.MsgExecuteContract`,
    );
    if (authzRes.ok) {
      const data = await authzRes.json() as { grants?: unknown[] };
      console.log(`  Authz grants found: ${data.grants?.length ?? 0}`);
    }
  } catch {
    console.warn('  ⚠️ Could not verify authz grants (REST endpoint unreachable)');
  }

  try {
    const feeRes = await fetch(
      `${restUrl}/cosmos/feegrant/v1beta1/allowance/${treasuryAddress}/${relayerAddress}`,
    );
    console.log(`  Feegrant active: ${feeRes.ok}`);
  } catch {
    console.warn('  ⚠️ Could not verify feegrant (REST endpoint unreachable)');
  }

  console.log('\n✅ Treasury setup complete!\n');
  console.log('Summary:');
  console.log(`  - Authz: ${treasuryAddress} → ${relayerAddress} (MsgExecuteContract, 1 year)`);
  console.log(`  - Feegrant: ${treasuryAddress} → ${relayerAddress} (10 AXM limit, 1 year)`);
  console.log(`\nThe relayer can now execute CoinFlip and CW20 actions on behalf of the treasury.`);
  console.log('Re-run this script annually to renew the grants.\n');

  client.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
