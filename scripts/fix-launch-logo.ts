/**
 * Restore LAUNCH token logo URL after migration.
 * Usage: npx tsx scripts/fix-launch-logo.ts
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
const MNEMONIC = process.env.LAUNCH_ADMIN_MNEMONIC!;
const LAUNCH_CW20 = "axm1zvjnc08uy0zz43m0nlh9f5aetpa3amn6a034yqvmsgvzshk9clds375xx9";
const HD_PATH = stringToPath("m/44'/546'/0'/0/0");
const LOGO_URL = "https://image2url.com/r2/default/images/1770220782157-0e2ab4ed-cb61-46aa-a681-b50a302b1254.png";

async function main() {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
    prefix: "axm",
    hdPaths: [HD_PATH],
  });
  const [account] = await wallet.getAccounts();
  console.log("Sender:", account.address);

  const client = await SigningCosmWasmClient.connectWithSigner(RPC_URL, wallet, {
    gasPrice: GasPrice.fromString("0.025uaxm"),
  });

  // Upload logo URL
  console.log("Uploading logo URL:", LOGO_URL);
  const result = await client.execute(
    account.address,
    LAUNCH_CW20,
    { upload_logo: { url: LOGO_URL } },
    "auto",
    "Restore LAUNCH token logo",
  );
  console.log("Logo Tx:", result.transactionHash);

  // Verify
  await new Promise((r) => setTimeout(r, 3000));
  const q = btoa(JSON.stringify({ marketing_info: {} }));
  const res = await fetch(`${REST_URL}/cosmwasm/wasm/v1/contract/${LAUNCH_CW20}/smart/${q}`);
  const data = (await res.json() as any).data;
  console.log("Logo:", JSON.stringify(data.logo));
  console.log("Done!");

  client.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err.message);
    process.exit(1);
  });
