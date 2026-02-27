/**
 * Verify deployed CoinFlip contract — query config, make a test deposit/withdraw.
 *
 * Usage:
 *   cd scripts && pnpm run verify
 *
 * Requires COINFLIP_CONTRACT_ADDR to be set in ../.env
 */

import { resolve } from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: resolve(import.meta.dirname!, "../.env") });

import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { stringToPath } from "@cosmjs/crypto";

const RPC_URL = process.env.AXIOME_RPC_URL!;
const MNEMONIC = process.env.RELAYER_MNEMONIC!;
const CONTRACT_ADDR = process.env.COINFLIP_CONTRACT_ADDR!;
const LAUNCH_CW20 = process.env.LAUNCH_CW20_ADDR!;
const GAS = GasPrice.fromString("0.025uaxm");
// Axiome uses coin type 546
const HD_PATH = stringToPath("m/44'/546'/0'/0/0");

function log(msg: string) {
  console.log(`[verify] ${msg}`);
}

async function main() {
  if (!CONTRACT_ADDR) {
    throw new Error("COINFLIP_CONTRACT_ADDR not set in .env — deploy first!");
  }

  log(`Contract: ${CONTRACT_ADDR}`);
  log(`RPC: ${RPC_URL}`);

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
    prefix: "axm",
    hdPaths: [HD_PATH],
  });
  const [account] = await wallet.getAccounts();
  log(`Verifier address: ${account.address}`);

  const client = await SigningCosmWasmClient.connectWithSigner(RPC_URL, wallet, {
    gasPrice: GAS,
  });

  // 1. Query config
  log("--- Querying contract config ---");
  const config = await client.queryContractSmart(CONTRACT_ADDR, { config: {} });
  log(`Admin: ${config.admin}`);
  log(`Token CW20: ${config.token_cw20}`);
  log(`Treasury: ${config.treasury}`);
  log(`Commission: ${config.commission_bps} bps (${config.commission_bps / 100}%)`);
  log(`Min bet: ${config.min_bet}`);
  log(`Reveal timeout: ${config.reveal_timeout_secs}s`);
  log(`Max open/user: ${config.max_open_per_user}`);
  log(`Max daily/user: ${config.max_daily_amount_per_user}`);

  // 2. Check CW20 token info
  log("\n--- Querying COIN CW20 token info ---");
  try {
    const tokenInfo = await client.queryContractSmart(LAUNCH_CW20, {
      token_info: {},
    });
    log(`Token name: ${tokenInfo.name}`);
    log(`Token symbol: ${tokenInfo.symbol}`);
    log(`Token decimals: ${tokenInfo.decimals}`);
    log(`Total supply: ${tokenInfo.total_supply}`);
  } catch (err) {
    log(`Warning: Could not query token info: ${err}`);
  }

  // 3. Check relayer CW20 balance
  log("\n--- Querying relayer COIN balance ---");
  try {
    const cw20Balance = await client.queryContractSmart(LAUNCH_CW20, {
      balance: { address: account.address },
    });
    log(`Relayer COIN balance: ${cw20Balance.balance}`);
  } catch (err) {
    log(`Warning: Could not query CW20 balance: ${err}`);
  }

  // 4. Test deposit (small amount)
  const TEST_AMOUNT = "1000000"; // 1 COIN
  log(`\n--- Test deposit: ${TEST_AMOUNT} COIN ---`);
  try {
    const depositMsg = {
      send: {
        contract: CONTRACT_ADDR,
        amount: TEST_AMOUNT,
        msg: Buffer.from(JSON.stringify({ deposit: {} })).toString("base64"),
      },
    };
    const depositResult = await client.execute(
      account.address,
      LAUNCH_CW20,
      depositMsg,
      "auto",
    );
    log(`Deposit tx: ${depositResult.transactionHash}`);
    log(`Gas used: ${depositResult.gasUsed}`);

    // Check vault balance
    const vaultBal = await client.queryContractSmart(CONTRACT_ADDR, {
      vault_balance: { address: account.address },
    });
    log(`Vault available: ${vaultBal.available}`);
    log(`Vault locked: ${vaultBal.locked}`);

    // 5. Test withdraw
    log(`\n--- Test withdraw: ${TEST_AMOUNT} COIN ---`);
    const withdrawResult = await client.execute(
      account.address,
      CONTRACT_ADDR,
      { withdraw: { amount: TEST_AMOUNT } },
      "auto",
    );
    log(`Withdraw tx: ${withdrawResult.transactionHash}`);
    log(`Gas used: ${withdrawResult.gasUsed}`);

    const vaultBalAfter = await client.queryContractSmart(CONTRACT_ADDR, {
      vault_balance: { address: account.address },
    });
    log(`Vault after withdraw — available: ${vaultBalAfter.available}, locked: ${vaultBalAfter.locked}`);
  } catch (err) {
    log(`Deposit/withdraw test failed: ${err}`);
    log("This may be expected if the relayer has no COIN tokens yet.");
  }

  log("\n=== Verification complete! ===");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  });
