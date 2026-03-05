/**
 * Recover LAUNCH tokens from old CoinFlip contract.
 *
 * 1. Migrate contract to use LAUNCH as token_cw20
 * 2. AdminSweep → sends all LAUNCH to treasury
 */

import { resolve } from "node:path";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { stringToPath } from "@cosmjs/crypto";
import dotenv from "dotenv";
dotenv.config({ path: resolve(import.meta.dirname!, "../.env") });

const RPC_URL = process.env.AXIOME_RPC_URL!;
const REST_URL = process.env.AXIOME_REST_URL!;
const MNEMONIC = process.env.RELAYER_MNEMONIC!;

const OLD_CONTRACT = "axm1mr5l8e49kav3mw026llr8qacuqfq0yeye8zuqcwr2866xkeufptssftk9y";
const LAUNCH_CW20 = "axm1zvjnc08uy0zz43m0nlh9f5aetpa3amn6a034yqvmsgvzshk9clds375xx9";
const TREASURY = "axm1g2akr2kxul2kpummprad7luhue6hpd9u48jaud";

const GAS_PRICE = GasPrice.fromString("0.025uaxm");
const HD_PATH = stringToPath("m/44'/546'/0'/0/0");

async function queryBal(token: string, addr: string): Promise<string> {
  const q = btoa(JSON.stringify({ balance: { address: addr } }));
  const r = await fetch(`${REST_URL}/cosmwasm/wasm/v1/contract/${token}/smart/${q}`);
  return ((await r.json()) as any).data.balance;
}

function fmt(micro: string): string {
  return (Number(micro) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

async function main() {
  console.log("=== LAUNCH Token Recovery ===");

  const balBefore = await queryBal(LAUNCH_CW20, OLD_CONTRACT);
  console.log(`Contract LAUNCH balance: ${fmt(balBefore)} LAUNCH (${balBefore} micro)`);

  if (balBefore === "0") {
    console.log("No LAUNCH to recover.");
    return;
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
    prefix: "axm",
    hdPaths: [HD_PATH],
  });
  const [account] = await wallet.getAccounts();
  console.log(`Admin: ${account.address}`);

  const client = await SigningCosmWasmClient.connectWithSigner(RPC_URL, wallet, {
    gasPrice: GAS_PRICE,
  });

  const info = await client.getContract(OLD_CONTRACT);
  console.log(`Code ID: ${info.codeId}`);

  // Step 1: Migrate to LAUNCH token
  console.log("\nStep 1: Migrate contract to use LAUNCH as token_cw20...");
  try {
    const r1 = await client.migrate(
      account.address,
      OLD_CONTRACT,
      info.codeId,
      { token_cw20: LAUNCH_CW20 },
      "auto",
    );
    console.log(`  Tx: ${r1.transactionHash}`);
  } catch (err: any) {
    if (err.txId) {
      console.log(`  Tx submitted but timed out: ${err.txId}`);
      console.log("  Waiting 15s for confirmation...");
      await new Promise((r) => setTimeout(r, 15000));
    } else {
      throw err;
    }
  }

  // Verify migration
  const config = await client.queryContractSmart(OLD_CONTRACT, { config: {} });
  console.log(`  token_cw20 now: ${config.token_cw20}`);

  if (config.token_cw20 !== LAUNCH_CW20) {
    throw new Error(`Migration failed — token_cw20 is ${config.token_cw20}, expected ${LAUNCH_CW20}`);
  }

  // Step 2: AdminSweep
  console.log("\nStep 2: AdminSweep LAUNCH to treasury...");
  try {
    const r2 = await client.execute(
      account.address,
      OLD_CONTRACT,
      { admin_sweep: { recipient: TREASURY } },
      "auto",
    );
    console.log(`  Tx: ${r2.transactionHash}`);
  } catch (err: any) {
    if (err.txId) {
      console.log(`  Tx submitted but timed out: ${err.txId}`);
      console.log("  Waiting 15s for confirmation...");
      await new Promise((r) => setTimeout(r, 15000));
    } else {
      throw err;
    }
  }

  // Final balances
  const balAfter = await queryBal(LAUNCH_CW20, OLD_CONTRACT);
  const treasuryBal = await queryBal(LAUNCH_CW20, TREASURY);
  console.log(`\n=== Results ===`);
  console.log(`Contract LAUNCH: ${fmt(balAfter)} (was ${fmt(balBefore)})`);
  console.log(`Treasury LAUNCH: ${fmt(treasuryBal)}`);
  console.log("Done!");

  client.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
