#!/usr/bin/env node
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { ethers } from "ethers";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { readMethod, finalizedExecutionStatus } from "../backend/src/contract.js";
import { OBOLUS_ESCROW_ABI, ERC20_ABI } from "../backend/src/lib/escrowAbi.js";
import { deriveIndividualSettlementId, latestSettlementDeliveryHash, vaultIdToBytes32 } from "../backend/src/baseSepolia.js";

const STATE_FILE = new URL("../.e2e-adversarial-state.json", import.meta.url);
const KEYS_FILE = new URL("../.e2e-adversarial-keys.json", import.meta.url);
const RPC = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const ESCROW_ADDRESS = process.env.OBOLUS_ESCROW_ADDRESS;
const USDC_ADDRESS = process.env.BASE_SEPOLIA_USDC_ADDRESS;
const CONTRACT_ADDRESS = process.env.VDE_CONTRACT_ADDRESS;
const FUNDER_KEY = process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
const API = "https://obolus-api-gideon.fly.dev";
const PRINCIPAL = 100_000n;
const BOND = 10_000n;
const EVIDENCE = "https://web.archive.org/web/20241230000457/https://www.cartercenter.org/news/pr/2024/statement-on-president-jimmy-carter-122924.html";

if (!ESCROW_ADDRESS || !USDC_ADDRESS || !CONTRACT_ADDRESS || !FUNDER_KEY) throw new Error("E2E configuration incomplete");
const provider = new ethers.JsonRpcProvider(RPC);
const funder = new ethers.Wallet(FUNDER_KEY, provider);
const escrow = new ethers.Contract(ESCROW_ADDRESS, OBOLUS_ESCROW_ABI, provider);
const tokenAbi = [...ERC20_ABI, "function transfer(address to,uint256 amount) returns (bool)"];
const usdc = new ethers.Contract(USDC_ADDRESS, tokenAbi, provider);
const json = (value) => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2);
const save = (path, value) => writeFile(path, `${json(value)}\n`, { mode: 0o600 });

async function genWrite(privateKey, functionName, args) {
  const account = createAccount(privateKey);
  const client = createClient({ chain: studionet, account });
  const txHash = await client.writeContract({ address: CONTRACT_ADDRESS, functionName, args, account });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash, status: "FINALIZED", interval: 4000, retries: 900, fullTransaction: true });
  const verified = finalizedExecutionStatus(receipt);
  if (!verified.ok) throw new Error(`${functionName} failed finalization: ${json(verified)}`);
  return txHash;
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

async function provision(wallet, usdcAmount) {
  const ethTx = await funder.sendTransaction({ to: wallet.address, value: ethers.parseEther("0.00002") });
  await ethTx.wait();
  const tokenTx = await usdc.connect(funder).transfer(wallet.address, usdcAmount);
  await tokenTx.wait();
  return { eth: ethTx.hash, usdc: tokenTx.hash };
}

async function deposit(wallet, vaultId, amount) {
  const signerEscrow = escrow.connect(wallet);
  const signerUsdc = usdc.connect(wallet);
  const approval = await signerUsdc.approve(ESCROW_ADDRESS, amount);
  await approval.wait();
  // Base's public RPC can briefly serve a stale allowance to eth_estimateGas
  // immediately after the approval receipt. Supplying a conservative limit
  // skips that stale simulation; execution still enforces the mined approval.
  const tx = await signerEscrow.fundVault(vaultIdToBytes32(vaultId), amount, { gasLimit: 300_000n });
  const receipt = await tx.wait();
  const event = receipt.logs.map((log) => { try { return escrow.interface.parseLog(log); } catch { return null; } })
    .find((item) => item?.name === "Deposited");
  if (!event) throw new Error("deposit receipt has no Deposited event");
  const confirmed = await api(`/vaults/${vaultId}/confirm-payment`, { method: "POST", body: JSON.stringify({ txHash: tx.hash }) });
  if (confirmed.paymentId.toLowerCase() !== event.args.paymentId.toLowerCase()) throw new Error("payment attestation mismatch");
  return { approval: approval.hash, deposit: tx.hash, paymentId: confirmed.paymentId };
}

