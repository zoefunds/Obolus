import test from "node:test";
import assert from "node:assert/strict";
import { prepareFailedPaymentRefund } from "../src/routes/vaults.js";

const request = {
  vaultId: 7,
  txHash: `0x${"aa".repeat(32)}`,
  paymentId: `0x${"bb".repeat(32)}`,
  payerSignature: `0x${"cc".repeat(65)}`,
};
const deposit = { paymentId: request.paymentId, payer: "0x0000000000000000000000000000000000000001", amount: "100" };

function dependencies(events, state = { voided: false }, overrides = {}) {
  return {
    readDeposit: async () => { events.push("read-deposit"); return deposit; },
    verifyIntent: () => { events.push("verify-payer"); },
    preflight: async () => { events.push("authorizer-preflight"); },
    isVoided: async () => { events.push("read-tombstone"); return state.voided; },
    voidPayment: async () => { events.push("write-tombstone"); state.voided = true; },
    buildCalldata: async () => { events.push("final-authorization"); return { data: "0x1234" }; },
    ...overrides,
  };
}

test("refund rejects a non-payer before preflight or irreversible mutation", async () => {
  const events = [];
  const deps = dependencies(events, undefined, {
    verifyIntent: () => { events.push("verify-payer"); throw new Error("not original payer"); },
  });
  await assert.rejects(prepareFailedPaymentRefund(request, deps), /not original payer/);
  assert.deepEqual(events, ["read-deposit", "verify-payer"]);
});

test("refund authorizer preflight failure occurs before the tombstone", async () => {
  const events = [];
  const deps = dependencies(events, undefined, {
    preflight: async () => { events.push("authorizer-preflight"); throw new Error("consumed payment"); },
  });
  await assert.rejects(prepareFailedPaymentRefund(request, deps), /consumed payment/);
  assert.deepEqual(events, ["read-deposit", "verify-payer", "authorizer-preflight"]);
});

test("interruption after tombstone is recoverable without a second mutation", async () => {
  const events = [];
  const state = { voided: false };
  let first = true;
  const deps = dependencies(events, state, {
    buildCalldata: async () => {
      events.push("final-authorization");
      if (first) { first = false; throw new Error("transient authorizer outage"); }
      return { data: "0x1234" };
    },
  });
  await assert.rejects(prepareFailedPaymentRefund(request, deps), /transient authorizer outage/);
  assert.equal(state.voided, true);
  const result = await prepareFailedPaymentRefund(request, deps);
  assert.deepEqual(result, { data: "0x1234" });
  assert.equal(events.filter((event) => event === "write-tombstone").length, 1);
  assert.equal(events.filter((event) => event === "final-authorization").length, 2);
});
