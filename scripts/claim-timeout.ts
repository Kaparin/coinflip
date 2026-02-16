/**
 * Claim timeout on a bet (via relayer authz on behalf of Tera).
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
const CONTRACT = process.env.COINFLIP_CONTRACT_ADDR!;
const RELAYER_MNEMONIC = process.env.RELAYER_MNEMONIC!;
const TERA = 'axm1g2akr2kxul2kpummprad7luhue6hpd9u48jaud';

async function main() {
  const betId = parseInt(process.argv[2] || '2');
  console.log(`Claiming timeout on bet #${betId} for Tera...`);

  const registry = new Registry();
  registry.register('/cosmos.authz.v1beta1.MsgExec', MsgExec);
  registry.register('/cosmwasm.wasm.v1.MsgExecuteContract', MsgExecuteContract);

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(RELAYER_MNEMONIC, {
    prefix: 'axm',
    hdPaths: [HD_PATH],
  });
  const [account] = await wallet.getAccounts();
  const relayerAddr = account!.address;

  const client = await SigningStargateClient.connectWithSigner(RPC, wallet, {
    registry,
    gasPrice: GasPrice.fromString('0.025uaxm'),
  });

  const claimMsg = { claim_timeout: { bet_id: betId } };

  const innerMsg: MsgExecuteContract = {
    sender: TERA,
    contract: CONTRACT,
    msg: toUtf8(JSON.stringify(claimMsg)),
    funds: [],
  };

  const execMsg: MsgExec = {
    grantee: relayerAddr,
    msgs: [{
      typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
      value: MsgExecuteContract.encode(innerMsg).finish(),
    }],
  };

  const msgAny = {
    typeUrl: '/cosmos.authz.v1beta1.MsgExec',
    value: execMsg,
  };

  const fee: StdFee = {
    amount: [{ denom: 'uaxm', amount: '12500' }],
    gas: '500000',
  };

  const result = await client.signAndBroadcast(relayerAddr, [msgAny], fee, 'Claim timeout');

  if (result.code !== 0) {
    console.error(`Failed: code=${result.code}, log=${result.rawLog}`);
  } else {
    console.log(`Success: txHash=${result.transactionHash}, height=${result.height}`);
  }

  client.disconnect();
}

main().catch(console.error);
