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

export async function readMethod(functionName, args = [], { finalized = false } = {}) {
  const result = await client.readContract({
    address: needAddress(),
    functionName,
    args,
    transactionHashVariant: finalized ? "latest-final" : "latest-nonfinal",
  });
  return toPlain(result);
}

export function finalizedExecutionStatus(receipt) {
  const rawStatus = receipt?.statusName ?? receipt?.status ?? receipt?.consensusStatus;
  const status = String(rawStatus === 7 || rawStatus === "7" ? "FINALIZED" : rawStatus || "").toUpperCase();
  const leaderReceipts = receipt?.consensus_data?.leader_receipt ?? receipt?.consensusData?.leaderReceipt ?? [];
  const leader = Array.isArray(leaderReceipts) ? leaderReceipts[0] : leaderReceipts;
  const execution = String(leader?.execution_result ?? leader?.executionResult ?? "").toUpperCase();
  const resultStatus = String(leader?.result?.status ?? "").toLowerCase();
  return {
    status,
    execution,
    resultStatus,
    ok: status === "FINALIZED" && execution === "SUCCESS" && resultStatus === "return",
  };
}

// The contract is value-free in the split-chain design (see docs/SECURITY_REMEDIATION.md):
// every write takes declared *_usdc amounts as plain arguments, never
// attached native value, so writeMethod no longer needs a `value` param.
export async function writeMethod(functionName, args = [], { finality = "FINALIZED" } = {}) {
  const account = requireAccount();
  const txHash = await client.writeContract({
    address: needAddress(),
    functionName,
    args,
    account,
  });
  // Default every write to FINALIZED: payment consumption, beneficiary
  // changes, and evidence bookkeeping can all affect later Base value.
  // No caller should treat provisional ACCEPTED state as durable.
  // interval/retries mirror confirmed-working values from a prior
  // StudioNet integration, widened for resolve_claim's longer nondet round
  // (evidence fetch + LLM verdict + validator consensus).
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    status: finality,
    interval: 4000,
    retries: finality === "FINALIZED" ? 900 : 90,
    fullTransaction: finality === "FINALIZED",
  });
  const plainReceipt = toPlain(receipt);
  if (finality === "FINALIZED") {
    const verified = finalizedExecutionStatus(plainReceipt);
    if (!verified.ok) {
      throw new Error(
        `GenLayer transaction ${txHash} did not finalize with successful GenVM execution ` +
        `(status: ${verified.status || "UNKNOWN"}, execution: ${verified.execution || "UNKNOWN"}, result: ${verified.resultStatus || "UNKNOWN"})`,
      );
    }
  }
  return { txHash, receipt: plainReceipt };
}
