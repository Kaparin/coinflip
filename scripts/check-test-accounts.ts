import { resolve } from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: resolve(import.meta.dirname!, '../.env') });

import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { stringToPath } from '@cosmjs/crypto';
import { StargateClient } from '@cosmjs/stargate';

const HD_PATH = stringToPath("m/44'/546'/0'/0/0");
const RPC = process.env.AXIOME_RPC_URL!;
const CW20_ADDR = process.env.LAUNCH_CW20_ADDR!;
const REST = process.env.AXIOME_REST_URL!;

interface Account {
  name: string;
  mnemonic: string;
}

const accounts: Account[] = [
  { name: 'Relayer', mnemonic: process.env.RELAYER_MNEMONIC! },
  { name: 'Yang (Player 1)', mnemonic: process.env.TEST_PLAYER_YANG_MNEMONIC! },
  { name: 'Tera (Player 2)', mnemonic: process.env.TEST_PLAYER_TERA_MNEMONIC! },
];

async function getCW20Balance(address: string): Promise<string> {
  try {
    const query = btoa(JSON.stringify({ balance: { address } }));
    const res = await fetch(
      `${REST}/cosmwasm/wasm/v1/contract/${CW20_ADDR}/smart/${query}`
    );
    if (!res.ok) return '0';
    const data = await res.json() as { data?: { balance?: string } };
    return data.data?.balance ?? '0';
  } catch {
    return '0';
  }
}

async function main() {
  console.log('=== CoinFlip Test Accounts ===\n');
  console.log(`RPC: ${RPC}`);
  console.log(`CW20 (COIN): ${CW20_ADDR}\n`);

  const client = await StargateClient.connect(RPC);

  for (const acc of accounts) {
    if (!acc.mnemonic) {
      console.log(`[${acc.name}] MNEMONIC NOT SET\n`);
      continue;
    }

    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(acc.mnemonic, {
      prefix: 'axm',
      hdPaths: [HD_PATH],
    });
    const [account] = await wallet.getAccounts();
    const address = account!.address;

    // Native balance
    const nativeBalance = await client.getBalance(address, 'uaxm');
    const axmAmount = (Number(nativeBalance.amount) / 1_000_000).toFixed(2);

    // CW20 COIN balance
    const launchBalance = await getCW20Balance(address);

    console.log(`[${acc.name}]`);
    console.log(`  Address: ${address}`);
    console.log(`  AXM:     ${axmAmount} AXM (${nativeBalance.amount} uaxm)`);
    console.log(`  COIN:    ${launchBalance}`);
    console.log();
  }

  client.disconnect();
}

main().catch(console.error);
