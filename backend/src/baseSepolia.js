/**
 * Base Sepolia payment layer.
 *
 * GenLayer (contract.js / genlayerClient.js) is the adjudication layer
 * only — it never escrows or moves real value (see MEMORY.md, "USDC
 * migration"). Real USDC lives in ObolusEscrow
 * (contracts/base/ObolusEscrow.sol) on Base Sepolia. This module is the
 * only place that talks to that contract: turning a GenLayer vault id into
 * the escrow's bytes32 key, and relaying a vault's pending settlements
 * (from GenLayer's get_pending_settlements) exactly once each.
 */
import { ethers } from "ethers";
import { OBOLUS_ESCROW_ABI, ERC20_ABI } from "./lib/escrowAbi.js";

const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const USDC_ADDRESS = process.env.BASE_SEPOLIA_USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const ESCROW_ADDRESS = process.env.OBOLUS_ESCROW_ADDRESS || "";
const RELAYER_PRIVATE_KEY = process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY || "";

let provider = null;
let escrowWithRelayer = null;

function getProvider() {
  if (!provider) provider = new ethers.JsonRpcProvider(RPC_URL);
  return provider;
}

export function isEscrowConfigured() {
  return Boolean(ESCROW_ADDRESS && RELAYER_PRIVATE_KEY);
}

function getRelayerContract() {
  if (!ESCROW_ADDRESS) throw new Error("OBOLUS_ESCROW_ADDRESS is not configured");
  if (!RELAYER_PRIVATE_KEY) throw new Error("BASE_SEPOLIA_RELAYER_PRIVATE_KEY is not configured");
  if (!escrowWithRelayer) {
    const wallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, getProvider());
    escrowWithRelayer = new ethers.Contract(ESCROW_ADDRESS, OBOLUS_ESCROW_ABI, wallet);
  }
  return escrowWithRelayer;
}

function getReadContract() {
  if (!ESCROW_ADDRESS) throw new Error("OBOLUS_ESCROW_ADDRESS is not configured");
  return new ethers.Contract(ESCROW_ADDRESS, OBOLUS_ESCROW_ABI, getProvider());
}

/** GenLayer vault ids are small integers; the escrow contract keys pools
 * by bytes32, so pad the id deterministically the same way on both the
 * backend and the frontend. */
export function vaultIdToBytes32(vaultId) {
  return ethers.zeroPadValue(ethers.toBeHex(BigInt(vaultId)), 32);
}

/** Derive the unique settlementId ObolusEscrow.settle() must be given for
 * one relay batch, from the vault id plus the exact set of GenLayer
 * Settlement ids being pushed. GenLayer settlement ids are a global,
 * never-reused counter (see obolus.py's _record_settlement), so a retried
 * push of the SAME still-pending settlements — e.g. after a Base
 * settle() succeeded but the follow-up mark_settlements_relayed call on
 * GenLayer failed — always reproduces the same settlementId, which the
 * escrow contract's settledIds guard rejects as a replay. A later call
 * covering a different set of (newly pending) settlements naturally
 * derives a different id and is allowed through. */
export function deriveSettlementId(vaultId, settlementIds) {
  const key = vaultIdToBytes32(vaultId);
  const sorted = [...settlementIds].map((id) => BigInt(id)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return ethers.keccak256(
    ethers.solidityPacked(["bytes32", "uint256[]"], [key, sorted])
  );
}

/**
 * Push a vault's still-pending GenLayer settlements onto the Base Sepolia
 * escrow, then return their ids so the caller can confirm them back on
 * GenLayer via mark_settlements_relayed. The escrow's own cumulative-
 * allocation guard (see ObolusEscrow.settle) is the real backstop against
 * over-crediting — this never trusts GenLayer's numbers blindly. The
 * settlementId derived from this exact batch (see deriveSettlementId)
 * makes a retried push of the same still-pending batch a no-op revert on
 * Base rather than a second, double-crediting allocation.
 */
export async function relaySettlementsToEscrow(vaultId, settlements, contractOverride = null) {
  const nonZero = settlements.filter((s) => BigInt(s.amount_usdc || "0") > 0n);
  if (nonZero.length === 0) {
    return { txHash: null, ids: [] };
  }
  // contractOverride lets tests exercise the retry/idempotency logic
  // above against a fake contract, without a live Base Sepolia RPC or
  // relayer key — see backend/test/baseSepolia.test.js.
  const contract = contractOverride || getRelayerContract();
  const key = vaultIdToBytes32(vaultId);
  const ids = nonZero.map((s) => s.id);
  const settlementId = deriveSettlementId(vaultId, ids);
  const recipients = nonZero.map((s) => s.recipient);
  const amounts = nonZero.map((s) => BigInt(s.amount_usdc));

  if (await contract.settledIds(settlementId)) {
    // Same batch was already applied on Base in a prior attempt (the
    // Base tx succeeded but a later step — e.g. mark_settlements_relayed
    // on GenLayer — failed and this got retried). Nothing to allocate
    // twice; the caller still proceeds to (re)confirm on GenLayer.
    return { txHash: null, ids };
  }

  const tx = await contract.settle(key, settlementId, recipients, amounts);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`settle transaction failed for vault ${vaultId}`);
  }
  return { txHash: tx.hash, ids };
}

