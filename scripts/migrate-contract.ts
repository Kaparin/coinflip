/**
 * Migrate CoinFlip PvP Vault contract to new code.
 *
 * Usage:
 *   cd scripts && npx tsx migrate-contract.ts
 *
 * Steps:
 *   1. Upload new WASM → get new CODE_ID
 *   2. Migrate existing contract to new CODE_ID
 *   3. Verify config after migration
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
const MNEMONIC = process.env.RELAYER_MNEMONIC!;
const CONTRACT_ADDR = process.env.COINFLIP_CONTRACT_ADDR!;

const WASM_PATH = resolve(
  import.meta.dirname!,
  "../contracts/coinflip-pvp-vault/artifacts/coinflip_pvp_vault.wasm",
);

const GAS_PRICE = GasPrice.fromString("0.025uaxm");
const HD_PATH = stringToPath("m/44'/546'/0'/0/0");

function log(msg: string) {
  console.log(`[migrate] ${msg}`);
}

async function main() {
  for (const [name, val] of Object.entries({
    AXIOME_RPC_URL: RPC_URL,
    RELAYER_MNEMONIC: MNEMONIC,
    COINFLIP_CONTRACT_ADDR: CONTRACT_ADDR,
  })) {
    if (!val) throw new Error(`Missing env variable: ${name}`);
  }

  log(`RPC: ${RPC_URL}`);
  log(`Contract: ${CONTRACT_ADDR}`);

  // 1. Create wallet
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
    prefix: "axm",
    hdPaths: [HD_PATH],
  });
  const [account] = await wallet.getAccounts();
  log(`Admin address: ${account.address}`);

  // 2. Connect
  const client = await SigningCosmWasmClient.connectWithSigner(RPC_URL, wallet, {
    gasPrice: GAS_PRICE,
  });

  const balance = await client.getBalance(account.address, "uaxm");
  log(`Balance: ${balance.amount} uaxm`);

  // 3. Query current contract info
  try {
    const info = await client.queryContractSmart(CONTRACT_ADDR, { config: {} });
    log(`Current config admin: ${info.admin}`);
  } catch (e) {
    log(`Warning: could not query current config: ${e}`);
  }

  // 4. Upload new WASM (skip if CODE_ID already known)
  const existingCodeId = process.env.MIGRATE_CODE_ID ? Number(process.env.MIGRATE_CODE_ID) : null;

  let codeId: number;
  if (existingCodeId) {
    log(`Using existing Code ID: ${existingCodeId} (from MIGRATE_CODE_ID env)`);
    codeId = existingCodeId;
  } else {
    log(`Uploading WASM from: ${WASM_PATH}`);
    const wasm = readFileSync(WASM_PATH);
    log(`WASM size: ${(wasm.length / 1024).toFixed(1)} KB`);
    const uploadResult = await client.upload(account.address, wasm, 1.5, "coinflip-pvp-vault v0.4.0");
    log(`Code stored! Code ID: ${uploadResult.codeId}`);
    log(`  Tx hash: ${uploadResult.transactionHash}`);
    codeId = uploadResult.codeId;
  }

  // 5. Migrate contract
  log(`Migrating contract to code ID ${codeId}...`);
  const migrateResult = await client.migrate(
    account.address,
    CONTRACT_ADDR,
    codeId,
    {}, // MigrateMsg is empty
    "auto",
    "Migrate to v0.4.0: accept_and_reveal",
  );
  log(`Contract migrated!`);
  log(`  Tx hash: ${migrateResult.transactionHash}`);
  log(`  Gas used: ${migrateResult.gasUsed}`);

  // 6. Verify after migration
  log("Verifying: querying contract config...");
  const config = await client.queryContractSmart(CONTRACT_ADDR, { config: {} });
  log(`  Config: ${JSON.stringify(config, null, 2)}`);

  log("=== Migration complete! ===");
  log(`New Code ID: ${codeId}`);

  return { codeId };
}

main()
  .then((result) => {
    console.log("\nMigration result:", result);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nMigration failed:", err);
    process.exit(1);
  });
