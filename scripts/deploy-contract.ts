/**
 * Deploy CoinFlip PvP Vault contract to Axiome chain.
 *
 * Usage:
 *   cd scripts && pnpm install && pnpm run deploy
 *
 * Reads config from ../.env (AXIOME_RPC_URL, RELAYER_MNEMONIC, etc.)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { stringToPath } from "@cosmjs/crypto";

// ---- Load .env from project root ----
import dotenv from "dotenv";
dotenv.config({ path: resolve(import.meta.dirname!, "../.env") });

// ---- Configuration ----

const RPC_URL = process.env.AXIOME_RPC_URL!;
const CHAIN_ID = process.env.AXIOME_CHAIN_ID!;
const MNEMONIC = process.env.RELAYER_MNEMONIC!;
const LAUNCH_CW20_ADDR = process.env.LAUNCH_CW20_ADDR!;
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS!;

// Contract instantiate parameters (from the plan)
const INSTANTIATE_PARAMS = {
  token_cw20: LAUNCH_CW20_ADDR,
  treasury: TREASURY_ADDRESS,
  commission_bps: 1000, // 10%
  min_bet: "1000000", // 1 COIN (6 decimals)
  reveal_timeout_secs: 300, // 5 minutes
  max_open_per_user: 5,
  max_daily_amount_per_user: "1000000000000", // 1M COIN — effectively no limit for now
};

const WASM_PATH = resolve(
  import.meta.dirname!,
  "../contracts/coinflip-pvp-vault/artifacts/coinflip_pvp_vault.wasm",
);

const ENV_PATH = resolve(import.meta.dirname!, "../.env");

// Axiome uses "uaxm" as the fee denom
const GAS_PRICE = GasPrice.fromString("0.025uaxm");
// Axiome uses coin type 546
const HD_PATH = stringToPath("m/44'/546'/0'/0/0");

// ---- Helpers ----

function log(msg: string) {
  console.log(`[deploy] ${msg}`);
}

function updateEnvFile(key: string, value: string) {
  let content = readFileSync(ENV_PATH, "utf-8");
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}\n`;
  }
  writeFileSync(ENV_PATH, content, "utf-8");
  log(`Updated ${ENV_PATH}: ${key}=${value}`);
}

// ---- Main ----

async function main() {
  // Validate env
  for (const [name, val] of Object.entries({
    AXIOME_RPC_URL: RPC_URL,
    AXIOME_CHAIN_ID: CHAIN_ID,
    RELAYER_MNEMONIC: MNEMONIC,
    LAUNCH_CW20_ADDR: LAUNCH_CW20_ADDR,
    TREASURY_ADDRESS: TREASURY_ADDRESS,
  })) {
    if (!val) {
      throw new Error(`Missing env variable: ${name}`);
    }
  }

  log(`RPC: ${RPC_URL}`);
  log(`Chain ID: ${CHAIN_ID}`);
  log(`Treasury: ${TREASURY_ADDRESS}`);
  log(`COIN CW20: ${LAUNCH_CW20_ADDR}`);

  // 1. Create wallet from mnemonic
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
    prefix: "axm",
    hdPaths: [HD_PATH],
  });
  const [account] = await wallet.getAccounts();
  log(`Deployer address: ${account.address}`);

  // 2. Connect signing client
  const client = await SigningCosmWasmClient.connectWithSigner(RPC_URL, wallet, {
    gasPrice: GAS_PRICE,
  });

  // Check balance
  const balance = await client.getBalance(account.address, "uaxm");
  log(`Deployer balance: ${balance.amount} uaxm`);

  // 3. Upload .wasm
  log(`Uploading WASM from: ${WASM_PATH}`);
  const wasm = readFileSync(WASM_PATH);
  log(`WASM size: ${(wasm.length / 1024).toFixed(1)} KB`);

  const uploadResult = await client.upload(account.address, wasm, "auto", "coinflip-pvp-vault v0.1.0");
  log(`✓ Code stored! Code ID: ${uploadResult.codeId}`);
  log(`  Tx hash: ${uploadResult.transactionHash}`);
  log(`  Gas used: ${uploadResult.gasUsed}`);

  // 4. Instantiate contract
  log(`Instantiating with params: ${JSON.stringify(INSTANTIATE_PARAMS, null, 2)}`);
  const instantiateResult = await client.instantiate(
    account.address,
    uploadResult.codeId,
    INSTANTIATE_PARAMS,
    "CoinFlip PvP Vault",
    "auto",
    {
      admin: account.address, // Set admin so we can migrate later
    },
  );
  const contractAddr = instantiateResult.contractAddress;
  log(`✓ Contract instantiated!`);
  log(`  Contract address: ${contractAddr}`);
  log(`  Tx hash: ${instantiateResult.transactionHash}`);
  log(`  Gas used: ${instantiateResult.gasUsed}`);

  // 5. Update .env
  updateEnvFile("COINFLIP_CONTRACT_ADDR", contractAddr);

  // 6. Quick verification — query config
  log("Verifying: querying contract config...");
  const config = await client.queryContractSmart(contractAddr, { config: {} });
  log(`  Config: ${JSON.stringify(config, null, 2)}`);

  log("=== Deployment complete! ===");
  log(`Contract address: ${contractAddr}`);
  log(`Code ID: ${uploadResult.codeId}`);

  return { codeId: uploadResult.codeId, contractAddr };
}

main()
  .then((result) => {
    console.log("\nDeploy result:", result);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nDeploy failed:", err);
    process.exit(1);
  });