/**
 * Read back a real, already-mined Base Sepolia transaction and extract
 * the ObolusEscrow.Deposited event it emitted for `vaultId` — the only
 * source of truth the relayer trusts for record_payment on GenLayer.
 * Never trusts a client-supplied amount/payer/paymentId: everything
 * returned here comes from decoding the actual on-chain log, so a direct
 * caller cannot claim a payment_id for a deposit that didn't happen, or
 * for a different vault/amount than what was actually deposited.
 *
 * Throws if the tx isn't mined yet, didn't succeed, wasn't sent to this
 * escrow, or has no Deposited event for `vaultId`.
 */
export async function readConfirmedDeposit(vaultId, txHash) {
  if (!ESCROW_ADDRESS) throw new Error("OBOLUS_ESCROW_ADDRESS is not configured");
  const provider = getProvider();
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) throw new Error(`transaction ${txHash} not found or not yet mined`);
  if (receipt.status !== 1) throw new Error(`transaction ${txHash} did not succeed`);
  if (receipt.to && receipt.to.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) {
    throw new Error(`transaction ${txHash} was not sent to the configured escrow contract`);
  }

  const iface = new ethers.Interface(OBOLUS_ESCROW_ABI);
  const key = vaultIdToBytes32(vaultId);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) continue;
    let parsed;
    try {
      parsed = iface.parseLog(log);
    } catch {
      continue;
    }
    if (parsed?.name !== "Deposited") continue;
    if (parsed.args.vaultId.toLowerCase() !== key.toLowerCase()) continue;
    return {
      vaultId,
      payer: parsed.args.from,
      amount: parsed.args.amount.toString(),
      paymentId: parsed.args.paymentId,
    };
  }
  throw new Error(`transaction ${txHash} has no Deposited event for vault ${vaultId}`);
}

export async function getEscrowPool(vaultId) {
  const contract = getReadContract();
  const key = vaultIdToBytes32(vaultId);
  const [deposited, allocated] = await contract.getPool(key);
  return { deposited: deposited.toString(), allocated: allocated.toString() };
}

export async function getEscrowClaimable(vaultId, address) {
  const contract = getReadContract();
  const key = vaultIdToBytes32(vaultId);
  const amount = await contract.getClaimable(key, address);
  return amount.toString();
}

/** Returns the approve() + fundVault() calldata a connected wallet should
 * send, in order, to back a declared USDC amount for a given vault. */
export function buildFundCalldata(vaultId, amountUnits) {
  if (!ESCROW_ADDRESS) throw new Error("OBOLUS_ESCROW_ADDRESS is not configured");
  const key = vaultIdToBytes32(vaultId);
  const escrowIface = new ethers.Interface(OBOLUS_ESCROW_ABI);
  const erc20Iface = new ethers.Interface(ERC20_ABI);
  return {
    chain: "base-sepolia",
    chainId: 84532,
    usdcAddress: USDC_ADDRESS,
    escrowAddress: ESCROW_ADDRESS,
    amountUnits: amountUnits.toString(),
    steps: [
      {
        label: "Approve USDC",
        to: USDC_ADDRESS,
        data: erc20Iface.encodeFunctionData("approve", [ESCROW_ADDRESS, amountUnits]),
        value: "0x0",
      },
      {
        label: "Deposit into vault pool",
        to: ESCROW_ADDRESS,
        data: escrowIface.encodeFunctionData("fundVault", [key, amountUnits]),
        value: "0x0",
      },
    ],
  };
}

/** Returns the claim() calldata for a vault — self-serve, no relayer
 * involved; any wallet can send this directly once ObolusEscrow shows a
 * nonzero getClaimable(vaultId, wallet). */
export function buildClaimCalldata(vaultId) {
  if (!ESCROW_ADDRESS) throw new Error("OBOLUS_ESCROW_ADDRESS is not configured");
  const key = vaultIdToBytes32(vaultId);
  const escrowIface = new ethers.Interface(OBOLUS_ESCROW_ABI);
  return {
    chain: "base-sepolia",
    chainId: 84532,
    escrowAddress: ESCROW_ADDRESS,
    to: ESCROW_ADDRESS,
    data: escrowIface.encodeFunctionData("claim", [key]),
    value: "0x0",
  };
}

export async function getTotalClaimable(address) {
  const contract = getReadContract();
  const amount = await contract.totalClaimable(address);
  return amount.toString();
}

export async function getWalletUsdcBalance(address) {
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, getProvider());
  const balance = await usdc.balanceOf(address);
  return balance.toString();
}

export const config = {
  rpcUrl: RPC_URL,
  usdcAddress: USDC_ADDRESS,
  escrowAddress: ESCROW_ADDRESS,
};
