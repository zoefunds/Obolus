#!/usr/bin/env node
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { ethers } from "ethers";
import { OBOLUS_ESCROW_ABI } from "../backend/src/lib/escrowAbi.js";

const require = createRequire(import.meta.url);
const solc = require("solc");
const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
const escrowAddress = process.env.OBOLUS_ESCROW_ADDRESS;
const genlayerAddress = process.env.VDE_CONTRACT_ADDRESS;
if (!escrowAddress || !genlayerAddress) throw new Error("deployment addresses are not configured");

const source = await readFile(new URL("../contracts/base/ObolusEscrow.sol", import.meta.url), "utf8");
const input = {
  language: "Solidity",
  sources: { "ObolusEscrow.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((item) => item.severity === "error");
if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
const artifact = output.contracts["ObolusEscrow.sol"].ObolusEscrow.evm.deployedBytecode;
const localRuntime = Buffer.from(artifact.object, "hex");
const deployedRuntime = Buffer.from((await provider.getCode(escrowAddress)).slice(2), "hex");
if (localRuntime.length !== deployedRuntime.length) throw new Error("Base runtime bytecode length mismatch");
for (const refs of Object.values(artifact.immutableReferences || {})) {
  for (const { start, length } of refs) {
    localRuntime.fill(0, start, start + length);
    deployedRuntime.fill(0, start, start + length);
  }
}
const localHash = ethers.keccak256(localRuntime);
const deployedHash = ethers.keccak256(deployedRuntime);
if (localHash !== deployedHash) throw new Error("Base deployed runtime does not match corrected Solidity source");

const glSource = await readFile(new URL("../contracts/obolus.py", import.meta.url));
const response = await fetch("https://studio.genlayer.com/api", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "gen_getContractCode", params: [genlayerAddress] }),
});
const rpc = await response.json();
if (!rpc.result) throw new Error(`gen_getContractCode failed: ${JSON.stringify(rpc.error)}`);
const deployedSource = Buffer.from(rpc.result, "base64");
if (!deployedSource.equals(glSource)) throw new Error("StudioNet code does not exactly match contracts/obolus.py");

const escrow = new ethers.Contract(escrowAddress, OBOLUS_ESCROW_ABI, provider);
console.log(JSON.stringify({
  genlayer: {
    address: genlayerAddress,
    exactSourceMatch: true,
    sourceSha256: ethers.sha256(glSource),
  },
  baseSepolia: {
    address: escrowAddress,
    runtimeMatchAfterImmutableMask: true,
    maskedRuntimeHash: localHash,
    owner: await escrow.owner(),
    relayer: await escrow.relayer(),
    settlementAuthorizer: await escrow.settlementAuthorizer(),
  },
}, null, 2));
