#!/usr/bin/env node
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { ethers } from "ethers";
import { readMethod, writeMethod } from "../backend/src/contract.js";
import { OBOLUS_ESCROW_ABI, ERC20_ABI } from "../backend/src/lib/escrowAbi.js";
import { vaultIdToBytes32 } from "../backend/src/baseSepolia.js";

const STATE_FILE = new URL("../.e2e-funded-state.json", import.meta.url);
const BENEFICIARY_KEY_FILE = new URL("../.e2e-beneficiary-key", import.meta.url);
const RPC = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const ESCROW = process.env.OBOLUS_ESCROW_ADDRESS;
const USDC = process.env.BASE_SEPOLIA_USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY;
const AMOUNT = 100_000n; // 0.10 USDC
const EVIDENCE = "https://web.archive.org/web/20241230000457/https://www.cartercenter.org/news/pr/2024/statement-on-president-jimmy-carter-122924.html";

if (!ESCROW || !PRIVATE_KEY) throw new Error("Base escrow/key configuration is incomplete");
const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const escrow = new ethers.Contract(ESCROW, OBOLUS_ESCROW_ABI, wallet);
const usdc = new ethers.Contract(USDC, ERC20_ABI, wallet);

const json = (value) => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2);
async function save(state) { await writeFile(STATE_FILE, `${json(state)}\n`, { mode: 0o600 }); }
async function load() { return JSON.parse(await readFile(STATE_FILE, "utf8")); }
async function balances(beneficiary = wallet.address) {
  return {
    payerUsdc: (await usdc.balanceOf(wallet.address)).toString(),
    beneficiaryUsdc: (await usdc.balanceOf(beneficiary)).toString(),
    escrowUsdc: (await usdc.balanceOf(ESCROW)).toString(),
  };
}

async function balancesAt(beneficiary, blockTag) {
  return {
    payerUsdc: (await usdc.balanceOf(wallet.address, { blockTag })).toString(),
    beneficiaryUsdc: (await usdc.balanceOf(beneficiary, { blockTag })).toString(),
    escrowUsdc: (await usdc.balanceOf(ESCROW, { blockTag })).toString(),
  };
}

async function start() {
  const beneficiaryWallet = ethers.Wallet.createRandom().connect(provider);
  await writeFile(BENEFICIARY_KEY_FILE, `${beneficiaryWallet.privateKey}\n`, { mode: 0o600 });
  const before = await balances(beneficiaryWallet.address);
  const vaultId = Number(await readMethod("get_vault_count", [], { finalized: true })) + 1;
  const create = await writeMethod("create_vault", [beneficiaryWallet.address, "James Earl Carter Jr.", JSON.stringify(["Jimmy Carter"]), 1924, 3600]);
  const gasTx = await wallet.sendTransaction({ to: beneficiaryWallet.address, value: ethers.parseEther("0.00005") });
  const gasReceipt = await gasTx.wait();
  let approveHash = null;
  if (await usdc.allowance(wallet.address, ESCROW) < AMOUNT) {
    const approveTx = await usdc.approve(ESCROW, AMOUNT);
    const approveReceipt = await approveTx.wait();
    approveHash = approveReceipt.hash;
  }
  const fundTx = await escrow.fundVault(vaultIdToBytes32(vaultId), AMOUNT);
  const fundReceipt = await fundTx.wait();
  const deposited = fundReceipt.logs.map((log) => {
    try { return escrow.interface.parseLog(log); } catch { return null; }
  }).find((event) => event?.name === "Deposited");
  if (!deposited) throw new Error("fundVault receipt did not contain Deposited");
  const paymentId = deposited.args.paymentId;
  const record = await writeMethod("record_payment", [paymentId, vaultId, wallet.address, AMOUNT]);
  const attest = await writeMethod("fund_vault", [vaultId, paymentId]);
  const claimId = Number((await readMethod("get_platform_stats", [], { finalized: true })).claim_count) + 1;
  const claim = await writeMethod("submit_death_claim", [vaultId, JSON.stringify([EVIDENCE]), "", "Official Carter Center death announcement", ""]);
  const claimView = await readMethod("get_claim", [claimId], { finalized: true });
  const state = {
    startedAt: new Date().toISOString(), vaultId, claimId, paymentId,
    amountUnits: AMOUNT.toString(), payer: wallet.address, beneficiary: beneficiaryWallet.address,
    evidence: EVIDENCE, contestDeadline: Number(claimView.contest_deadline), before,
    afterDeposit: await balances(beneficiaryWallet.address),
    transactions: {
      genlayerCreateVault: create.txHash,
      baseBeneficiaryGas: gasReceipt.hash,
      baseApprove: approveHash,
      baseDeposit: fundReceipt.hash,
      genlayerRecordPayment: record.txHash,
      genlayerFundVault: attest.txHash,
      genlayerSubmitClaim: claim.txHash,
    },
  };
  await save(state);
  console.log(json(state));
}