async function balances(addresses) {
  return Object.fromEntries(await Promise.all(Object.entries(addresses).map(async ([role, address]) => [role, (await usdc.balanceOf(address)).toString()])));
}

async function start() {
  const roles = Object.fromEntries(["grantor", "claimant", "contester", "beneficiary"].map((name) => [name, ethers.Wallet.createRandom().connect(provider)]));
  await save(KEYS_FILE, Object.fromEntries(Object.entries(roles).map(([name, wallet]) => [name, wallet.privateKey])));
  const addresses = Object.fromEntries(Object.entries(roles).map(([name, wallet]) => [name, wallet.address]));
  const before = await balances({ funder: funder.address, escrow: ESCROW_ADDRESS, ...addresses });
  const provisioning = {
    grantor: await provision(roles.grantor, PRINCIPAL),
    claimant: await provision(roles.claimant, BOND),
    contester: await provision(roles.contester, BOND),
  };
  const beneficiaryGas = await funder.sendTransaction({ to: roles.beneficiary.address, value: ethers.parseEther("0.00002") });
  await beneficiaryGas.wait();

  const vaultId = Number(await readMethod("get_vault_count", [], { finalized: true })) + 1;
  const createVault = await genWrite(roles.grantor.privateKey, "create_vault", [roles.beneficiary.address, "James Earl Carter Jr.", JSON.stringify(["Jimmy Carter"]), 1924, 3600]);
  const grantorDeposit = await deposit(roles.grantor, vaultId, PRINCIPAL);
  const fundVault = await genWrite(roles.grantor.privateKey, "fund_vault", [vaultId, grantorDeposit.paymentId]);

  const claimantDeposit = await deposit(roles.claimant, vaultId, BOND);
  const claimId = Number((await readMethod("get_platform_stats", [], { finalized: true })).claim_count) + 1;
  const submitClaim = await genWrite(roles.claimant.privateKey, "submit_death_claim", [vaultId, JSON.stringify([EVIDENCE]), "", "Official Carter Center death announcement", claimantDeposit.paymentId]);

  const contesterDeposit = await deposit(roles.contester, vaultId, BOND);
  const contestClaim = await genWrite(roles.contester.privateKey, "contest_claim", [claimId, JSON.stringify([EVIDENCE]), "", contesterDeposit.paymentId]);
  const claim = await readMethod("get_claim", [claimId], { finalized: true });
  const state = {
    startedAt: new Date().toISOString(), vaultId, claimId, addresses, before,
    afterDeposits: await balances({ funder: funder.address, escrow: ESCROW_ADDRESS, ...addresses }),
    amounts: { principal: PRINCIPAL, claimantBond: BOND, contesterBond: BOND },
    contestDeadline: Number(claim.contest_deadline_ts), evidence: EVIDENCE,
    transactions: { provisioning, beneficiaryGas: beneficiaryGas.hash, createVault, grantorDeposit, fundVault, claimantDeposit, submitClaim, contesterDeposit, contestClaim },
  };
  await save(STATE_FILE, state);
  console.log(json(state));
}

async function latestDeposit(vaultId, payer) {
  const latest = await provider.getBlockNumber();
  for (let to = latest; to >= Math.max(0, latest - 10_000); to -= 200) {
    const events = await escrow.queryFilter(
      escrow.filters.Deposited(vaultIdToBytes32(vaultId), payer),
      Math.max(0, to - 199),
      to,
    );
    if (events.length) {
      const event = events.at(-1);
      return { approval: null, deposit: event.transactionHash, paymentId: event.args.paymentId };
    }
  }
  throw new Error(`no deposit found for vault ${vaultId} and payer ${payer}`);
}

