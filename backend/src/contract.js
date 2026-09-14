import { client, CONTRACT_ADDRESS, requireAccount } from "./genlayerClient.js";

function needAddress() {
  if (!CONTRACT_ADDRESS) {
    const err = new Error("VDE_CONTRACT_ADDRESS is not configured on this server.");
    err.status = 503;
    throw err;
  }
  return CONTRACT_ADDRESS;
}

// genlayer-js's calldata decoder returns Python dicts as JS Map instances
// (node_modules/genlayer-js/src/abi/calldata/decoder.ts), not plain
// objects — Express's res.json() silently serializes a bare Map to `{}`
// (Map has no own enumerable string keys), so every dict-returning view
// (get_vault, get_config, get_platform_stats, ...) would otherwise come
// back empty. Recursively normalize Maps (and bigints, which JSON.stringify
// rejects outright) before anything reaches res.json().
export function toPlain(value) {
  if (value instanceof Map) {
    const obj = {};
    for (const [k, v] of value) obj[k] = toPlain(v);
    return obj;
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "bigint") return value.toString();
  return value;
}

export async function readMethod(functionName, args = []) {
  const result = await client.readContract({
    address: needAddress(),
    functionName,
    args,
  });
  return toPlain(result);
}

// The contract is value-free since the USDC migration (see MEMORY.md):
// every write takes declared *_usdc amounts as plain arguments, never
// attached native value, so writeMethod no longer needs a `value` param.
export async function writeMethod(functionName, args = []) {
  const account = requireAccount();
  const txHash = await client.writeContract({
    address: needAddress(),
    functionName,
    args,
    account,
  });
  // Wait for ACCEPTED, not FINALIZED — FINALIZED only lands after
  // StudioNet's appeal window closes, which is far longer than needed to
  // know the write executed and read back its result; waiting for it is
  // what made writes look like they "weren't going through" (the request
  // just kept polling long after the tx had actually succeeded).
  // interval/retries mirror confirmed-working values from a prior
  // StudioNet integration, widened for resolve_claim's longer nondet round
  // (evidence fetch + LLM verdict + validator consensus).
  const receipt = await client.waitForTransactionReceipt({ hash: txHash, status: "ACCEPTED", interval: 4000, retries: 90 });
  return { txHash, receipt: toPlain(receipt) };
}
