import { Router } from "express";
import { readMethod, writeMethod } from "../contract.js";
import { cached, invalidate } from "../cache.js";
import { requireServiceKey } from "../auth.js";
import {
  buildFundCalldata,
  buildClaimCalldata,
  relaySettlementsToEscrow,
  readConfirmedDeposit,
  isEscrowConfigured,
  buildFailedPaymentRefundCalldata,
  readAllSettlementCandidates,
} from "../baseSepolia.js";

export const vaultsRouter = Router();

// GET /vaults/:id
vaultsRouter.get("/:id", async (req, res, next) => {
  try {
    const vault = await cached(`vault:${req.params.id}`, 5, () => readMethod("get_vault", [Number(req.params.id)]));
    res.json(vault);
  } catch (err) {
    next(err);
  }
});

// POST /vaults/:id/refund-failed-payment-calldata
// body: { txHash, paymentId? }. Returns calldata that only the original
// Base payer can execute after the independent authorizer confirms the
// deposit was never successfully consumed by finalized GenLayer state.
vaultsRouter.post("/:id/refund-failed-payment-calldata", async (req, res, next) => {
  try {
    if (!isEscrowConfigured()) return res.status(503).json({ error: "Escrow authorizer is not configured" });
    const { txHash, paymentId = "" } = req.body;
    if (!txHash || !paymentId) return res.status(400).json({ error: "txHash and paymentId are required" });
    // Always finalize a tombstone before requesting a Base signature, even
    // when no finalized Payment row exists. That makes any in-flight or
    // later record_payment for this id fail instead of reviving refunded
    // USDC as spendable GenLayer credit.
    const alreadyVoided = await readMethod("is_payment_voided", [paymentId], { finalized: true });
    if (!alreadyVoided) {
      await writeMethod("void_payment_for_refund", [paymentId], { finality: "FINALIZED" });
    }
    res.json(await buildFailedPaymentRefundCalldata(Number(req.params.id), txHash, paymentId));
  } catch (err) {
    next(err);
  }
});

// GET /vaults
vaultsRouter.get("/", async (_req, res, next) => {
  try {
    const count = await cached("vault_count", 5, () => readMethod("get_vault_count", []));
    res.json({ count: Number(count) });
  } catch (err) {
    next(err);
  }
});

// GET /vaults/:id/claims
vaultsRouter.get("/:id/claims", async (req, res, next) => {
  try {
    const claims = await cached(`vault_claims:${req.params.id}`, 5, () => readMethod("get_claims_for_vault", [Number(req.params.id)]));
    res.json(claims);
  } catch (err) {
    next(err);
  }
});

// POST /vaults
// body: { beneficiary, subjectName, subjectAkaJson, subjectBirthYear, contestWindowSeconds }
// Metadata only — the vault is created with a zero balance. Fund it
// afterwards via POST /vaults/:id/confirm-payment + POST /vaults/:id/fund
// (see README.md §7); create_vault no longer accepts a declared amount.
vaultsRouter.post("/", requireServiceKey, async (req, res, next) => {
  try {
    const {
      beneficiary,
      subjectName,
      subjectAkaJson = "[]",
      subjectBirthYear = 0,
      contestWindowSeconds,
    } = req.body;

    if (!beneficiary || !subjectName || !contestWindowSeconds) {
      return res.status(400).json({ error: "beneficiary, subjectName, contestWindowSeconds are required" });
    }

    const { txHash, receipt } = await writeMethod("create_vault", [
      beneficiary,
      subjectName,
      subjectAkaJson,
      Number(subjectBirthYear),
      Number(contestWindowSeconds),
    ]);
    await invalidate("vault_count");
    res.status(201).json({ txHash, receipt });
  } catch (err) {
    next(err);
  }
});

// POST /vaults/:id/confirm-payment  body: { txHash }
// Deliberately permissionless, like /relay-settlements: it never trusts
// anything the caller claims, only what readConfirmedDeposit decodes
// straight off the real, already-mined Base Sepolia receipt, and
// GenLayer's own record_payment is separately gated to the relayer
// address this backend signs with — so there is nothing to gain by
// calling this early, on someone else's tx, or repeatedly. Returns the
// payment_id to pass to fund_vault / submit_death_claim / contest_claim.
// Safe to call repeatedly with the same txHash: GenLayer's record_payment
// rejects a duplicate payment_id outright, so a retry here is a harmless
// no-op once the first call already attested it.
vaultsRouter.post("/:id/confirm-payment", async (req, res, next) => {
  try {
    if (!isEscrowConfigured()) {
      return res.status(503).json({ error: "Escrow relayer is not configured on this server" });
    }
    const { txHash } = req.body;
    if (!txHash) return res.status(400).json({ error: "txHash is required" });
    const vaultId = Number(req.params.id);

    const deposit = await readConfirmedDeposit(vaultId, txHash);
    try {
      await writeMethod("record_payment", [deposit.paymentId, vaultId, deposit.payer, Number(deposit.amount)]);
    } catch (err) {
      // Already recorded (e.g. a retried confirm-payment call) is fine —
      // the payment_id is still usable exactly once by fund_vault et al.
      if (!/already recorded/i.test(String(err?.message || ""))) throw err;
    }
    res.json({ paymentId: deposit.paymentId, amountUsdc: deposit.amount, payer: deposit.payer });
  } catch (err) {
    next(err);
  }
});

// POST /vaults/:id/fund  body: { paymentId }
vaultsRouter.post("/:id/fund", requireServiceKey, async (req, res, next) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ error: "paymentId is required (see POST /vaults/:id/confirm-payment)" });
    const result = await writeMethod("fund_vault", [Number(req.params.id), paymentId]);
    await invalidate(`vault:${req.params.id}`);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /vaults/:id/escrow-fund-calldata?amountUsdc=N — approve() + fundVault()
