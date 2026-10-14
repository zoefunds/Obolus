import test from "node:test";
import assert from "node:assert/strict";
import { finalizedExecutionStatus } from "../src/contract.js";

function receipt({ status = 7, execution = "SUCCESS", result = "return" } = {}) {
  return {
    status,
    consensus_data: {
      leader_receipt: [{ execution_result: execution, result: { status: result } }],
    },
  };
}

test("numeric StudioNet status 7 is authoritative FINALIZED", () => {
  assert.deepEqual(finalizedExecutionStatus(receipt()), {
    status: "FINALIZED",
    execution: "SUCCESS",
    resultStatus: "return",
    ok: true,
  });
});

test("finalized consensus does not hide failed GenVM execution", () => {
  assert.equal(finalizedExecutionStatus(receipt({ execution: "ERROR", result: "error" })).ok, false);
  assert.equal(finalizedExecutionStatus(receipt({ status: 5 })).ok, false);
  assert.equal(finalizedExecutionStatus({ statusName: "FINALIZED" }).ok, false);
});
