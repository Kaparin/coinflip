/**
 * Migrate CoinFlip PvP Vault contract to v0.5.0.
 * Uploads new wasm code and migrates, updating token_cw20 to COIN.
 *
 * Usage:
 *   pnpm --filter scripts tsx scripts/migrate-contract.ts
 *
 * Steps:
 *   1. Upload new WASM → get new CODE_ID
 *   2. Migrate existing contract to new CODE_ID with new token_cw20
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

/** New COIN CW20 token address (from .env LAUNCH_CW20_ADDR) */
const NEW_TOKEN_CW20 = process.env.LAUNCH_CW20_ADDR!;

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
    LAUNCH_CW20_ADDR: NEW_TOKEN_CW20,
  })) {
    if (!val) throw new Error(`Missing env variable: ${name}`);
  }

  log(`RPC: ${RPC_URL}`);
  log(`Contract: ${CONTRACT_ADDR}`);
  log(`New COIN CW20: ${NEW_TOKEN_CW20}`);

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

  // 3. Query current config (before migration)
  log("--- Config BEFORE migration ---");
  const configBefore = await client.queryContractSmart(CONTRACT_ADDR, { config: {} });
  log(`  token_cw20: ${configBefore.token_cw20}`);
  log(`  admin: ${configBefore.admin}`);
  log(`  treasury: ${configBefore.treasury}`);

  if (configBefore.admin !== account.address) {
    throw new Error(
      `Sender ${account.address} is not admin (${configBefore.admin}). Only admin can migrate.`,
    );
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
    const uploadResult = await client.upload(account.address, wasm, "auto", "coinflip-pvp-vault v0.5.0");
    log(`Code stored! Code ID: ${uploadResult.codeId}`);
    log(`  Tx hash: ${uploadResult.transactionHash}`);
    log(`  Gas used: ${uploadResult.gasUsed}`);
    codeId = uploadResult.codeId;
  }

  // 5. Migrate contract — pass new token_cw20 in MigrateMsg
  const migrateMsg = { token_cw20: NEW_TOKEN_CW20 };
  log(`Migrating contract to code ID ${codeId} with: ${JSON.stringify(migrateMsg)}`);

  const migrateResult = await client.migrate(
    account.address,
    CONTRACT_ADDR,
    codeId,
    migrateMsg,
    "auto",
  );
  log(`Contract migrated!`);
  log(`  Tx hash: ${migrateResult.transactionHash}`);
  log(`  Gas used: ${migrateResult.gasUsed}`);

  // 6. Verify config after migration
  log("--- Config AFTER migration ---");
  const configAfter = await client.queryContractSmart(CONTRACT_ADDR, { config: {} });
  log(`  token_cw20: ${configAfter.token_cw20}`);
  log(`  admin: ${configAfter.admin}`);
  log(`  treasury: ${configAfter.treasury}`);

  if (configAfter.token_cw20 !== NEW_TOKEN_CW20) {
    throw new Error(
      `Verification failed! token_cw20 is ${configAfter.token_cw20}, expected ${NEW_TOKEN_CW20}`,
    );
  }

  log("=== Migration complete! ===");
  log(`Code ID: ${codeId}`);
  log(`token_cw20: ${configBefore.token_cw20} → ${configAfter.token_cw20}`);

  return {
    codeId,
    txHash: migrateResult.transactionHash,
    oldToken: configBefore.token_cw20,
    newToken: configAfter.token_cw20,
  };
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
