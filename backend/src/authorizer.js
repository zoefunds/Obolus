/**
 * Independently operated settlement authorizer.
 *
 * Run this in a separate service/security domain from the relay API. It owns
 * SETTLEMENT_AUTHORIZER_PRIVATE_KEY, performs latest-final GenLayer reads, and
 * signs only byte-for-byte matching settlement or failed-payment requests.
 */
import { config as loadEnv } from "dotenv";
import { ethers } from "ethers";
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { client, CONTRACT_ADDRESS } from "./genlayerClient.js";
import { OBOLUS_ESCROW_ABI } from "./lib/escrowAbi.js";

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const ESCROW_ADDRESS = process.env.OBOLUS_ESCROW_ADDRESS || "";
const PRIVATE_KEY = process.env.SETTLEMENT_AUTHORIZER_PRIVATE_KEY || "";
const TOKEN = process.env.SETTLEMENT_AUTHORIZER_TOKEN || "";
const PORT = Number(process.env.AUTHORIZER_PORT || 4100);
const MAX_AUTH_SECONDS = 300;
const PAGE_SIZE = 100;

function plain(value) {
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [k, plain(v)]));
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "bigint") return value.toString();
  return value;
}

function vaultKey(vaultId) {
  return ethers.zeroPadValue(ethers.toBeHex(BigInt(vaultId)), 32);
}

export function individualSettlementId(vaultId, id) {
  return ethers.keccak256(ethers.solidityPacked(["bytes32", "uint256"], [vaultKey(vaultId), BigInt(id)]));
}

function normalizeRows(rows) {
  return rows.map((row) => ({
    id: Number(row.id),
    recipient: ethers.getAddress(row.recipient),
    amount: BigInt(row.amount_usdc).toString(),
  }));
}

export function assertExactFinalizedSettlement(payload, finalizedRows) {
  const proposed = payload.settlementIds.map((id, index) => ({
    id: Number(id),
    recipient: ethers.getAddress(payload.recipients[index]),
    amount: BigInt(payload.amounts[index]).toString(),
  }));
  const expected = normalizeRows(finalizedRows);
  if (JSON.stringify(proposed) !== JSON.stringify(expected)) {
    throw new Error("proposal does not exactly match latest-final GenLayer entitlements missing on Base");
  }
  const expectedBaseIds = proposed.map((row) => individualSettlementId(payload.vaultId, row.id));
  if (JSON.stringify(expectedBaseIds) !== JSON.stringify(payload.baseSettlementIds)) {
    throw new Error("Base settlement replay ids do not match finalized GenLayer settlement ids");
  }
  return proposed;
}

export function assertFinalizedSettlementEligibility(payload, rows, vault, pool) {
  if (Number(vault.id) !== Number(payload.vaultId)) throw new Error("finalized vault id mismatch");
  if (!["ACTIVE", "PAYOUT_READY", "CANCELLED"].includes(vault.status)) {
    throw new Error(`vault status ${vault.status} is not settlement-eligible`);
  }
  const total = rows.reduce((sum, row) => sum + BigInt(row.amount_usdc), 0n);
  const deposited = BigInt(pool.deposited ?? pool[0]);
  const allocated = BigInt(pool.allocated ?? pool[1]);
  if (total > deposited - allocated) throw new Error("finalized entitlements exceed unallocated Base deposits");
  if (vault.status === "PAYOUT_READY" && !rows.some(
    (row) => ethers.getAddress(row.recipient) === ethers.getAddress(vault.beneficiary) && BigInt(row.amount_usdc) > 0n,
  )) {
    throw new Error("confirmed payout has no entitlement for the finalized beneficiary");
  }
  if (vault.status === "CANCELLED" && rows.some(
    (row) => ethers.getAddress(row.recipient) !== ethers.getAddress(vault.grantor),
  )) {
    throw new Error("cancelled vault settlement is not payable exclusively to the finalized grantor");
  }
}

async function readFinal(functionName, args) {
  return plain(await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    transactionHashVariant: "latest-final",
  }));
}

async function allFinalUnapplied(vaultId, escrow, read = readFinal) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await read("get_settlements_page", [Number(vaultId), offset, PAGE_SIZE]);
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  const nonZero = rows.filter((row) => BigInt(row.amount_usdc || "0") > 0n);
  const applied = await Promise.all(nonZero.map((row) => escrow.settledIds(individualSettlementId(vaultId, row.id))));
  return nonZero.filter((_row, index) => !applied[index]);
}

