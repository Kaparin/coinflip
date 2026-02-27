/**
 * Deposit COIN tokens into the CoinFlip vault for test players.
 * Sends CW20 tokens via MsgExecuteContract (CW20 Send to contract).
 */
import { resolve } from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: resolve(import.meta.dirname!, '../.env') });

import { DirectSecp256k1HdWallet, Registry } from '@cosmjs/proto-signing';
import { SigningStargateClient, GasPrice } from '@cosmjs/stargate';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
import { toUtf8 } from '@cosmjs/encoding';
import { stringToPath } from '@cosmjs/crypto';

const HD_PATH = stringToPath("m/44'/546'/0'/0/0");
const RPC = process.env.AXIOME_RPC_URL!;
const CW20_ADDR = process.env.LAUNCH_CW20_ADDR!;
const CONTRACT_ADDR = process.env.COINFLIP_CONTRACT_ADDR!;

const DEPOSIT_AMOUNT = '1000000000'; // 1,000,000,000 COIN tokens

interface Player {
  name: string;
  mnemonic: string;
}

const players: Player[] = [
  { name: 'Yang', mnemonic: process.env.TEST_PLAYER_YANG_MNEMONIC! },
  { name: 'Tera', mnemonic: process.env.TEST_PLAYER_TERA_MNEMONIC! },
];

function createRegistry(): Registry {
  const registry = new Registry();
  registry.register('/cosmwasm.wasm.v1.MsgExecuteContract', MsgExecuteContract);
  return registry;
}

async function depositForPlayer(player: Player) {
  console.log(`\n=== Depositing for ${player.name} ===`);

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(player.mnemonic, {
    prefix: 'axm',
    hdPaths: [HD_PATH],
  });
  const [account] = await wallet.getAccounts();
  const address = account!.address;
  console.log(`Address: ${address}`);

  const client = await SigningStargateClient.connectWithSigner(RPC, wallet, {
    registry: createRegistry(),
    gasPrice: GasPrice.fromString('0.025uaxm'),
  });

  // CW20 Send message: send COIN tokens to the CoinFlip contract with deposit msg
  const sendMsg = {
    send: {
      contract: CONTRACT_ADDR,
      amount: DEPOSIT_AMOUNT,
      msg: btoa(JSON.stringify({ deposit: {} })),
    },
  };

  const msg = {
    typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
    value: MsgExecuteContract.fromPartial({
      sender: address,
      contract: CW20_ADDR,
      msg: toUtf8(JSON.stringify(sendMsg)),
      funds: [],
    }),
  };

  console.log(`Sending ${DEPOSIT_AMOUNT} COIN to vault...`);

  try {
    const result = await client.signAndBroadcast(address, [msg], 'auto', 'CoinFlip vault deposit');

    if (result.code !== 0) {
      console.error(`TX FAILED: code=${result.code}, log=${result.rawLog}`);
    } else {
      console.log(`SUCCESS: txHash=${result.transactionHash}, height=${result.height}`);
    }
  } catch (err) {
    console.error(`Error:`, err instanceof Error ? err.message : err);
  }

  client.disconnect();
}

async function main() {
  console.log('CoinFlip Vault Deposit Script');
  console.log(`CW20: ${CW20_ADDR}`);
  console.log(`Contract: ${CONTRACT_ADDR}`);
  console.log(`Amount: ${DEPOSIT_AMOUNT} COIN per player`);

  for (const player of players) {
    await depositForPlayer(player);
  }

  console.log('\nDone!');
}

main().catch(console.error);
