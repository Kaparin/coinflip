/**
 * Recover stuck COIN (CW20) tokens from old contracts.
 *
 * Steps:
 *   1. Migrate old CoinFlip contract with reset_state=true (wipes vaults, making COIN orphaned)
 *   2. AdminSweep on old CoinFlip contract → sends orphaned COIN to treasury
 *   3. WithdrawCoin on Presale contract → sends unsold COIN pool to admin
 *
 * Usage:
 *   pnpm --filter scripts tsx scripts/recover-coin-tokens.ts
 *
 * Flags:
 *   --skip-migrate   Skip step 1 (if already migrated with reset)
 *   --skip-sweep     Skip step 2
 *   --skip-presale   Skip step 3
 *   --dry-run        Only query balances, don't execute
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

/** Old CoinFlip contract (CW20-based, has stuck COIN in vaults) */
const OLD_COINFLIP = process.env.COINFLIP_CONTRACT_ADDR!;
/** Presale contract (has unsold COIN pool) */
const PRESALE = process.env.PRESALE_CONTRACT_ADDR!;
/** COIN CW20 token address */
const COIN_CW20 = process.env.LAUNCH_CW20_ADDR!;
/** Treasury address to receive recovered funds */
const TREASURY = process.env.TREASURY_WALLET_ADDR || "axm1g2akr2kxul2kpummprad7luhue6hpd9u48jaud";

const GAS_PRICE = GasPrice.fromString("0.025uaxm");
const HD_PATH = stringToPath("m/44'/546'/0'/0/0");

const args = process.argv.slice(2);
const skipMigrate = args.includes("--skip-migrate");
const skipSweep = args.includes("--skip-sweep");
const skipPresale = args.includes("--skip-presale");
const dryRun = args.includes("--dry-run");

function log(msg: string) {
  console.log(`[recover] ${msg}`);
}

async function queryCw20Balance(address: string): Promise<string> {
  const q = btoa(JSON.stringify({ balance: { address } }));
  const res = await fetch(`${REST_URL}/cosmwasm/wasm/v1/contract/${COIN_CW20}/smart/${q}`);
  const data = (await res.json()) as any;
  return data.data?.balance ?? "0";
}

