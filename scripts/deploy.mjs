#!/usr/bin/env node
// Deploys contracts/verifiable_decease_escrow.py to the configured GenLayer
// network using genlayer-js directly (not the `genlayer` CLI's `write`
// command — that path hardcodes value: 0n and cannot carry native GEN,
// which this contract's create_vault/fund_vault require; see the
// ic2 project's README "Errors encountered" section).
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet, localnet } from "genlayer-js/chains";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// genlayer-js@1.1.8+ ships a real `studionet` chain object (correct RPC
// URL, chain id, and a hardcoded consensusMainContract address/ABI — no
// dynamic discovery needed). An earlier version of this script worked
// around genlayer-js@0.8.0 not shipping StudioNet at all; see
// backend/src/chains.js for the fuller history of that bug.
const NETWORKS = { studionet, localnet };

async function main() {
  const networkName = process.env.GENLAYER_NETWORK || "studionet";
  const chain = NETWORKS[networkName];
  if (!chain) {
    throw new Error(`Unknown GENLAYER_NETWORK "${networkName}". Supported: ${Object.keys(NETWORKS).join(", ")}`);
  }

  let privateKey = process.env.GENLAYER_PRIVATE_KEY;
  if (!privateKey || /^0x0+$/.test(privateKey)) {
    privateKey = generatePrivateKey();
    console.warn(
      "No GENLAYER_PRIVATE_KEY set — generated an ephemeral one for this run.\n" +
        "Fund it before deploying, or set GENLAYER_PRIVATE_KEY in .env for a real deploy.\n" +
        `Generated key: ${privateKey}`
    );
  }
  const account = createAccount(privateKey);

  const client = createClient({ chain, account });

  const contractCode = readFileSync(path.join(root, "contracts", "verifiable_decease_escrow.py"));

  const minClaimantBondWei = BigInt(process.env.MIN_CLAIMANT_BOND_WEI || "0");
  const minContesterBondWei = BigInt(process.env.MIN_CONTESTER_BOND_WEI || "0");

  console.log(`Deploying VerifiableDeceaseEscrow to ${networkName} from ${account.address}...`);

  const deployTxHash = await client.deployContract({
    code: contractCode,
    args: [minClaimantBondWei, minContesterBondWei],
  });

  const receipt = await client.waitForTransactionReceipt({
    hash: deployTxHash,
    status: "ACCEPTED",
    interval: 4000,
    retries: 90,
  });

  const contractAddress = receipt.data?.contract_address ?? receipt.contractAddress;
  if (!contractAddress) {
    console.error("Deploy transaction finalized but no contract address was returned:", receipt);
    process.exit(1);
  }

  console.log(`Deployed: ${contractAddress}`);
  console.log(`Tx hash:  ${deployTxHash}`);

  const envPath = path.join(root, ".env");
  try {
    let envContents = readFileSync(envPath, "utf8");
    if (/^VDE_CONTRACT_ADDRESS=.*$/m.test(envContents)) {
      envContents = envContents.replace(/^VDE_CONTRACT_ADDRESS=.*$/m, `VDE_CONTRACT_ADDRESS=${contractAddress}`);
    } else {
      envContents += `\nVDE_CONTRACT_ADDRESS=${contractAddress}\n`;
    }
    writeFileSync(envPath, envContents);
    console.log(`Wrote VDE_CONTRACT_ADDRESS into ${envPath}`);
  } catch {
    console.log(`No .env file found at ${envPath} — set VDE_CONTRACT_ADDRESS=${contractAddress} manually.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
