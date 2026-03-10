/**
 * Merge Treasury → Relayer: migrate contract treasury to relayer address.
 *
 * Steps:
 * 1. admin_withdraw_user — pull old treasury vault balance to relayer wallet
 * 2. update_config — set treasury = relayer address
 * 3. deposit — re-deposit the withdrawn AXM into vault_balance[relayer]
 *
 * Usage:
 *   npx tsx scripts/merge-treasury-relayer.ts
 *
 * Reads config from ../.env
 */

import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { GasPrice, coin } from '@cosmjs/stargate';
import { stringToPath } from '@cosmjs/crypto';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';

dotenv.config({ path: resolve(import.meta.dirname!, '../.env') });

const RPC_URL = process.env.AXIOME_RPC_URL!;
const MNEMONIC = process.env.RELAYER_MNEMONIC!;
const CONTRACT = process.env.COINFLIP_NATIVE_CONTRACT_ADDR || process.env.NEXT_PUBLIC_COINFLIP_NATIVE_CONTRACT!;
const OLD_TREASURY = 'axm1g2akr2kxul2kpummprad7luhue6hpd9u48jaud';
const DENOM = 'uaxm';
const HD_PATH = "m/44'/546'/0'/0/0";
const GAS = GasPrice.fromString(`0.025${DENOM}`);

/** Sign, broadcast via sync, poll for result manually (avoids 60s timeout issue) */
async function execContract(
  client: SigningCosmWasmClient,
  sender: string,
  contract: string,
  msg: Record<string, unknown>,
  memo: string,
  funds?: { denom: string; amount: string }[],
): Promise<string> {
  const txRaw = await client.sign(
    sender,
    [{
      typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
      value: {
        sender,
        contract,
        msg: new TextEncoder().encode(JSON.stringify(msg)),
        funds: funds ?? [],
      },
    }],
    { amount: [{ denom: DENOM, amount: '12500' }], gas: '500000' },
    memo,
  );
  const txBytes = TxRaw.encode(txRaw).finish();

  // broadcastTxSync — instant mempool acceptance
  const hashBytes = await client.broadcastTxSync(txBytes);
  const txHash = typeof hashBytes === 'string'
    ? hashBytes
    : Buffer.from(hashBytes).toString('hex').toUpperCase();

  console.log(`  Tx in mempool: ${txHash}`);

  // Poll for confirmation
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const res = await fetch(`${process.env.AXIOME_REST_URL || RPC_URL.replace(':26657', ':1317')}/cosmos/tx/v1beta1/txs/${txHash}`);
      if (res.ok) {
        const data = await res.json() as { tx_response?: { code?: number; raw_log?: string } };
        if (data.tx_response) {
          if (data.tx_response.code === 0) {
            return txHash;
          }
          throw new Error(`Tx failed (code ${data.tx_response.code}): ${data.tx_response.raw_log}`);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith('Tx failed')) throw err;
      // not found yet, keep polling
    }
  }
  throw new Error(`Tx ${txHash} not confirmed after 90s. Check manually.`);
}

async function main() {
  console.log('🔧 Merge Treasury → Relayer\n');

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
    prefix: 'axm',
    hdPaths: [stringToPath(HD_PATH)],
  });
  const [account] = await wallet.getAccounts();
  const relayerAddr = account!.address;

  console.log(`Relayer (new treasury): ${relayerAddr}`);
  console.log(`Old treasury:           ${OLD_TREASURY}`);
  console.log(`Contract:               ${CONTRACT}\n`);

  const client = await SigningCosmWasmClient.connectWithSigner(RPC_URL, wallet, {
    gasPrice: GAS,
  });

  // Query old treasury vault balance
  const vaultBal: { available: string; locked: string } = await client.queryContractSmart(
    CONTRACT,
    { vault_balance: { address: OLD_TREASURY } },
  );
  console.log(`Old treasury vault balance: ${vaultBal.available} uaxm (${(Number(vaultBal.available) / 1e6).toFixed(2)} AXM)`);

  if (vaultBal.locked !== '0') {
    console.error(`❌ Old treasury has locked balance (${vaultBal.locked}). Aborting.`);
    process.exit(1);
  }

  const amount = vaultBal.available;
  if (amount === '0') {
    console.log('Old treasury vault is empty — skipping withdraw + deposit.\n');
  } else {
    // Step 1: admin_withdraw_user
    console.log('\n📝 Step 1/3: admin_withdraw_user (old treasury → relayer wallet)...');
    const txHash1 = await execContract(client, relayerAddr, CONTRACT,
      { admin_withdraw_user: { user: OLD_TREASURY, amount } },
      'Merge treasury: withdraw old treasury balance',
    );
    console.log(`✅ Withdrawn. Tx: ${txHash1}\n`);

    // Step 3: deposit back into vault_balance[relayer]
    console.log('📝 Step 3/3: deposit (relayer wallet → vault_balance[relayer])...');
    const txHash3 = await execContract(client, relayerAddr, CONTRACT,
      { deposit: {} },
      'Merge treasury: re-deposit as relayer',
      [coin(amount, DENOM)],
    );
    console.log(`✅ Deposited. Tx: ${txHash3}\n`);
  }

  // Step 2: update_config — set treasury = relayer
  console.log('📝 Step 2/3: update_config (treasury → relayer)...');
  const txHash2 = await execContract(client, relayerAddr, CONTRACT,
    {
      update_config: {
        treasury: relayerAddr,
        commission_bps: null,
        min_bet: null,
        reveal_timeout_secs: null,
        max_open_per_user: null,
        max_daily_amount_per_user: null,
        bet_ttl_secs: null,
      },
    },
    'Merge treasury: set treasury = relayer',
  );
  console.log(`✅ Config updated. Tx: ${txHash2}\n`);

  // Verify
  const newConfig = await client.queryContractSmart(CONTRACT, { config: {} });
  console.log('New config:', JSON.stringify(newConfig, null, 2));

  const newBal: { available: string; locked: string } = await client.queryContractSmart(
    CONTRACT,
    { vault_balance: { address: relayerAddr } },
  );
  console.log(`\nRelayer vault balance: ${newBal.available} uaxm (${(Number(newBal.available) / 1e6).toFixed(2)} AXM)`);

  console.log('\n✅ Migration complete! Treasury is now the relayer wallet.');
  client.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
