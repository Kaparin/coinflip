/**
 * Deploy the COIN Presale contract.
 *
 * Usage:
 *   pnpm --filter scripts tsx scripts/deploy-presale.ts
 *
 * Steps:
 *   1. Upload WASM → get CODE_ID
 *   2. Instantiate contract with config
 *   3. Fund contract with COIN tokens
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { stringToPath } from "@cosmjs/crypto";
import { toUtf8 } from "@cosmjs/encoding";

import dotenv from "dotenv";
dotenv.config({ path: resolve(import.meta.dirname!, "../.env") });

const RPC_URL = process.env.AXIOME_RPC_URL!;
const MNEMONIC = process.env.RELAYER_MNEMONIC!;
const COIN_CW20 = process.env.LAUNCH_CW20_ADDR!;

const WASM_PATH = resolve(
  import.meta.dirname!,
  "../contracts/coin-presale/artifacts/coin_presale.wasm",
);

const GAS_PRICE = GasPrice.fromString("0.025uaxm");
const HD_PATH = stringToPath("m/44'/546'/0'/0/0");

/** 1:1 rate — 1 AXM = 1 COIN */
const RATE_NUM = 1;
const RATE_DENOM = 1;

/** Fund presale with 1,000,000 COIN (= 1_000_000_000_000 micro) */
const FUND_AMOUNT = "1000000000000";

function log(msg: string) {
  console.log(`[deploy-presale] ${msg}`);
}

async function main() {
  for (const [name, val] of Object.entries({
    AXIOME_RPC_URL: RPC_URL,
    RELAYER_MNEMONIC: MNEMONIC,
    LAUNCH_CW20_ADDR: COIN_CW20,
  })) {
    if (!val) throw new Error(`Missing env variable: ${name}`);
  }

  log(`RPC: ${RPC_URL}`);
  log(`COIN CW20: ${COIN_CW20}`);

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
  const existingCodeId = process.env.PRESALE_CODE_ID ? Number(process.env.PRESALE_CODE_ID) : null;

  let codeId: number;
  if (existingCodeId) {
    log(`Using existing Code ID: ${existingCodeId}`);
    codeId = existingCodeId;
  } else {
    log(`Uploading WASM from: ${WASM_PATH}`);
    const wasm = readFileSync(WASM_PATH);
    log(`WASM size: ${(wasm.length / 1024).toFixed(1)} KB`);
    const uploadResult = await client.upload(account.address, wasm, "auto", "coin-presale v0.1.0");
    log(`Code stored! Code ID: ${uploadResult.codeId}`);
    log(`  Tx hash: ${uploadResult.transactionHash}`);
    log(`  Gas used: ${uploadResult.gasUsed}`);
    codeId = uploadResult.codeId;
  }

  // 4. Instantiate
  const existingContract = process.env.PRESALE_CONTRACT_ADDR;
  let contractAddr: string;

  if (existingContract) {
    log(`Using existing contract: ${existingContract}`);
    contractAddr = existingContract;
  } else {
    const instantiateMsg = {
      coin_cw20: COIN_CW20,
      rate_num: RATE_NUM,
      rate_denom: RATE_DENOM,
      enabled: true,
      max_per_tx: "0", // no limit
    };
    log(`Instantiating with: ${JSON.stringify(instantiateMsg)}`);

    const instantiateResult = await client.instantiate(
      account.address,
      codeId,
      instantiateMsg,
      "COIN Presale",
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
  log(`  coin_cw20: ${config.coin_cw20}`);
  log(`  rate: ${config.rate_num}/${config.rate_denom}`);
  log(`  enabled: ${config.enabled}`);

  // 6. Fund with COIN tokens (CW20 Send)
  if (!existingContract && FUND_AMOUNT !== "0") {
    log(`Funding presale with ${FUND_AMOUNT} micro-COIN...`);

    const sendMsg = {
      send: {
        contract: contractAddr,
        amount: FUND_AMOUNT,
        msg: Buffer.from(JSON.stringify({ fund: {} })).toString("base64"),
      },
    };

    const fundResult = await client.execute(
      account.address,
      COIN_CW20,
      sendMsg,
      "auto",
    );
    log(`Funded!`);
    log(`  Tx hash: ${fundResult.transactionHash}`);
    log(`  Gas used: ${fundResult.gasUsed}`);
  }

  // 7. Query status
  const status = await client.queryContractSmart(contractAddr, { status: {} });
  log(`--- Presale Status ---`);
  log(`  COIN available: ${status.coin_available}`);
  log(`  AXM balance: ${status.axm_balance}`);
  log(`  Rate: ${status.rate_num}/${status.rate_denom}`);
  log(`  Enabled: ${status.enabled}`);

  log("=== Deployment complete! ===");
  log(`Contract address: ${contractAddr}`);
  log(`Code ID: ${codeId}`);
  log(`\nAdd to .env:`);
  log(`  PRESALE_CONTRACT_ADDR=${contractAddr}`);
  log(`  NEXT_PUBLIC_PRESALE_CONTRACT=${contractAddr}`);

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