// calldata for the connected wallet to send on Base Sepolia, backing a
// declared create_vault/fund_vault/submit_death_claim/contest_claim amount
// with real USDC. amountUsdc is in whole USDC (6-decimal units applied
// here); pass amountUnits directly instead if you already have base units.
vaultsRouter.get("/:id/escrow-fund-calldata", async (req, res, next) => {
  try {
    if (!isEscrowConfigured()) {
      return res.status(503).json({ error: "Escrow contract not configured yet" });
    }
    const amountUnits = req.query.amountUnits
      ? BigInt(req.query.amountUnits)
      : BigInt(Math.round(Number(req.query.amountUsdc || 0) * 1e6));
    if (!(amountUnits > 0n)) {
      return res.status(400).json({ error: "amountUsdc (or amountUnits) must be > 0" });
    }
    res.json(buildFundCalldata(Number(req.params.id), amountUnits));
  } catch (err) {
    next(err);
  }
});

// GET /vaults/:id/escrow-claim-calldata — self-serve claim() calldata for
// the connected wallet to send directly on Base Sepolia; no relayer or
// service key involved.
vaultsRouter.get("/:id/escrow-claim-calldata", async (req, res, next) => {
  try {
    if (!isEscrowConfigured()) {
      return res.status(503).json({ error: "Escrow contract not configured yet" });
    }
    res.json(buildClaimCalldata(Number(req.params.id)));
  } catch (err) {
    next(err);
  }
});

// GET /vaults/:id/settlements — every settlement GenLayer has recorded for
// this vault (pending or already relayed to Base Sepolia).
vaultsRouter.get("/:id/settlements", async (req, res, next) => {
  try {
    const settlements = await readMethod("get_settlements_for_vault", [Number(req.params.id)]);
    res.json(settlements);
  } catch (err) {
    next(err);
  }
});

// POST /vaults/:id/relay-settlements — reads this vault's complete finalized
// GenLayer settlement index, uses Base settledIds/events as delivery truth,
// pushes missing rows to ObolusEscrow.settle(), then records advisory
// acknowledgments on GenLayer. Safe to call repeatedly — call this after
// resolve_claim or cancel_vault so recipients can actually claim their
// USDC on Base. Deliberately permissionless (like resolve_claim itself) —
// it only ever relays amounts GenLayer has already recorded, and
// ObolusEscrow's own cumulative-allocation guard on Base Sepolia is the
// real backstop, so there is nothing to gain by calling this early, late,
// or repeatedly. The frontend calls it directly after a wallet-signed
// cancel_vault/resolve_claim, which the service-key-gated write routes
// never see.
vaultsRouter.post("/:id/relay-settlements", async (req, res, next) => {
  try {
    if (!isEscrowConfigured()) {
      return res.status(503).json({ error: "Escrow relayer is not configured on this server" });
    }
    const vaultId = Number(req.params.id);
    const pending = await readAllSettlementCandidates(readMethod, vaultId);
    if (!pending.length) {
      return res.json({ relayed: 0, txHash: null });
    }
    const { txHash, ids, acknowledgments = [] } = await relaySettlementsToEscrow(vaultId, pending);
    for (const acknowledgment of acknowledgments) {
      await writeMethod("mark_settlements_relayed", [JSON.stringify(acknowledgment.ids), acknowledgment.txHash], { finality: "FINALIZED" });
    }
    res.json({ relayed: ids.length, txHash });
  } catch (err) {
    next(err);
  }
});

// POST /vaults/:id/beneficiary  body: { newBeneficiary }
vaultsRouter.post("/:id/beneficiary", requireServiceKey, async (req, res, next) => {
  try {
    const { newBeneficiary } = req.body;
    if (!newBeneficiary) return res.status(400).json({ error: "newBeneficiary is required" });
    const result = await writeMethod("set_beneficiary", [Number(req.params.id), newBeneficiary]);
    await invalidate(`vault:${req.params.id}`);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /vaults/:id/cancel
vaultsRouter.post("/:id/cancel", requireServiceKey, async (req, res, next) => {
  try {
    const vaultId = Number(req.params.id);
    const result = await writeMethod("cancel_vault", [vaultId], { finality: "FINALIZED" });
    await invalidate(`vault:${req.params.id}`);

    if (isEscrowConfigured()) {
      try {
        const pending = await readAllSettlementCandidates(readMethod, vaultId);
        if (pending.length > 0) {
          const { acknowledgments = [] } = await relaySettlementsToEscrow(vaultId, pending);
          for (const acknowledgment of acknowledgments) {
            await writeMethod("mark_settlements_relayed", [JSON.stringify(acknowledgment.ids), acknowledgment.txHash], { finality: "FINALIZED" });
          }
        }
      } catch (relayErr) {
        console.error("settlement relay after cancel_vault failed (will retry via relay-settlements):", relayErr);
      }
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /vaults/by-grantor/:address
vaultsRouter.get("/by-grantor/:address", async (req, res, next) => {
  try {
    const ids = await readMethod("get_vaults_for_grantor", [req.params.address]);
    res.json(ids);
  } catch (err) {
    next(err);
  }
});

// GET /vaults/by-beneficiary/:address
vaultsRouter.get("/by-beneficiary/:address", async (req, res, next) => {
  try {
    const ids = await readMethod("get_vaults_for_beneficiary", [req.params.address]);
    res.json(ids);
  } catch (err) {
    next(err);
  }
});
