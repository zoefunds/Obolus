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
import { ethers } from "ethers";
import { OBOLUS_ESCROW_ABI } from "../src/lib/escrowAbi.js";
import {
  deriveSettlementId,
  findConfirmedDeposit,
  readAllSettlementCandidates,
  refundIntentMessage,
  relaySettlementsToEscrow,
  verifyRefundIntent,
  vaultIdToBytes32,
} from "../src/baseSepolia.js";

const ESCROW_ADDRESS = "0x642C8f4De6302D06fC0620efE571dFd69DF94CEA";
const PAYER = "0x6f0b4ce7a1872db132b2f6b7743defb30eba698a";
const SMART_ACCOUNT = "0xdb9b1e94b5b69df7e401ddbede43491141047db3";
const REFUND_ESCROW = "0x642C8f4De6302D06fC0620efE571dFd69DF94CEA";

function fakeContract() {
  const state = { settledIds: new Set(), settleCalls: [], deliveries: new Map() };
  return {
    state,
    filters: { SettlementApplied: (id) => ({ id }) },
    queryFilter: async (filter) => state.deliveries.has(filter.id)
      ? [{ transactionHash: state.deliveries.get(filter.id) }]
      : [],
    settledIds: async (id) => state.settledIds.has(id),
    settle: async (vaultKey, rulingHash, settlementIds, recipients, amounts) => {
      state.settleCalls.push({ vaultKey, rulingHash, settlementIds, recipients, amounts });
      const hash = `0x${String(state.settleCalls.length).padStart(64, "0")}`;
      settlementIds.forEach((id) => {
        state.settledIds.add(id);
        state.deliveries.set(id, hash);
      });
      return {
        hash,
        wait: async () => ({ status: 1 }),
      };
    },
  };
}

const fakeAuthorize = async () => ({
  rulingHash: ethers.keccak256("0xabcd"),
  authorizationDeadline: String(Math.floor(Date.now() / 1000) + 3600),
  authorization: `0x${"11".repeat(65)}`,
});

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

test("failed-payment refund intent must be signed by the original payer", async () => {
  const payer = new ethers.Wallet(`0x${"11".repeat(32)}`);
  const attacker = new ethers.Wallet(`0x${"22".repeat(32)}`);
  const request = {
    vaultId: 7,
    txHash: `0x${"aa".repeat(32)}`,
    paymentId: `0x${"bb".repeat(32)}`,
  };
  const deposit = { payer: payer.address, paymentId: request.paymentId, amount: "100" };
  const message = refundIntentMessage({ ...request, escrowAddress: REFUND_ESCROW });
  const payerSignature = await payer.signMessage(message);
  assert.equal(
    verifyRefundIntent(deposit, { ...request, payerSignature }, REFUND_ESCROW),
    payer.address,
  );
  const attackerSignature = await attacker.signMessage(message);
  assert.throws(
    () => verifyRefundIntent(deposit, { ...request, payerSignature: attackerSignature }, REFUND_ESCROW),
    /not signed by the original payer/,
  );
});

test("refund intent signature is bound to vault, deposit tx, payment id, chain, and escrow", async () => {
  const payer = new ethers.Wallet(`0x${"33".repeat(32)}`);
  const request = {
    vaultId: 7,
    txHash: `0x${"aa".repeat(32)}`,
    paymentId: `0x${"bb".repeat(32)}`,
  };
  const deposit = { payer: payer.address, paymentId: request.paymentId, amount: "100" };
  const signature = await payer.signMessage(refundIntentMessage({ ...request, escrowAddress: REFUND_ESCROW }));
  assert.throws(
    () => verifyRefundIntent(deposit, { ...request, vaultId: 8, payerSignature: signature }, REFUND_ESCROW),
    /not signed by the original payer/,
  );
  assert.throws(
    () => verifyRefundIntent(deposit, { ...request, txHash: `0x${"cc".repeat(32)}`, payerSignature: signature }, REFUND_ESCROW),
    /not signed by the original payer/,
  );
  assert.throws(
    () => verifyRefundIntent(deposit, { ...request, paymentId: `0x${"dd".repeat(32)}`, payerSignature: signature }, REFUND_ESCROW),
    /paymentId does not match/,
  );
});

test("relaySettlementsToEscrow calls settle exactly once for a fresh batch", async () => {
  const contract = fakeContract();
  const settlements = [
    { id: 1, recipient: "0x0000000000000000000000000000000000000001", amount_usdc: "100" },
    { id: 2, recipient: "0x0000000000000000000000000000000000000002", amount_usdc: "50" },
  ];
  const result = await relaySettlementsToEscrow(7, settlements, contract, fakeAuthorize);
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

  const first = await relaySettlementsToEscrow(3, settlements, contract, fakeAuthorize);
  assert.equal(contract.state.settleCalls.length, 1);
  assert.ok(first.txHash);

  // Retry: same vault, same still-pending settlement rows (GenLayer never
  // got to mark them relayed, so get_pending_settlements would offer the
  // identical set again in production).
  const retry = await relaySettlementsToEscrow(3, settlements, contract, fakeAuthorize);
  assert.equal(contract.state.settleCalls.length, 1, "settle() must not be called a second time for the same batch");
  assert.equal(retry.txHash, null, "no new Base tx for an already-applied batch");
  assert.deepEqual(retry.ids, [10], "ids are still returned so the caller can retry the GenLayer mark");
  assert.deepEqual(retry.acknowledgments, [{ txHash: first.txHash, ids: [10] }]);
});

