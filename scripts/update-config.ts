/**
 * Update CoinFlip contract configuration on chain.
 *
 * Usage:
 *   pnpm --filter scripts tsx scripts/update-config.ts
 *
 * Updates treasury address in the contract config so that commissions
 * go to the correct TREASURY_ADDRESS (not the relayer).
 */

import { resolve } from 'node:path';
import { DirectSecp256k1HdWallet, Registry } from '@cosmjs/proto-signing';
import { SigningStargateClient, GasPrice, StdFee } from '@cosmjs/stargate';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
import { toUtf8 } from '@cosmjs/encoding';
import { stringToPath } from '@cosmjs/crypto';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(import.meta.dirname!, '../.env') });

const RPC_URL = process.env.AXIOME_RPC_URL!;
const REST_URL = process.env.AXIOME_REST_URL!;
const CHAIN_ID = process.env.AXIOME_CHAIN_ID!;
const MNEMONIC = process.env.RELAYER_MNEMONIC!;
const CONTRACT = process.env.COINFLIP_CONTRACT_ADDR!;
const TREASURY = process.env.TREASURY_ADDRESS!;
const HD_PATH = stringToPath("m/44'/546'/0'/0/0");
const FEE_DENOM = 'uaxm';

async function main() {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
    prefix: 'axm',
    hdPaths: [HD_PATH],
  });
  const [account] = await wallet.getAccounts();
  const adminAddr = account!.address;
  console.log(`Admin address: ${adminAddr}`);

  const registry = new Registry();
  registry.register('/cosmwasm.wasm.v1.MsgExecuteContract', MsgExecuteContract);

  const client = await SigningStargateClient.connectWithSigner(RPC_URL, wallet, {
    registry,
    gasPrice: GasPrice.fromString(`0.025${FEE_DENOM}`),
  });

  // Query current config
  const query = JSON.stringify({ config: {} });
  const encoded = Buffer.from(query).toString('base64');
  const configRes = await fetch(`${REST_URL}/cosmwasm/wasm/v1/contract/${CONTRACT}/smart/${encoded}`);
  const configData = (await configRes.json()) as { data: Record<string, unknown> };
  console.log('Current config:', JSON.stringify(configData.data, null, 2));

  // Build UpdateConfig message — set treasury to the correct address
  if (!TREASURY) {
    console.error('TREASURY_ADDRESS not set in .env');
    process.exit(1);
  }

  const currentTreasury = (configData.data as any)?.treasury;
  if (currentTreasury === TREASURY) {
    console.log(`\n✓ Treasury is already set to ${TREASURY} — no update needed.`);
    client.disconnect();
    return;
  }

  const updateMsg = {
    update_config: {
      treasury: TREASURY,
    },
  };

  console.log(`\nUpdating treasury: ${currentTreasury} → ${TREASURY}`);
  console.log('Sending UpdateConfig:', JSON.stringify(updateMsg, null, 2));

  // Execute directly (admin is the relayer/deployer wallet)
  const msgAny = {
    typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
    value: {
      sender: adminAddr,
      contract: CONTRACT,
      msg: toUtf8(JSON.stringify(updateMsg)),
      funds: [],
    },
  };

  const result = await client.signAndBroadcast(adminAddr, [msgAny], 'auto', `Update treasury to ${TREASURY}`);

  if (result.code !== 0) {
    console.error(`\n✗ Transaction failed! Code: ${result.code}`);
    console.error(`  Raw log: ${result.rawLog}`);
    client.disconnect();
    process.exit(1);
  }

  console.log('\n✓ Config updated!');
  console.log(`  Tx hash: ${result.transactionHash}`);
  console.log(`  Gas used: ${result.gasUsed}`);

  // Verify new config
  const verifyRes = await fetch(`${REST_URL}/cosmwasm/wasm/v1/contract/${CONTRACT}/smart/${encoded}`);
  const verifyData = (await verifyRes.json()) as { data: Record<string, unknown> };
  console.log('\nNew config:', JSON.stringify(verifyData.data, null, 2));

  client.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