function formatCoin(micro: string): string {
  return (Number(micro) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

async function main() {
  for (const [name, val] of Object.entries({
    AXIOME_RPC_URL: RPC_URL,
    AXIOME_REST_URL: REST_URL,
    RELAYER_MNEMONIC: MNEMONIC,
    COINFLIP_CONTRACT_ADDR: OLD_COINFLIP,
    PRESALE_CONTRACT_ADDR: PRESALE,
    LAUNCH_CW20_ADDR: COIN_CW20,
  })) {
    if (!val) throw new Error(`Missing env variable: ${name}`);
  }

  log("=== COIN Token Recovery ===");
  log(`Old CoinFlip: ${OLD_COINFLIP}`);
  log(`Presale:      ${PRESALE}`);
  log(`COIN CW20:    ${COIN_CW20}`);
  log(`Treasury:     ${TREASURY}`);
  if (dryRun) log("*** DRY RUN — no transactions will be sent ***");

  // Query initial balances
  const oldCoinflipBal = await queryCw20Balance(OLD_COINFLIP);
  const presaleBal = await queryCw20Balance(PRESALE);
  const treasuryBal = await queryCw20Balance(TREASURY);

  log(`\n--- Current COIN balances ---`);
  log(`  Old CoinFlip contract: ${formatCoin(oldCoinflipBal)} COIN (${oldCoinflipBal} micro)`);
  log(`  Presale contract:      ${formatCoin(presaleBal)} COIN (${presaleBal} micro)`);
  log(`  Treasury wallet:       ${formatCoin(treasuryBal)} COIN (${treasuryBal} micro)`);

  if (dryRun) {
    log("\nDry run complete. Use without --dry-run to execute.");
    return;
  }

  // Create wallet & client
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
    prefix: "axm",
    hdPaths: [HD_PATH],
  });
  const [account] = await wallet.getAccounts();
  log(`\nAdmin address: ${account.address}`);

  const client = await SigningCosmWasmClient.connectWithSigner(RPC_URL, wallet, {
    gasPrice: GAS_PRICE,
  });

  // ──────────────────────────────────────────────
  // Step 1: Migrate old CoinFlip with reset_state
  // ──────────────────────────────────────────────
  if (!skipMigrate) {
    log("\n--- Step 1: Migrate old CoinFlip (reset_state=true) ---");

    // Get current code_id so we can migrate to same code
    const contractInfo = await client.getContract(OLD_COINFLIP);
    const currentCodeId = contractInfo.codeId;
    log(`  Current code ID: ${currentCodeId}`);

    const migrateMsg = { token_cw20: COIN_CW20, reset_state: true };
    log(`  Migrating with: ${JSON.stringify(migrateMsg)}`);

    const result = await client.migrate(
      account.address,
      OLD_COINFLIP,
      currentCodeId,
      migrateMsg,
      "auto",
    );
    log(`  Migrated! Tx: ${result.transactionHash}`);
    log(`  Gas used: ${result.gasUsed}`);
  } else {
    log("\n--- Step 1: SKIPPED (--skip-migrate) ---");
  }

  // ──────────────────────────────────
  // Step 2: AdminSweep on old CoinFlip
  // ──────────────────────────────────
  if (!skipSweep) {
    log("\n--- Step 2: AdminSweep on old CoinFlip ---");

    // Check balance after reset
    const balAfterReset = await queryCw20Balance(OLD_COINFLIP);
    log(`  Contract COIN balance: ${formatCoin(balAfterReset)} COIN`);

    if (balAfterReset === "0") {
      log("  No COIN to sweep — skipping.");
    } else {
      const sweepMsg = { admin_sweep: { recipient: TREASURY } };
      log(`  Sweeping to treasury: ${TREASURY}`);

      const result = await client.execute(
        account.address,
        OLD_COINFLIP,
        sweepMsg,
        "auto",
      );
      log(`  Swept! Tx: ${result.transactionHash}`);
      log(`  Gas used: ${result.gasUsed}`);

      const balAfterSweep = await queryCw20Balance(OLD_COINFLIP);
      const treasuryAfter = await queryCw20Balance(TREASURY);
      log(`  Contract balance after: ${formatCoin(balAfterSweep)} COIN`);
      log(`  Treasury balance after: ${formatCoin(treasuryAfter)} COIN`);
    }
  } else {
    log("\n--- Step 2: SKIPPED (--skip-sweep) ---");
  }

  // ──────────────────────────────────────
  // Step 3: WithdrawCoin from Presale
  // ──────────────────────────────────────
  if (!skipPresale) {
    log("\n--- Step 3: WithdrawCoin from Presale ---");

    const presaleBalance = await queryCw20Balance(PRESALE);
    log(`  Presale COIN balance: ${formatCoin(presaleBalance)} COIN`);

    if (presaleBalance === "0") {
      log("  No COIN in presale — skipping.");
    } else {
      // WithdrawCoin sends tokens to admin (contract sender)
      const withdrawMsg = { withdraw_coin: { amount: presaleBalance } };
      log(`  Withdrawing ${formatCoin(presaleBalance)} COIN...`);

      const result = await client.execute(
        account.address,
        PRESALE,
        withdrawMsg,
        "auto",
      );
      log(`  Withdrawn! Tx: ${result.transactionHash}`);
      log(`  Gas used: ${result.gasUsed}`);

      const presaleAfter = await queryCw20Balance(PRESALE);
      const adminAfter = await queryCw20Balance(account.address);
      log(`  Presale balance after: ${formatCoin(presaleAfter)} COIN`);
      log(`  Admin wallet balance:  ${formatCoin(adminAfter)} COIN`);

      // Transfer from admin to treasury if different
      if (account.address !== TREASURY && adminAfter !== "0") {
        log(`  Transferring recovered COIN from admin to treasury...`);
        const transferMsg = {
          transfer: { recipient: TREASURY, amount: presaleBalance },
        };
        const txResult = await client.execute(
          account.address,
          COIN_CW20,
          transferMsg,
          "auto",
        );
        log(`  Transferred! Tx: ${txResult.transactionHash}`);
      }
    }
  } else {
    log("\n--- Step 3: SKIPPED (--skip-presale) ---");
  }

  // Final summary
  log("\n=== Final Balances ===");
  const finalOld = await queryCw20Balance(OLD_COINFLIP);
  const finalPresale = await queryCw20Balance(PRESALE);
  const finalTreasury = await queryCw20Balance(TREASURY);
  const finalAdmin = await queryCw20Balance(account.address);
  log(`  Old CoinFlip: ${formatCoin(finalOld)} COIN`);
  log(`  Presale:      ${formatCoin(finalPresale)} COIN`);
  log(`  Treasury:     ${formatCoin(finalTreasury)} COIN`);
  log(`  Admin wallet: ${formatCoin(finalAdmin)} COIN`);
  log("\n=== Recovery complete! ===");

  client.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nRecovery failed:", err);
    process.exit(1);
  });
