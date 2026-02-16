/**
 * Test withdraw from vault — Yang withdraws his winnings.
 */
import { resolve } from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: resolve(import.meta.dirname!, '../.env') });

import { DirectSecp256k1HdWallet, Registry } from '@cosmjs/proto-signing';
import { SigningStargateClient, GasPrice, StdFee } from '@cosmjs/stargate';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
import { MsgExec } from 'cosmjs-types/cosmos/authz/v1beta1/tx';
import { toUtf8 } from '@cosmjs/encoding';
import { stringToPath } from '@cosmjs/crypto';

const HD_PATH = stringToPath("m/44'/546'/0'/0/0");
const RPC = process.env.AXIOME_RPC_URL!;
const REST = process.env.AXIOME_REST_URL!;
const CONTRACT = process.env.COINFLIP_CONTRACT_ADDR!;
const CW20 = process.env.LAUNCH_CW20_ADDR!;
const RELAYER_MNEMONIC = process.env.RELAYER_MNEMONIC!;
const YANG = 'axm1djudvj9cdyt96t6a0ayqq0d75k8xztvkcm30xq';

const WITHDRAW_AMOUNT = '100000000'; // 100M LAUNCH

async function getVaultBalance(address: string): Promise<{ available: string; locked: string }> {
  const q = btoa(JSON.stringify({ vault_balance: { address } }));
  const res = await fetch(`${REST}/cosmwasm/wasm/v1/contract/${CONTRACT}/smart/${q}`);
  return ((await res.json()) as any).data;
}

async function getCW20Balance(address: string): Promise<string> {
  const q = btoa(JSON.stringify({ balance: { address } }));
  const res = await fetch(`${REST}/cosmwasm/wasm/v1/contract/${CW20}/smart/${q}`);
  return ((await res.json()) as any).data.balance;
}

async function main() {
  console.log('=== Test Withdraw ===\n');

  // Before
  const vaultBefore = await getVaultBalance(YANG);
  const cw20Before = await getCW20Balance(YANG);
  console.log(`BEFORE:`);
  console.log(`  Vault: available=${vaultBefore.available}, locked=${vaultBefore.locked}`);
  console.log(`  CW20 wallet: ${cw20Before}`);

  // Withdraw via relayer (authz)
  console.log(`\nWithdrawing ${WITHDRAW_AMOUNT} LAUNCH from vault...`);

  const registry = new Registry();
  registry.register('/cosmos.authz.v1beta1.MsgExec', MsgExec);
  registry.register('/cosmwasm.wasm.v1.MsgExecuteContract', MsgExecuteContract);

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(RELAYER_MNEMONIC, {
    prefix: 'axm',
    hdPaths: [HD_PATH],
  });
  const [account] = await wallet.getAccounts();

  const client = await SigningStargateClient.connectWithSigner(RPC, wallet, {
    registry,
    gasPrice: GasPrice.fromString('0.025uaxm'),
  });

  const withdrawMsg = { withdraw: { amount: WITHDRAW_AMOUNT } };

  const innerMsg: MsgExecuteContract = {
    sender: YANG,
    contract: CONTRACT,
    msg: toUtf8(JSON.stringify(withdrawMsg)),
    funds: [],
  };

  const execMsg: MsgExec = {
    grantee: account!.address,
    msgs: [{
      typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
      value: MsgExecuteContract.encode(innerMsg).finish(),
    }],
  };

  const fee: StdFee = {
    amount: [{ denom: 'uaxm', amount: '12500' }],
    gas: '500000',
  };

  const result = await client.signAndBroadcast(account!.address, [{
    typeUrl: '/cosmos.authz.v1beta1.MsgExec',
    value: execMsg,
  }], fee, 'CoinFlip withdraw');

  if (result.code !== 0) {
    console.error(`FAILED: code=${result.code}, log=${result.rawLog}`);
    client.disconnect();
    return;
  }

  console.log(`SUCCESS: txHash=${result.transactionHash}, height=${result.height}`);

  // After
  const vaultAfter = await getVaultBalance(YANG);
  const cw20After = await getCW20Balance(YANG);
  console.log(`\nAFTER:`);
  console.log(`  Vault: available=${vaultAfter.available}, locked=${vaultAfter.locked}`);
  console.log(`  CW20 wallet: ${cw20After}`);

  const diff = BigInt(cw20After) - BigInt(cw20Before);
  console.log(`\n  CW20 gained: ${diff} LAUNCH`);

  client.disconnect();
}

main().catch(console.error);
