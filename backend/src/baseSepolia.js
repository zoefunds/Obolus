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

/**
 * Push a vault's still-pending GenLayer settlements onto the Base Sepolia
 * escrow, then return their ids so the caller can confirm them back on
 * GenLayer via mark_settlements_relayed. The escrow's own cumulative-
 * allocation guard (see ObolusEscrow.settle) is the real backstop against
 * over-crediting — this never trusts GenLayer's numbers blindly.
 */
export async function relaySettlementsToEscrow(vaultId, settlements) {
  const nonZero = settlements.filter((s) => BigInt(s.amount_usdc || "0") > 0n);
  if (nonZero.length === 0) {
    return { txHash: null, ids: [] };
  }
  const contract = getRelayerContract();
  const key = vaultIdToBytes32(vaultId);
  const recipients = nonZero.map((s) => s.recipient);
  const amounts = nonZero.map((s) => BigInt(s.amount_usdc));

  const tx = await contract.settle(key, recipients, amounts);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`settle transaction failed for vault ${vaultId}`);
  }
  return { txHash: tx.hash, ids: nonZero.map((s) => s.id) };
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