async function finish() {
  const state = await load();
  const beneficiaryKey = (await readFile(BENEFICIARY_KEY_FILE, "utf8")).trim();
  const beneficiaryWallet = new ethers.Wallet(beneficiaryKey, provider);
  if (beneficiaryWallet.address.toLowerCase() !== state.beneficiary.toLowerCase()) throw new Error("beneficiary key mismatch");
  const beneficiaryEscrow = escrow.connect(beneficiaryWallet);
  const now = Math.floor(Date.now() / 1000);
  if (now < state.contestDeadline) throw new Error(`contest window remains open for ${state.contestDeadline - now} seconds`);
  const resolution = await writeMethod("resolve_claim", [state.claimId]);
  const claim = await readMethod("get_claim", [state.claimId], { finalized: true });
  if (claim.status !== "CONFIRMED") throw new Error(`claim resolved ${claim.status}, not CONFIRMED`);
  const response = await fetch(`https://obolus-api-gideon.fly.dev/vaults/${state.vaultId}/relay-settlements`, { method: "POST" });
  const relay = await response.json();
  if (!response.ok) throw new Error(`relay failed (${response.status}): ${JSON.stringify(relay)}`);
  const claimable = await escrow.getClaimable(vaultIdToBytes32(state.vaultId), beneficiaryWallet.address);
  if (claimable <= 0n) throw new Error("Base settlement produced no beneficiary credit");
  const beforeClaim = await balances(beneficiaryWallet.address);
  const claimTx = await beneficiaryEscrow.claim(vaultIdToBytes32(state.vaultId));
  const claimReceipt = await claimTx.wait();
  state.finishedAt = new Date().toISOString();
  state.transactions.genlayerResolveClaim = resolution.txHash;
  state.transactions.baseSettlement = relay.txHash;
  state.transactions.baseWithdrawal = claimReceipt.hash;
  state.resolvedClaim = claim;
  state.claimableBeforeWithdrawal = claimable.toString();
  state.beforeWithdrawal = beforeClaim;
  state.afterWithdrawal = await balances(beneficiaryWallet.address);
  await save(state);
  console.log(json(state));
}

// Recover an interrupted funded run from authoritative chain state. This is
// intentionally explicit: it cannot create a vault, move funds, or submit a
// claim, and is safe to rerun while the contest window is open.
async function recover(vaultId = 3, claimId = 1) {
  const beneficiaryKey = (await readFile(BENEFICIARY_KEY_FILE, "utf8")).trim();
  const beneficiaryWallet = new ethers.Wallet(beneficiaryKey, provider);
  const vault = await readMethod("get_vault", [vaultId], { finalized: true });
  const claim = await readMethod("get_claim", [claimId], { finalized: true });
  if (vault.id !== vaultId || claim.vault_id !== vaultId) throw new Error("recovery target does not match finalized chain state");
  if (beneficiaryWallet.address.toLowerCase() !== vault.beneficiary.toLowerCase()) throw new Error("beneficiary key does not match finalized vault");

  const latestBlock = await provider.getBlockNumber();
  let events = [];
  for (let to = latestBlock; to >= Math.max(0, latestBlock - 10_000) && events.length === 0; to -= 200) {
    events = await escrow.queryFilter(escrow.filters.Deposited(vaultIdToBytes32(vaultId)), Math.max(0, to - 199), to);
  }
  const deposited = events.at(-1);
  if (!deposited) throw new Error(`no Base deposit found for vault ${vaultId}`);
  const receipt = await provider.getTransactionReceipt(deposited.transactionHash);
  const paymentId = deposited.args.paymentId;
  const amount = deposited.args.amount;
  const state = {
    recoveredAt: new Date().toISOString(), vaultId, claimId, paymentId,
    amountUnits: amount.toString(), payer: deposited.args.from, beneficiary: vault.beneficiary,
    evidence: claim.evidence_urls[0], contestDeadline: Number(claim.contest_deadline_ts),
    before: await balancesAt(vault.beneficiary, receipt.blockNumber - 1),
    afterDeposit: await balancesAt(vault.beneficiary, receipt.blockNumber),
    transactions: { baseDeposit: deposited.transactionHash },
    finalizedVault: vault,
    finalizedClaimBeforeResolution: claim,
  };
  await save(state);
  console.log(json(state));
}

const phase = process.argv[2];
if (phase === "start") await start();
else if (phase === "finish") await finish();
else if (phase === "recover") await recover(Number(process.argv[3] || 3), Number(process.argv[4] || 1));
else throw new Error("usage: node scripts/e2e-funded.mjs start|recover [vaultId claimId]|finish");