async function resume() {
  const keys = JSON.parse(await readFile(KEYS_FILE, "utf8"));
  const roles = Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, new ethers.Wallet(key, provider)]));
  const addresses = Object.fromEntries(Object.entries(roles).map(([name, wallet]) => [name, wallet.address]));
  const vaultId = Number(await readMethod("get_vault_count", [], { finalized: true }));
  const vault = await readMethod("get_vault", [vaultId], { finalized: true });
  if (vault.grantor.toLowerCase() !== addresses.grantor.toLowerCase() || vault.balance_usdc !== Number(PRINCIPAL)) {
    throw new Error("partial run does not match the expected funded grantor vault");
  }
  const grantorDeposit = await latestDeposit(vaultId, addresses.grantor);
  const claimantDeposit = await deposit(roles.claimant, vaultId, BOND);
  const claimId = Number((await readMethod("get_platform_stats", [], { finalized: true })).claim_count) + 1;
  const submitClaim = await genWrite(roles.claimant.privateKey, "submit_death_claim", [vaultId, JSON.stringify([EVIDENCE]), "", "Official Carter Center death announcement", claimantDeposit.paymentId]);
  const contesterDeposit = await deposit(roles.contester, vaultId, BOND);
  const contestClaim = await genWrite(roles.contester.privateKey, "contest_claim", [claimId, JSON.stringify([EVIDENCE]), "", contesterDeposit.paymentId]);
  const claim = await readMethod("get_claim", [claimId], { finalized: true });
  const state = {
    resumedAt: new Date().toISOString(), vaultId, claimId, addresses,
    beforeDeposits: { grantor: PRINCIPAL, claimant: BOND, contester: BOND, beneficiary: 0, escrow: 0 },
    afterDeposits: await balances({ funder: funder.address, escrow: ESCROW_ADDRESS, ...addresses }),
    amounts: { principal: PRINCIPAL, claimantBond: BOND, contesterBond: BOND },
    contestDeadline: Number(claim.contest_deadline_ts), evidence: EVIDENCE,
    transactions: { grantorDeposit, claimantDeposit, submitClaim, contesterDeposit, contestClaim },
  };
  await save(STATE_FILE, state);
  console.log(json(state));
}

