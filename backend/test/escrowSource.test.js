import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const source = fs.readFileSync(path.resolve(process.cwd(), "../contracts/base/ObolusEscrow.sol"), "utf8");
const input = {
  language: "Solidity",
  sources: { "ObolusEscrow.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((entry) => entry.severity === "error");
const artifact = output.contracts?.["ObolusEscrow.sol"]?.ObolusEscrow;

test("Base escrow compiles without Solidity errors", () => {
  assert.deepEqual(errors, [], errors.map((entry) => entry.formattedMessage).join("\n"));
  assert.ok(artifact?.evm?.bytecode?.object);
});

test("Base escrow exposes no owner withdrawal and requires authorized recovery", () => {
  const functions = artifact.abi.filter((entry) => entry.type === "function").map((entry) => entry.name);
  assert.ok(!functions.includes("withdrawUnallocated"));
  assert.ok(functions.includes("refundFailedPayment"));
  assert.ok(!functions.includes("setSettlementAuthorizer"));
  assert.ok(functions.includes("rotateSettlementAuthorizer"));
  const settle = artifact.abi.find((entry) => entry.type === "function" && entry.name === "settle");
  assert.deepEqual(settle.inputs.map((input) => input.name), [
    "vaultId", "rulingHash", "settlementIds", "recipients", "amounts", "authorizationDeadline", "authorization",
  ]);
});
