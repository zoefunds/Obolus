import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient, createAccount } from "genlayer-js";
import { studionet, localnet } from "./chains.js";

// backend/ is a workspace nested under the repo root, but .env lives at the
// repo root (shared with scripts/deploy.mjs) — plain `dotenv/config` only
// resolves `.env` relative to process.cwd(), which under pm2's configured
// `cwd: "./backend"` is backend/, not the root, so it silently found
// nothing. Resolve the root .env explicitly instead.
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

const NETWORKS = { studionet, localnet };
const networkName = process.env.GENLAYER_NETWORK || "studionet";
const chain = NETWORKS[networkName];
if (!chain) {
  throw new Error(`Unknown GENLAYER_NETWORK "${networkName}". Supported: ${Object.keys(NETWORKS).join(", ")}`);
}

export const CONTRACT_ADDRESS = process.env.VDE_CONTRACT_ADDRESS;
if (!CONTRACT_ADDRESS) {
  console.warn("VDE_CONTRACT_ADDRESS is not set — writes/reads will fail until it is configured (run scripts/deploy.mjs first).");
}

const rawPrivateKey = process.env.GENLAYER_PRIVATE_KEY;
const isPlaceholderKey = !rawPrivateKey || /^0x0+$/.test(rawPrivateKey);

let account;
if (!isPlaceholderKey) {
  try {
    account = createAccount(rawPrivateKey);
  } catch (err) {
    // A malformed key must degrade to read-only, not crash server startup
    // (this module's exports are needed for every route, including reads).
    console.error("GENLAYER_PRIVATE_KEY is set but invalid — running read-only:", err.message);
  }
}
if (!account) {
  console.warn("No usable GENLAYER_PRIVATE_KEY configured — this instance can serve reads only; every write will fail with 503.");
}

// One client reused across requests, matching the confirmed-working
// pattern from ~/Event-Weaver's backend/src/genlayer.js: a plain
// `createClient({ chain })` with no account handles reads fine on
// genlayer-js@1.1.8+ (the "window is not defined" issue that forced an
// ephemeral-account workaround was specific to @0.8.0's transport). Real
// GEN moves through this client's writeContract({ value }) — see
// contract.js's writeMethod, which passes the REAL signing account
// explicitly per call via requireAccount() — never a simulated/mocked
// balance.
export const client = createClient({ chain, account });

export function requireAccount() {
  if (!account) {
    const err = new Error("Server has no GENLAYER_PRIVATE_KEY configured — writes are disabled on this instance.");
    err.status = 503;
    throw err;
  }
  return account;
}
