// Every value-carrying / state-changing call in the app funnels through
// here, using the connected wallet's own signing client
// (lib/genlayerBrowser.js) — never a server-held key. Reads still go
// through the backend (api.js) since they're cheap, cached, and need no
// signature.
import { abi } from "genlayer-js";
import { walletWriteContract } from "./genlayerBrowser.js";

let contractAddressPromise = null;

export function getContractAddress() {
  if (!contractAddressPromise) {
    contractAddressPromise = fetch("/api/platform/network")
      .then((r) => r.json())
      .then((data) => {
        if (!data.contractAddress) throw new Error("Backend has no VDE_CONTRACT_ADDRESS configured yet.");
        return data.contractAddress;
      });
  }
  return contractAddressPromise;
}

// genlayer-js's calldata decoder returns dicts as Map instances (see
// backend/src/contract.js's toPlain for the fuller explanation) — same
// normalization needed here since the wallet client decodes receipts
// itself, independently of the backend.
function toPlain(value) {
  if (value instanceof Map) {
    const obj = {};
    for (const [k, v] of value) obj[k] = toPlain(v);
    return obj;
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "bigint") return value.toString();
  return value;
}

// A write's actual return value (e.g. create_vault's new vault id,
// resolve_claim's verdict dict) is NOT the top-level `receipt.result`
// (that's just a numeric status code, e.g. 6 for MAJORITY_AGREE) and NOT
// `receipt.data` (that's the call's own calldata, not its result). It's
// buried in consensus_data.leader_receipt[*].result.payload.raw — raw
// GenVM calldata bytes that only exist on the receipt when
// waitForTransactionReceipt was called with fullTransaction: true (see
// genlayerBrowser.js) — decoded here with genlayer-js's own calldata
// codec, the same one the backend's readContract path uses internally.
function extractReturnValue(receipt) {
  const leaderReceipt = receipt?.consensus_data?.leader_receipt;
  const first = Array.isArray(leaderReceipt) ? leaderReceipt[0] : leaderReceipt;
  const raw = first?.result?.payload?.raw;
  if (!raw) return undefined;
  try {
    return toPlain(abi.calldata.decode(new Uint8Array(raw)));
  } catch {
    return undefined;
  }
}

// GenLayer writes are value-free since the USDC migration (see
// MEMORY.md) — every declared amount (vault deposits, bonds) is now a
// plain integer argument, and the real USDC moves separately on Base
// Sepolia via lib/baseSepoliaWallet.js. This never sends a `value`.
//
// Returns { ...receipt, resultValue }, where resultValue is the call's
// actual decoded return value (undefined if it returned nothing).
export async function write(glClient, functionName, args = []) {
  if (!glClient) {
    throw new Error("Connect a wallet before submitting a transaction.");
  }
  const address = await getContractAddress();
  const receipt = await walletWriteContract(glClient, { address, functionName, args });
  const resultValue = extractReturnValue(receipt);
  return { ...toPlain(receipt), resultValue };
}
