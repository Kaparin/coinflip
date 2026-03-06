/**
 * Deploy the LAUNCH Staking contract.
 *
 * Usage:
 *   pnpm --filter scripts tsx scripts/deploy-staking.ts
 *
 * Steps:
 *   1. Upload WASM → get CODE_ID
 *   2. Instantiate contract with LAUNCH CW20 address
 *   3. Verify config via query
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
const LAUNCH_CW20 =
  process.env.LAUNCH_CW20_ADDR ||
  "axm1zvjnc08uy0zz43m0nlh9f5aetpa3amn6a034yqvmsgvzshk9clds375xx9";

const WASM_PATH = resolve(
  import.meta.dirname!,
  "../contracts/launch-staking/artifacts/launch_staking.wasm",
);

const GAS_PRICE = GasPrice.fromString("0.025uaxm");
const HD_PATH = stringToPath("m/44'/546'/0'/0/0");

function log(msg: string) {
  console.log(`[deploy-staking] ${msg}`);
}

async function main() {
  for (const [name, val] of Object.entries({
    AXIOME_RPC_URL: RPC_URL,
    RELAYER_MNEMONIC: MNEMONIC,
    LAUNCH_CW20_ADDR: LAUNCH_CW20,
  })) {
    if (!val) throw new Error(`Missing env variable: ${name}`);
  }

  log(`RPC: ${RPC_URL}`);
  log(`LAUNCH CW20: ${LAUNCH_CW20}`);

  // 1. Wallet
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
  log(`AXM Balance: ${balance.amount} uaxm`);

  // 3. Upload WASM
  const existingCodeId = process.env.STAKING_CODE_ID
    ? Number(process.env.STAKING_CODE_ID)
    : null;

  let codeId: number;
  if (existingCodeId) {
    log(`Using existing Code ID: ${existingCodeId}`);
    codeId = existingCodeId;
  } else {
    log(`Uploading WASM from: ${WASM_PATH}`);
    const wasm = readFileSync(WASM_PATH);
    log(`WASM size: ${(wasm.length / 1024).toFixed(1)} KB`);
    const uploadResult = await client.upload(
      account.address,
      wasm,
      "auto",
      "launch-staking v0.1.0",
    );
    log(`Code stored! Code ID: ${uploadResult.codeId}`);
    log(`  Tx hash: ${uploadResult.transactionHash}`);
    log(`  Gas used: ${uploadResult.gasUsed}`);
    codeId = uploadResult.codeId;
  }

  // 4. Instantiate
  const existingContract = process.env.STAKING_CONTRACT_ADDR;
  let contractAddr: string;

  if (existingContract) {
    log(`Using existing contract: ${existingContract}`);
    contractAddr = existingContract;
  } else {
    const instantiateMsg = {
      launch_cw20: LAUNCH_CW20,
    };
    log(`Instantiating with: ${JSON.stringify(instantiateMsg)}`);

    const instantiateResult = await client.instantiate(
      account.address,
      codeId,
      instantiateMsg,
      "LAUNCH Staking",
      "auto",
      { admin: account.address },
    );
    contractAddr = instantiateResult.contractAddress;
    log(`Contract instantiated!`);
    log(`  Address: ${contractAddr}`);
    log(`  Tx hash: ${instantiateResult.transactionHash}`);
    log(`  Gas used: ${instantiateResult.gasUsed}`);
  }

  // 5. Query config to verify
  const config = await client.queryContractSmart(contractAddr, { config: {} });
  log(`--- Contract Config ---`);
  log(`  admin: ${config.admin}`);
  log(`  launch_cw20: ${config.launch_cw20}`);

  // 6. Query state
  const state = await client.queryContractSmart(contractAddr, { state: {} });
  log(`--- Staking State ---`);
  log(`  total_staked: ${state.total_staked}`);
  log(`  total_distributed: ${state.total_distributed}`);
  log(`  total_claimed: ${state.total_claimed}`);
  log(`  total_stakers: ${state.total_stakers}`);
  log(`  axm_balance: ${state.axm_balance}`);

  log("=== Deployment complete! ===");
  log(`Contract address: ${contractAddr}`);
  log(`Code ID: ${codeId}`);
  log(`\nAdd to .env:`);
  log(`  STAKING_CONTRACT_ADDR=${contractAddr}`);
  log(`  NEXT_PUBLIC_STAKING_CONTRACT=${contractAddr}`);

  return { codeId, contractAddr };
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
