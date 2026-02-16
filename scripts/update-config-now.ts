import { resolve } from 'node:path';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';
import { stringToPath } from '@cosmjs/crypto';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(import.meta.dirname!, '../.env') });

async function main() {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(process.env.RELAYER_MNEMONIC!, {
    prefix: 'axm',
    hdPaths: [stringToPath("m/44'/546'/0'/0/0")],
  });
  const [account] = await wallet.getAccounts();
  console.log('Admin:', account!.address);

  const client = await SigningCosmWasmClient.connectWithSigner(process.env.AXIOME_RPC_URL!, wallet, {
    gasPrice: GasPrice.fromString('0.025uaxm'),
  });

  const CONTRACT = process.env.COINFLIP_CONTRACT_ADDR!;

  const result = await client.execute(
    account!.address,
    CONTRACT,
    {
      update_config: {
        max_open_per_user: 255,
        max_daily_amount_per_user: '999999999999999999',
      },
    },
    'auto',
    'Set max_open=255, remove daily limit',
  );
  console.log('Tx:', result.transactionHash, 'Gas:', result.gasUsed);

  const config = await client.queryContractSmart(CONTRACT, { config: {} });
  console.log('New config:', JSON.stringify(config, null, 2));
  client.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
