import test from "node:test";
import assert from "node:assert/strict";
import { assertExactFinalizedSettlement, individualSettlementId } from "../src/authorizer.js";

const A = "0x0000000000000000000000000000000000000001";
const B = "0x0000000000000000000000000000000000000002";

function payload() {
  return {
    vaultId: 7,
    settlementIds: [11, 12],
    baseSettlementIds: [individualSettlementId(7, 11), individualSettlementId(7, 12)],
    recipients: [A, B],
    amounts: ["100", "200"],
  };
}

const finalized = [
  { id: 11, recipient: A, amount_usdc: "100" },
  { id: 12, recipient: B, amount_usdc: "200" },
];

test("authorizer accepts only an exact finalized settlement snapshot", () => {
  assert.equal(assertExactFinalizedSettlement(payload(), finalized).length, 2);
});

test("authorizer rejects recipient or amount substitution", () => {
  const badRecipient = payload();
  badRecipient.recipients[0] = B;
  assert.throws(() => assertExactFinalizedSettlement(badRecipient, finalized), /does not exactly match/);
  const badAmount = payload();
  badAmount.amounts[1] = "201";
  assert.throws(() => assertExactFinalizedSettlement(badAmount, finalized), /does not exactly match/);
});

test("authorizer rejects caller-supplied replay ids", () => {
  const bad = payload();
  bad.baseSettlementIds[0] = individualSettlementId(7, 99);
  assert.throws(() => assertExactFinalizedSettlement(bad, finalized), /replay ids/);
});

test("authorizer rejects omitted or reordered finalized entitlements", () => {
  const omitted = payload();
  omitted.settlementIds.pop();
  omitted.baseSettlementIds.pop();
  omitted.recipients.pop();
  omitted.amounts.pop();
  assert.throws(() => assertExactFinalizedSettlement(omitted, finalized), /does not exactly match/);
  assert.throws(() => assertExactFinalizedSettlement(payload(), [...finalized].reverse()), /does not exactly match/);
});
