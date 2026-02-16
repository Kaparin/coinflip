/**
 * Grant Authz from test players to the relayer.
 * This allows the relayer to execute MsgExecuteContract on behalf of the players.
 */
import { resolve } from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: resolve(import.meta.dirname!, '../.env') });

import { DirectSecp256k1HdWallet, Registry } from '@cosmjs/proto-signing';
import { SigningStargateClient, GasPrice } from '@cosmjs/stargate';
import { stringToPath } from '@cosmjs/crypto';
import { MsgGrant } from 'cosmjs-types/cosmos/authz/v1beta1/tx';
import { GenericAuthorization } from 'cosmjs-types/cosmos/authz/v1beta1/authz';
import { Timestamp } from 'cosmjs-types/google/protobuf/timestamp';

const HD_PATH = stringToPath("m/44'/546'/0'/0/0");
const RPC = process.env.AXIOME_RPC_URL!;
const RELAYER_ADDRESS = process.env.RELAYER_ADDRESS!;

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
  registry.register('/cosmos.authz.v1beta1.MsgGrant', MsgGrant);
  return registry;
}

async function grantAuthz(player: Player) {
  console.log(`\n=== Granting Authz for ${player.name} ===`);

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(player.mnemonic, {
    prefix: 'axm',
    hdPaths: [HD_PATH],
  });
  const [account] = await wallet.getAccounts();
  const address = account!.address;
  console.log(`  Granter: ${address}`);
  console.log(`  Grantee: ${RELAYER_ADDRESS}`);

  const client = await SigningStargateClient.connectWithSigner(RPC, wallet, {
    registry: createRegistry(),
    gasPrice: GasPrice.fromString('0.025uaxm'),
  });

  // Expiration: 30 days from now
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const expirationTimestamp = Timestamp.fromPartial({
    seconds: BigInt(Math.floor(expiresAt.getTime() / 1000)),
    nanos: 0,
  });

  // GenericAuthorization for MsgExecuteContract
  const authorization = GenericAuthorization.fromPartial({
    msg: '/cosmwasm.wasm.v1.MsgExecuteContract',
  });

  const msgGrant: MsgGrant = {
    granter: address,
    grantee: RELAYER_ADDRESS,
    grant: {
      authorization: {
        typeUrl: '/cosmos.authz.v1beta1.GenericAuthorization',
        value: GenericAuthorization.encode(authorization).finish(),
      },
      expiration: expirationTimestamp,
    },
  };

  const msg = {
    typeUrl: '/cosmos.authz.v1beta1.MsgGrant',
    value: msgGrant,
  };

  console.log(`  Sending MsgGrant...`);

  try {
    const result = await client.signAndBroadcast(address, [msg], 'auto', 'CoinFlip authz grant');

    if (result.code !== 0) {
      console.error(`  TX FAILED: code=${result.code}, log=${result.rawLog}`);
    } else {
      console.log(`  SUCCESS: txHash=${result.transactionHash}, height=${result.height}`);
    }
  } catch (err) {
    console.error(`  Error:`, err instanceof Error ? err.message : err);
  }

  client.disconnect();
}

async function main() {
  console.log('CoinFlip Authz Grant Script');
  console.log(`Relayer (grantee): ${RELAYER_ADDRESS}`);

  for (const player of players) {
    await grantAuthz(player);
  }

  // Verify grants
  console.log('\n--- Verifying grants ---');
  for (const player of players) {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(player.mnemonic, {
      prefix: 'axm',
      hdPaths: [HD_PATH],
    });
    const [account] = await wallet.getAccounts();
    const address = account!.address;

    const res = await fetch(
      `${process.env.AXIOME_REST_URL}/cosmos/authz/v1beta1/grants?granter=${address}&grantee=${RELAYER_ADDRESS}`
    );
    const data = await res.json() as { grants?: Array<{ authorization: { type_url: string }; expiration: string }> };
    const grants = data.grants ?? [];
    console.log(`  ${player.name} (${address}): ${grants.length} grant(s)`);
    for (const g of grants) {
      console.log(`    - type: ${g.authorization.type_url}, expires: ${g.expiration}`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
