/**
 * Update CoinFlip contract configuration on chain.
 *
 * Usage:
 *   cd scripts && pnpm tsx update-config.ts
 *
 * This sets:
 *   - max_open_per_user = 1000 (effectively no meaningful limit)
 *   - max_daily_amount_per_user = 999_999_999_999_999 (effectively unlimited)
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

  // Build UpdateConfig message
  const updateMsg = {
    update_config: {
      max_open_per_user: 1000,
      max_daily_amount_per_user: '999999999999999999',
    },
  };

  console.log('\nSending UpdateConfig:', JSON.stringify(updateMsg, null, 2));

  // Execute directly (admin is the relayer/deployer wallet)
  const result = await client.execute(
    adminAddr,
    CONTRACT,
    updateMsg,
    'auto',
    'Update max_open_per_user to 1000, remove daily limit',
  );

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