async function finish() {
  const state = JSON.parse(await readFile(STATE_FILE, "utf8"));
  const keys = JSON.parse(await readFile(KEYS_FILE, "utf8"));
  if (Math.floor(Date.now() / 1000) < state.contestDeadline) throw new Error(`contest window remains open until ${state.contestDeadline}`);
  let claim = await readMethod("get_claim", [state.claimId], { finalized: true });
  let resolveClaim = state.transactions.resolveClaim || null;
  if (claim.status !== "CONFIRMED") {
    resolveClaim = await genWrite(keys.grantor, "resolve_claim", [state.claimId]);
    claim = await readMethod("get_claim", [state.claimId], { finalized: true });
  }
  if (claim.status !== "CONFIRMED") throw new Error(`expected CONFIRMED, received ${claim.status}`);
  const finalizedRows = await readMethod("get_settlements_page", [state.vaultId, 0, 100], { finalized: true });
  if (finalizedRows.length !== 3) throw new Error(`expected three finalized entitlements, received ${finalizedRows.length}`);
  const replayIds = finalizedRows.map((row) => deriveIndividualSettlementId(state.vaultId, row.id));
  const relay = await api(`/vaults/${state.vaultId}/relay-settlements`, { method: "POST", body: "{}" });
  if (relay.relayed !== 3) throw new Error(`unexpected first relay result: ${json(relay)}`);
  const settlementTxHash = relay.txHash || await latestSettlementDeliveryHash(
    escrow, escrow.filters.SettlementApplied(replayIds[0]), Number(process.env.OBOLUS_ESCROW_DEPLOY_BLOCK || 0),
  );
  if (!settlementTxHash) throw new Error("could not recover the successful Base settlement transaction");
  const replay = await api(`/vaults/${state.vaultId}/relay-settlements`, { method: "POST", body: "{}" });
  if (replay.txHash !== null) throw new Error(`idempotent replay created a new allocation: ${json(replay)}`);
  const beneficiary = new ethers.Wallet(keys.beneficiary, provider);
  const claimant = new ethers.Wallet(keys.claimant, provider);
  const key = vaultIdToBytes32(state.vaultId);
  const applied = await Promise.all(replayIds.map((id) => escrow.settledIds(id)));
  if (applied.some((value) => !value)) throw new Error("one or more individual settlement replay keys were not applied");
  const pool = await escrow.getPool(key);
  if (pool.deposited !== PRINCIPAL + BOND + BOND || pool.allocated !== PRINCIPAL + BOND + BOND) {
    throw new Error(`unexpected Base pool after allocation: ${json(pool)}`);
  }
  const beneficiaryCredit = await escrow.getClaimable(key, beneficiary.address);
  const claimantCredit = await escrow.getClaimable(key, claimant.address);
  if (![0n, PRINCIPAL + BOND].includes(beneficiaryCredit) || ![0n, BOND].includes(claimantCredit)) {
    throw new Error("unexpected recipient credits");
  }
  let beneficiaryWithdrawal = state.transactions.beneficiaryWithdrawal || null;
  if (beneficiaryCredit > 0n) {
    const tx = await escrow.connect(beneficiary).claim(key); await tx.wait();
    beneficiaryWithdrawal = tx.hash;
  } else if (!beneficiaryWithdrawal) {
    beneficiaryWithdrawal = await latestSettlementDeliveryHash(
      escrow, escrow.filters.Claimed(key, beneficiary.address), Number(process.env.OBOLUS_ESCROW_DEPLOY_BLOCK || 0),
    );
  }
  let claimantWithdrawal = state.transactions.claimantWithdrawal || null;
  if (claimantCredit > 0n) {
    const tx = await escrow.connect(claimant).claim(key); await tx.wait();
    claimantWithdrawal = tx.hash;
  } else if (!claimantWithdrawal) {
    claimantWithdrawal = await latestSettlementDeliveryHash(
      escrow, escrow.filters.Claimed(key, claimant.address), Number(process.env.OBOLUS_ESCROW_DEPLOY_BLOCK || 0),
    );
  }
  if (!beneficiaryWithdrawal || !claimantWithdrawal) throw new Error("could not recover both withdrawal transactions");
  state.finishedAt = new Date().toISOString();
  state.transactions.resolveClaim = resolveClaim;
  state.transactions.baseSettlement = settlementTxHash;
  state.transactions.beneficiaryWithdrawal = beneficiaryWithdrawal;
  state.transactions.claimantWithdrawal = claimantWithdrawal;
  state.resolvedClaim = claim;
  state.replayVerification = { secondRelay: replay, individualSettlementIds: replayIds, applied };
  state.poolAfterAllocation = { deposited: pool.deposited, allocated: pool.allocated };
  state.creditsBeforeWithdrawal = { beneficiary: beneficiaryCredit, claimant: claimantCredit };
  for (let attempt = 0; attempt < 15; attempt++) {
    state.afterWithdrawals = await balances({ funder: funder.address, escrow: ESCROW_ADDRESS, ...state.addresses });
    if (state.afterWithdrawals.escrow === "0" &&
        state.afterWithdrawals.beneficiary === (PRINCIPAL + BOND).toString() &&
        state.afterWithdrawals.claimant === BOND.toString()) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (state.afterWithdrawals.escrow !== "0" ||
      state.afterWithdrawals.beneficiary !== (PRINCIPAL + BOND).toString() ||
      state.afterWithdrawals.claimant !== BOND.toString() ||
      state.afterWithdrawals.contester !== "0") {
    throw new Error(`unexpected final USDC balances: ${json(state.afterWithdrawals)}`);
  }
  state.finalVault = await readMethod("get_vault", [state.vaultId], { finalized: true });
  state.finalSettlements = await readMethod("get_settlements_page", [state.vaultId, 0, 100], { finalized: true });
  if (Number(state.finalVault.balance_usdc) !== 0 ||
      state.finalSettlements.some((row) => row.base_tx_hash?.toLowerCase() !== settlementTxHash.toLowerCase())) {
    throw new Error("final GenLayer delivery state does not match the Base settlement transaction");
  }
  await save(STATE_FILE, state);
  console.log(json(state));
}

const phase = process.argv[2];
if (phase === "start") await start();
else if (phase === "resume") await resume();
else if (phase === "finish") await finish();
else throw new Error("usage: node scripts/e2e-adversarial.mjs start|resume|finish");
