// Relay-layer tests for backend/src/baseSepolia.js — specifically the
// Base-settlement replay guard described in the payment-binding fix (see
// contracts/obolus.py's Payment/_consume_payment and
// ObolusEscrow.sol's settledIds). No live RPC/relayer key needed: a fake
// ethers-shaped contract is injected via relaySettlementsToEscrow's
// contractOverride param.
//
// Run: node --test backend/test/

import test from "node:test";
import assert from "node:assert/strict";
import { deriveSettlementId, relaySettlementsToEscrow } from "../src/baseSepolia.js";

function fakeContract() {
  const state = { settledIds: new Set(), settleCalls: [] };
  return {
    state,
    settledIds: async (id) => state.settledIds.has(id),
    settle: async (vaultKey, settlementId, recipients, amounts) => {
      state.settleCalls.push({ vaultKey, settlementId, recipients, amounts });
      state.settledIds.add(settlementId);
      return {
        hash: `0xtx${state.settleCalls.length}`,
        wait: async () => ({ status: 1 }),
      };
    },
  };
}

test("deriveSettlementId is deterministic and order-independent", () => {
  const a = deriveSettlementId(5, [3, 1, 2]);
  const b = deriveSettlementId(5, [1, 2, 3]);
  const c = deriveSettlementId(5, [2, 3, 1]);
  assert.equal(a, b);
  assert.equal(b, c);
});

test("deriveSettlementId differs across vaults and settlement sets", () => {
  const a = deriveSettlementId(5, [1, 2]);
  const b = deriveSettlementId(6, [1, 2]);
  const c = deriveSettlementId(5, [1, 3]);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("relaySettlementsToEscrow calls settle exactly once for a fresh batch", async () => {
  const contract = fakeContract();
  const settlements = [
    { id: 1, recipient: "0x0000000000000000000000000000000000000001", amount_usdc: "100" },
    { id: 2, recipient: "0x0000000000000000000000000000000000000002", amount_usdc: "50" },
  ];
  const result = await relaySettlementsToEscrow(7, settlements, contract);
  assert.equal(contract.state.settleCalls.length, 1);
  assert.ok(result.txHash);
  assert.deepEqual(result.ids, [1, 2]);
});

test("a retried relay of the SAME batch after Base already succeeded never double-allocates", async () => {
  // Models exactly the "Base success, then failed GenLayer marking"
  // scenario: relaySettlementsToEscrow succeeds and credits Base, but the
  // caller's follow-up mark_settlements_relayed on GenLayer throws (network
  // blip) — the same still-"pending" settlements get relayed again on
  // retry, with the identical settlementId this batch always derives to.
  const contract = fakeContract();
  const settlements = [
    { id: 10, recipient: "0x0000000000000000000000000000000000000009", amount_usdc: "1000" },
  ];

  const first = await relaySettlementsToEscrow(3, settlements, contract);
  assert.equal(contract.state.settleCalls.length, 1);
  assert.ok(first.txHash);

  // Retry: same vault, same still-pending settlement rows (GenLayer never
  // got to mark them relayed, so get_pending_settlements would offer the
  // identical set again in production).
  const retry = await relaySettlementsToEscrow(3, settlements, contract);
  assert.equal(contract.state.settleCalls.length, 1, "settle() must not be called a second time for the same batch");
  assert.equal(retry.txHash, null, "no new Base tx for an already-applied batch");
  assert.deepEqual(retry.ids, [10], "ids are still returned so the caller can retry the GenLayer mark");
});

test("a genuinely NEW batch for the same vault is still relayed normally", async () => {
  const contract = fakeContract();
  await relaySettlementsToEscrow(3, [{ id: 1, recipient: "0x0000000000000000000000000000000000000001", amount_usdc: "5" }], contract);
  assert.equal(contract.state.settleCalls.length, 1);

  await relaySettlementsToEscrow(3, [{ id: 2, recipient: "0x0000000000000000000000000000000000000002", amount_usdc: "5" }], contract);
  assert.equal(contract.state.settleCalls.length, 2, "a different settlement set derives a different settlementId and is allowed through");
});

test("an all-zero settlement batch never touches the contract", async () => {
  const contract = fakeContract();
  const result = await relaySettlementsToEscrow(3, [{ id: 1, recipient: "0x1", amount_usdc: "0" }], contract);
  assert.equal(contract.state.settleCalls.length, 0);
  assert.deepEqual(result, { txHash: null, ids: [] });
});
