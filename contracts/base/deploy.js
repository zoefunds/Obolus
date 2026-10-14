#!/usr/bin/env node
/**
 * Deploys ObolusEscrow.sol to Base Sepolia.
 *
 * Reads everything from environment variables — NEVER pass a private key
 * as a CLI argument or paste one into chat/logs. Put it in a local .env
 * (gitignored) or your shell's secret-loaded env, then run:
 *
 *   DEPLOYER_PRIVATE_KEY=... \
 *   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
 *   BASE_SEPOLIA_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e \
 *   RELAYER_ADDRESS=0x... \
 *   SETTLEMENT_AUTHORIZER_ADDRESS=0x... \
 *   node contracts/base/deploy.js
 *
 * Requires: npm i -D ethers solc  (in whichever package.json runs this from)
 */
const fs = require("fs");
const path = require("path");
const solc = require("solc");
const { ethers } = require("ethers");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

function compile() {
  const sourcePath = path.join(__dirname, "ObolusEscrow.sol");
  const source = fs.readFileSync(sourcePath, "utf8");
  const input = {
    language: "Solidity",
    sources: { "ObolusEscrow.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length > 0) {
    errors.forEach((e) => console.error(e.formattedMessage));
    process.exit(1);
  }
  const contract = output.contracts["ObolusEscrow.sol"]["ObolusEscrow"];
  return { abi: contract.abi, bytecode: contract.evm.bytecode.object };
}

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY || requireEnv("BASE_SEPOLIA_RELAYER_PRIVATE_KEY");
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  const usdcAddress =
    process.env.BASE_SEPOLIA_USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const relayerAddress = requireEnv("RELAYER_ADDRESS");
  const authorizerAddress = requireEnv("SETTLEMENT_AUTHORIZER_ADDRESS");

  const { abi, bytecode } = compile();

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`Deploying from ${wallet.address} to ${rpcUrl} ...`);

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  if (relayerAddress.toLowerCase() === authorizerAddress.toLowerCase()) {
    throw new Error("RELAYER_ADDRESS and SETTLEMENT_AUTHORIZER_ADDRESS must be different keys");
  }
  const contract = await factory.deploy(usdcAddress, relayerAddress, authorizerAddress);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deploymentTx = contract.deploymentTransaction();
  const receipt = await deploymentTx.wait();
  console.log("ObolusEscrow deployed at:", address);
  console.log("Deployment transaction:", deploymentTx.hash);
  console.log("Deployment block:", receipt.blockNumber);
  console.log("\nSet these in backend env / Fly secrets:");
  console.log(`OBOLUS_ESCROW_ADDRESS=${address}`);
  console.log(`OBOLUS_ESCROW_DEPLOY_BLOCK=${receipt.blockNumber}`);
  console.log(`BASE_SEPOLIA_USDC_ADDRESS=${usdcAddress}`);

  const envPath = path.resolve(__dirname, "../..", ".env");
  if (fs.existsSync(envPath)) {
    let env = fs.readFileSync(envPath, "utf8");
    const setValue = (key, value) => {
      const line = `${key}=${value}`;
      env = new RegExp(`^${key}=.*$`, "m").test(env)
        ? env.replace(new RegExp(`^${key}=.*$`, "m"), line)
        : `${env.replace(/\n?$/, "\n")}${line}\n`;
    };
    setValue("OBOLUS_ESCROW_ADDRESS", address);
    setValue("OBOLUS_ESCROW_DEPLOY_BLOCK", receipt.blockNumber);
    fs.writeFileSync(envPath, env);
    console.log(`Updated ${envPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
