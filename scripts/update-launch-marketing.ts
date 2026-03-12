/**
 * Update LAUNCH CW20 token marketing via custom migrate contract.
 *
 * Flow:
 *   1. Upload cw20-migrate-fix wasm → new code_id
 *   2. Migrate LAUNCH contract to new code — sets project URL + marketing addr + description
 *   3. Verify
 *
 * The Axiome explorer reads the `project` field as a URL to an extended JSON
 * (same format as CHAPA: description, socials, website, etc.)
 *
 * Before running: upload launch-extended.json to a public URL and set LAUNCH_EXTENDED_URL.
 *
 * Usage: LAUNCH_EXTENDED_URL=https://... npx tsx scripts/update-launch-marketing.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { stringToPath } from "@cosmjs/crypto";
import dotenv from "dotenv";
dotenv.config({ path: resolve(import.meta.dirname!, "../.env") });

const RPC_URL = process.env.AXIOME_RPC_URL!;
const REST_URL = process.env.AXIOME_REST_URL!;
const MNEMONIC = process.env.LAUNCH_ADMIN_MNEMONIC!;

const LAUNCH_CW20 = "axm1zvjnc08uy0zz43m0nlh9f5aetpa3amn6a034yqvmsgvzshk9clds375xx9";
const GAS_PRICE = GasPrice.fromString("0.025uaxm");
const HD_PATH = stringToPath("m/44'/546'/0'/0/0");

// URL to the hosted launch-extended.json (served from Next.js public/)
const EXTENDED_URL = process.env.LAUNCH_EXTENDED_URL
  || "https://coinflip.axiome-launch.com/cw20/extended/launch.json";

// Short on-chain description (fallback for clients that don't fetch extended JSON)
const ONCHAIN_DESCRIPTION = [
  "LAUNCH — Ecosystem Revenue Token of Axiome Launch Suite.",
  "Stake LAUNCH to earn AXM from every ecosystem project.",
  "20% of treasury distributed to stakers. No lock period.",
  "",
  "LAUNCH — токен дохода экосистемы Axiome Launch Suite.",
  "Стейкайте LAUNCH и получайте AXM от каждого проекта.",
  "20% казны — стейкерам. Без блокировки.",
].join("\n");

const WASM_PATH = resolve(
  import.meta.dirname!,
  "../contracts/cw20-migrate-fix/target/wasm32-unknown-unknown/release/cw20_migrate_fix_opt.wasm",
);

async function main() {
  console.log("=== Update LAUNCH Token Marketing ===\n");

  // Query current state
  const q = btoa(JSON.stringify({ marketing_info: {} }));
  const res = await fetch(`${REST_URL}/cosmwasm/wasm/v1/contract/${LAUNCH_CW20}/smart/${q}`);
  const current = (await res.json() as any).data;
  console.log("Current description:", current.description?.slice(0, 80));
  console.log("Current marketing:", current.marketing);
  console.log("Current project:", current.project);
  console.log();

  // Connect wallet
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
    prefix: "axm",
    hdPaths: [HD_PATH],
  });
  const [account] = await wallet.getAccounts();
  console.log(`Sender (admin): ${account.address}`);
  console.log(`Extended URL: ${EXTENDED_URL}\n`);

  const client = await SigningCosmWasmClient.connectWithSigner(RPC_URL, wallet, {
    gasPrice: GAS_PRICE,
  });

  // Step 1: Upload custom CW20 wasm with migrate handler
  console.log("Step 1: Uploading cw20-migrate-fix wasm...");
  const wasmCode = readFileSync(WASM_PATH);
  console.log(`  Wasm size: ${(wasmCode.length / 1024).toFixed(0)} KB`);
  const uploadResult = await client.upload(account.address, wasmCode, "auto", "cw20-migrate-fix for marketing update");
  const newCodeId = uploadResult.codeId;
  console.log(`  Uploaded! Code ID: ${newCodeId}`);
  console.log(`  Tx: ${uploadResult.transactionHash}\n`);

  // Step 2: Migrate LAUNCH to new code — writes project URL, description, marketing addr
  console.log("Step 2: Migrating LAUNCH with marketing data...");
  const migrateResult = await client.migrate(
    account.address,
    LAUNCH_CW20,
    newCodeId,
    {
      description: ONCHAIN_DESCRIPTION,
      project: EXTENDED_URL,
      marketing: account.address,
    },
    "auto",
    "Update LAUNCH marketing info via custom migrate",
  );
  console.log(`  Migrate Tx: ${migrateResult.transactionHash}\n`);

  // Wait for state to propagate
  await new Promise((r) => setTimeout(r, 5000));

  // Verify
  const res2 = await fetch(`${REST_URL}/cosmwasm/wasm/v1/contract/${LAUNCH_CW20}/smart/${q}`);
  const updated = (await res2.json() as any).data;
  console.log("=== Updated State ===");
  console.log("Description:", updated.description?.slice(0, 100));
  console.log("Marketing:", updated.marketing);
  console.log("Project:", updated.project);
  console.log(`\n✅ Done! LAUNCH marketing info updated.`);
  console.log(`Now the explorer will fetch extended info from: ${EXTENDED_URL}`);

  client.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
