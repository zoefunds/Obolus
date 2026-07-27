// Every value-carrying / state-changing call in the app funnels through
// here, using the connected wallet's own signing client
// (lib/genlayerBrowser.js) — never a server-held key. Reads still go
// through the backend (api.js) since they're cheap, cached, and need no
// signature.
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

export async function write(glClient, functionName, args = [], valueWei = 0n) {
  if (!glClient) {
    throw new Error("Connect a wallet before submitting a transaction.");
  }
  const address = await getContractAddress();
  const receipt = await walletWriteContract(glClient, {
    address,
    functionName,
    args,
    value: typeof valueWei === "bigint" ? valueWei : BigInt(valueWei || 0),
  });
  return toPlain(receipt);
}
