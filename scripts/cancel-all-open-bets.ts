/**
 * Emergency script: Cancel all open bets on chain for a given maker.
 *
 * Usage:
 *   cd scripts && pnpm tsx cancel-all-open-bets.ts [maker_address]
 *
 * If no address is provided, cancels ALL open bets regardless of maker.
 */

import { resolve } from 'node:path';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet, Registry } from '@cosmjs/proto-signing';
import { GasPrice, SigningStargateClient, StdFee } from '@cosmjs/stargate';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
import { MsgExec } from 'cosmjs-types/cosmos/authz/v1beta1/tx';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
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

interface ChainBet {
  id: number;
  maker: string;
  amount: string;
  status: string;
}

async function getOpenBets(): Promise<ChainBet[]> {
  const query = JSON.stringify({ open_bets: { limit: 200 } });
  const encoded = Buffer.from(query).toString('base64');
  const res = await fetch(`${REST_URL}/cosmwasm/wasm/v1/contract/${CONTRACT}/smart/${encoded}`);
  if (!res.ok) throw new Error(`Chain query failed: ${res.status}`);
  const data = (await res.json()) as { data: { bets: ChainBet[] } };
  return data.data.bets.filter(b => b.status === 'open');
}

function createRegistry(): Registry {
  const registry = new Registry();
  registry.register('/cosmos.authz.v1beta1.MsgExec', MsgExec);
  registry.register('/cosmwasm.wasm.v1.MsgExecuteContract', MsgExecuteContract);
  return registry;
}

async function main() {
  const targetMaker = process.argv[2] || null;

  console.log('Querying open bets on chain...');
  let openBets = await getOpenBets();

  if (targetMaker) {
    openBets = openBets.filter(b => b.maker === targetMaker);
    console.log(`Found ${openBets.length} open bets for maker ${targetMaker}`);
  } else {
    console.log(`Found ${openBets.length} total open bets`);
  }

  if (openBets.length === 0) {
    console.log('Nothing to cancel.');
    return;
  }

  // Setup relayer wallet
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
    prefix: 'axm',
    hdPaths: [HD_PATH],
  });
  const [account] = await wallet.getAccounts();
  const relayerAddr = account!.address;
  console.log(`Relayer address: ${relayerAddr}`);

  const registry = createRegistry();
  const client = await SigningStargateClient.connectWithSigner(RPC_URL, wallet, {
    registry,
    gasPrice: GasPrice.fromString(`0.025${FEE_DENOM}`),
  });

  // Get current sequence
  const { accountNumber, sequence: startSequence } = await client.getSequence(relayerAddr);
  let currentSequence = startSequence;
  console.log(`Starting sequence: ${currentSequence}`);

  let canceled = 0;
  let failed = 0;

  for (const bet of openBets) {
    const betId = bet.id;
    const makerAddr = bet.maker;

    console.log(`Canceling bet #${betId} (maker: ${makerAddr})...`);

    const innerMsg: MsgExecuteContract = {
      sender: makerAddr,
      contract: CONTRACT,
      msg: toUtf8(JSON.stringify({ cancel_bet: { bet_id: betId } })),
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
      amount: [{ denom: FEE_DENOM, amount: '12500' }],
      gas: '500000',
      ...(TREASURY ? { granter: TREASURY } : {}),
    };

    try {
      const txRaw = await client.sign(
        relayerAddr,
        [msgAny],
        fee,
        '',
        { accountNumber, sequence: currentSequence, chainId: CHAIN_ID },
      );
      const txBytes = TxRaw.encode(txRaw).finish();
      const txHash = await client.broadcastTxSync(txBytes);
      const hash = typeof txHash === 'string' ? txHash : Buffer.from(txHash).toString('hex').toUpperCase();
      console.log(`  ✓ Bet #${betId} cancel broadcast: ${hash} (seq=${currentSequence})`);
      currentSequence++;
      canceled++;

      // Small delay between broadcasts to avoid mempool congestion
      await new Promise(r => setTimeout(r, 500));
    } catch (err: any) {
      console.error(`  ✗ Bet #${betId} failed: ${err.message}`);
      failed++;

      // Parse expected sequence from error if mismatch
      const match = err.message?.match(/expected\s+(\d+)/);
      if (match) {
        currentSequence = parseInt(match[1], 10);
        console.log(`  → Sequence corrected to ${currentSequence}, retrying...`);
        // Retry this bet
        try {
          const txRaw = await client.sign(
            relayerAddr,
            [msgAny],
            fee,
            '',
            { accountNumber, sequence: currentSequence, chainId: CHAIN_ID },
          );
          const txBytes = TxRaw.encode(txRaw).finish();
          const txHash = await client.broadcastTxSync(txBytes);
          const hash = typeof txHash === 'string' ? txHash : Buffer.from(txHash).toString('hex').toUpperCase();
          console.log(`  ✓ Bet #${betId} cancel broadcast (retry): ${hash} (seq=${currentSequence})`);
          currentSequence++;
          canceled++;
          failed--; // Undo the failed count
        } catch (retryErr: any) {
          console.error(`  ✗ Bet #${betId} retry failed: ${retryErr.message}`);
        }
      }

      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\nDone! Canceled: ${canceled}, Failed: ${failed}`);
  console.log('Wait ~30 seconds for blocks to confirm, then verify with:');
  console.log('  pnpm tsx cancel-all-open-bets.ts');

  client.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
