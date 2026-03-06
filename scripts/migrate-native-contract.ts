/**
 * Migrate CoinFlip PvP Vault (native AXM) contract to a new code version.
 *
 * Usage:
 *   pnpm --filter scripts tsx scripts/migrate-native-contract.ts
 *
 * This script:
 *   1. Uploads the new optimized .wasm
 *   2. Migrates the existing contract to the new code ID
 *   3. Verifies the migration succeeded
 *
 * No state reset — all vaults, bets, and balances are preserved.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { stringToPath } from "@cosmjs/crypto";

import dotenv from "dotenv";
dotenv.config({ path: resolve(import.meta.dirname!, "../.env") });

// ---- Configuration ----

const RPC_URL = process.env.AXIOME_RPC_URL!;
const MNEMONIC = process.env.RELAYER_MNEMONIC!;
const CONTRACT_ADDR = process.env.COINFLIP_NATIVE_CONTRACT_ADDR!;

const WASM_PATH = resolve(
  import.meta.dirname!,
  "../contracts/coinflip-pvp-vault-native/artifacts/coinflip_pvp_vault_native.wasm",
);

const GAS_PRICE_STR = "0.025uaxm";
const HD_PATH = stringToPath("m/44'/546'/0'/0/0");

function log(msg: string) {
  console.log(`[migrate] ${msg}`);
}

async function main() {
  if (!RPC_URL || !MNEMONIC || !CONTRACT_ADDR) {
    throw new Error(
      "Missing env: AXIOME_RPC_URL, RELAYER_MNEMONIC, COINFLIP_NATIVE_CONTRACT_ADDR",
    );
  }

  log(`RPC: ${RPC_URL}`);
  log(`Contract: ${CONTRACT_ADDR}`);

  // 1. Create wallet
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
    prefix: "axm",
    hdPaths: [HD_PATH],
  });
  const [account] = await wallet.getAccounts();
  log(`Admin address: ${account!.address}`);

  // 2. Connect
  const client = await SigningCosmWasmClient.connectWithSigner(RPC_URL, wallet, {
    gasPrice: GasPrice.fromString(GAS_PRICE_STR),
  });

  // 3. Query current contract info
  const contractInfo = await client.getContract(CONTRACT_ADDR);
  log(`Current code ID: ${contractInfo.codeId}`);
  log(`Current admin: ${contractInfo.admin ?? "none"}`);

  if (contractInfo.admin !== account!.address) {
    throw new Error(
      `Contract admin is ${contractInfo.admin}, but wallet is ${account!.address}. Only admin can migrate.`,
    );
  }

  // 4. Upload new wasm
  log(`Uploading WASM: ${WASM_PATH}`);
  const wasm = readFileSync(WASM_PATH);
  log(`WASM size: ${(wasm.length / 1024).toFixed(1)} KB`);

  const uploadResult = await client.upload(
    account!.address,
    wasm,
    { amount: [{ denom: "uaxm", amount: "500000" }], gas: "20000000" },
    "coinflip-pvp-vault-native v0.2.0",
  );
  log(`Code stored! New code ID: ${uploadResult.codeId}`);
  log(`  Tx: ${uploadResult.transactionHash}`);
  log(`  Gas: ${uploadResult.gasUsed}`);

  // 5. Migrate (no state reset, no denom change)
  log("Migrating contract...");
  const migrateResult = await client.migrate(
    account!.address,
    CONTRACT_ADDR,
    uploadResult.codeId,
    { accepted_denom: null, reset_state: false },
    "auto",
    "Migrate to v0.2.0: add admin_withdraw_user",
  );
  log(`Migrated!`);
  log(`  Tx: ${migrateResult.transactionHash}`);
  log(`  Gas: ${migrateResult.gasUsed}`);

  // 6. Verify
  log("Verifying migration...");
  const newInfo = await client.getContract(CONTRACT_ADDR);
  log(`  New code ID: ${newInfo.codeId}`);

  const config = await client.queryContractSmart(CONTRACT_ADDR, { config: {} });
  log(`  Config: ${JSON.stringify(config, null, 2)}`);

  log("=== Migration complete! ===");
  log(`Old code ID: ${contractInfo.codeId} → New code ID: ${uploadResult.codeId}`);
  log(`Contract address unchanged: ${CONTRACT_ADDR}`);

  return {
    oldCodeId: contractInfo.codeId,
    newCodeId: uploadResult.codeId,
    contractAddr: CONTRACT_ADDR,
    txHash: migrateResult.transactionHash,
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