function runtime() {
  if (!CONTRACT_ADDRESS || !ESCROW_ADDRESS || !PRIVATE_KEY || !TOKEN) {
    throw new Error("authorizer requires VDE_CONTRACT_ADDRESS, OBOLUS_ESCROW_ADDRESS, SETTLEMENT_AUTHORIZER_PRIVATE_KEY, and SETTLEMENT_AUTHORIZER_TOKEN");
  }
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const escrow = new ethers.Contract(ESCROW_ADDRESS, OBOLUS_ESCROW_ABI, provider);
  return { wallet, escrow };
}

export async function authorizeSettlement(payload, deps) {
  if (payload.requiredGenLayerStatus !== "FINALIZED") throw new Error("FINALIZED status is required");
  if (String(payload.genlayerContract).toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) throw new Error("wrong GenLayer contract");
  if (String(payload.escrowAddress).toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) throw new Error("wrong Base escrow");
  const read = deps.readFinal || readFinal;
  const finalRows = await allFinalUnapplied(payload.vaultId, deps.escrow, read);
  if (finalRows.length === 0) throw new Error("no unapplied finalized entitlement exists");
  const vault = await read("get_vault", [Number(payload.vaultId)]);
  const pool = await deps.escrow.getPool(vaultKey(payload.vaultId));
  assertFinalizedSettlementEligibility(payload, finalRows, vault, pool);
  const rows = assertExactFinalizedSettlement(payload, finalRows);
  const deadline = Math.floor(Date.now() / 1000) + MAX_AUTH_SECONDS;
  const ids = rows.map((row) => row.id);
  const recipients = rows.map((row) => row.recipient);
  const amounts = rows.map((row) => row.amount);
  const rulingHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint256", "uint256[]", "address[]", "uint256[]"],
    [CONTRACT_ADDRESS, BigInt(payload.vaultId), ids, recipients, amounts],
  ));
  const digest = await deps.escrow.settlementAuthorizationDigest(
    vaultKey(payload.vaultId), rulingHash, payload.baseSettlementIds, recipients, amounts, deadline,
  );
  const authorization = deps.wallet.signingKey.sign(digest).serialized;
  return { rulingHash, authorizationDeadline: deadline, authorization };
}

async function authorizeRefund(payload, deps, { preflight = false } = {}) {
  if (String(payload.escrowAddress).toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) throw new Error("wrong Base escrow");
  const deposit = await deps.escrow.deposits(payload.paymentId);
  if (deposit.refunded) throw new Error("deposit was already refunded");
  if (deposit.vaultId.toLowerCase() !== vaultKey(payload.vaultId).toLowerCase() ||
      deposit.payer.toLowerCase() !== String(payload.payer).toLowerCase() ||
      deposit.amount.toString() !== BigInt(payload.amount).toString()) {
    throw new Error("refund request does not match the Base deposit");
  }
  try {
    const payment = await readFinal("get_payment", [payload.paymentId]);
    if (payment.consumed) throw new Error("finalized GenLayer state has consumed this payment");
    if (!preflight && !payment.refunded) {
      throw new Error("recorded payment must be voided in finalized GenLayer state before refund");
    }
  } catch (error) {
    if (!/no payment recorded/i.test(error.message)) throw error;
  }
  if (preflight) return { approved: true };
  const voided = await readFinal("is_payment_voided", [payload.paymentId]);
  if (!voided) throw new Error("payment must have a finalized GenLayer refund tombstone");
  const deadline = Math.floor(Date.now() / 1000) + MAX_AUTH_SECONDS;
  const digest = await deps.escrow.refundAuthorizationDigest(payload.paymentId, deadline);
  return {
    authorizationDeadline: deadline,
    authorization: deps.wallet.signingKey.sign(digest).serialized,
  };
}

export function createAuthorizerApp(deps = runtime()) {
  const app = express();
  app.use(express.json({ limit: "32kb" }));
  app.get("/health", (_req, res) => res.json({ ok: true, service: "obolus-settlement-authorizer" }));
  app.post("/authorize", async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.status(401).json({ error: "unauthorized" });
      const configured = await deps.escrow.settlementAuthorizer();
      if (configured.toLowerCase() !== deps.wallet.address.toLowerCase()) throw new Error("signer is not the escrow authorizer");
      const result = req.body.action === "REFUND_FAILED_PAYMENT"
        ? await authorizeRefund(req.body, deps)
        : req.body.action === "REFUND_FAILED_PAYMENT_PRECHECK"
          ? await authorizeRefund(req.body, deps, { preflight: true })
          : await authorizeSettlement(req.body, deps);
      res.json(result);
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Fly's private .internal DNS resolves to the machine's IPv6 address.
  // Binding only 0.0.0.0 makes public proxy health checks pass while
  // direct relay-to-authorizer traffic is refused.
  createAuthorizerApp().listen(PORT, "::", () => {
    console.log(`Obolus settlement authorizer listening on ${PORT}`);
  });
}