test("a genuinely NEW batch for the same vault is still relayed normally", async () => {
  const contract = fakeContract();
  await relaySettlementsToEscrow(3, [{ id: 1, recipient: "0x0000000000000000000000000000000000000001", amount_usdc: "5" }], contract, fakeAuthorize);
  assert.equal(contract.state.settleCalls.length, 1);

  await relaySettlementsToEscrow(3, [{ id: 2, recipient: "0x0000000000000000000000000000000000000002", amount_usdc: "5" }], contract, fakeAuthorize);
  assert.equal(contract.state.settleCalls.length, 2, "a different settlement set derives a different settlementId and is allowed through");
});

test("partially overlapping batches reconcile delivered rows and settle only missing entitlements", async () => {
  const contract = fakeContract();
  const oneTwo = [
    { id: 1, recipient: "0x0000000000000000000000000000000000000001", amount_usdc: "5" },
    { id: 2, recipient: "0x0000000000000000000000000000000000000002", amount_usdc: "5" },
  ];
  await relaySettlementsToEscrow(3, oneTwo, contract, fakeAuthorize);
  const mixed = await relaySettlementsToEscrow(
    3,
    [oneTwo[1], { id: 3, recipient: "0x0000000000000000000000000000000000000003", amount_usdc: "5" }],
    contract,
    async (payload) => {
      assert.deepEqual(payload.settlementIds, [3]);
      return fakeAuthorize();
    },
  );
  assert.equal(contract.state.settleCalls.length, 2);
  assert.deepEqual(contract.state.settleCalls[1].recipients, ["0x0000000000000000000000000000000000000003"]);
  assert.deepEqual(mixed.acknowledgments.map((entry) => entry.ids), [[2], [3]]);
});

test("complete finalized candidate paging ignores a forged relayed flag", async () => {
  const pages = [
    [{ id: 1, relayed: true }, { id: 2, relayed: false }],
    [{ id: 3, relayed: true }],
  ];
  const calls = [];
  const rows = await readAllSettlementCandidates(async (method, args, options) => {
    calls.push({ method, args, options });
    return pages[calls.length - 1] || [];
  }, 9, 2);
  assert.deepEqual(rows.map((row) => row.id), [1, 2, 3]);
  assert.equal(calls[0].method, "get_settlements_page");
  assert.deepEqual(calls[0].options, { finalized: true });
});

test("failed or non-final GenLayer authorization never reaches Base settle", async () => {
  const contract = fakeContract();
  const settlements = [
    { id: 44, recipient: "0x0000000000000000000000000000000000000044", amount_usdc: "25" },
  ];
  await assert.rejects(
    relaySettlementsToEscrow(9, settlements, contract, async (payload) => {
      assert.equal(payload.requiredGenLayerStatus, "FINALIZED");
      throw new Error("ruling is ACCEPTED but not FINALIZED");
    }),
    /not FINALIZED/
  );
  assert.equal(contract.state.settleCalls.length, 0);
});

test("an all-zero settlement batch never touches the contract", async () => {
  const contract = fakeContract();
  const result = await relaySettlementsToEscrow(3, [{ id: 1, recipient: "0x1", amount_usdc: "0" }], contract);
  assert.equal(contract.state.settleCalls.length, 0);
  assert.deepEqual(result, { txHash: null, ids: [] });
});

test("readConfirmedDeposit accepts an escrow event nested in a smart-account transaction", async () => {
  // Smart-account / account-abstraction transactions have receipt.to set to
  // the account contract, not the downstream escrow contract. The escrow's
  // own authenticated Deposited log remains the source of truth.
  const iface = new ethers.Interface(OBOLUS_ESCROW_ABI);
  const vaultId = 7;
  const amount = 2_000_000n;
  const paymentId = ethers.keccak256("0x1234");
  const encoded = iface.encodeEventLog(iface.getEvent("Deposited"), [vaultIdToBytes32(vaultId), PAYER, amount, paymentId]);
  const receipt = {
    status: 1,
    to: SMART_ACCOUNT,
    logs: [{ address: ESCROW_ADDRESS, topics: encoded.topics, data: encoded.data }],
  };

  const deposit = findConfirmedDeposit(vaultId, receipt, ESCROW_ADDRESS);
  assert.equal(deposit.vaultId, vaultId);
  assert.equal(deposit.payer.toLowerCase(), PAYER);
  assert.equal(deposit.amount, String(amount));
  assert.equal(deposit.paymentId, paymentId);
});

test("readConfirmedDeposit still rejects a log that was not emitted by the configured escrow", async () => {
  const receipt = {
    status: 1,
    to: SMART_ACCOUNT,
    logs: [],
  };

  assert.throws(
    () => findConfirmedDeposit(7, receipt, ESCROW_ADDRESS),
    /has no Deposited event for vault 7/
  );
});
