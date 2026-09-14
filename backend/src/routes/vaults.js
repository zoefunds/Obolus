import { Router } from "express";
import { readMethod, writeMethod } from "../contract.js";
import { cached, invalidate } from "../cache.js";
import { requireServiceKey } from "../auth.js";
import { buildFundCalldata, buildClaimCalldata, relaySettlementsToEscrow, isEscrowConfigured } from "../baseSepolia.js";

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
// body: { beneficiary, subjectName, subjectAkaJson, subjectBirthYear, contestWindowSeconds, amountUsdc }
// amountUsdc is a DECLARED figure (base units, 6 decimals) — the caller
// must separately deposit the matching real USDC into ObolusEscrow on Base
// Sepolia via GET /vaults/:id/escrow-fund-calldata (once the vault id is
// known) before/alongside this call. See README.md §7 and MEMORY.md.
vaultsRouter.post("/", requireServiceKey, async (req, res, next) => {
  try {
    const {
      beneficiary,
      subjectName,
      subjectAkaJson = "[]",
      subjectBirthYear = 0,
      contestWindowSeconds,
      amountUsdc,
    } = req.body;

    if (!beneficiary || !subjectName || !contestWindowSeconds || !amountUsdc) {
      return res.status(400).json({ error: "beneficiary, subjectName, contestWindowSeconds, amountUsdc are required" });
    }

    const { txHash, receipt } = await writeMethod("create_vault", [
      beneficiary,
      subjectName,
      subjectAkaJson,
      Number(subjectBirthYear),
      Number(contestWindowSeconds),
      Number(amountUsdc),
    ]);
    await invalidate("vault_count");
    res.status(201).json({ txHash, receipt });
  } catch (err) {
    next(err);
  }
});

// POST /vaults/:id/fund  body: { amountUsdc }
vaultsRouter.post("/:id/fund", requireServiceKey, async (req, res, next) => {
  try {
    const { amountUsdc } = req.body;
    if (!amountUsdc) return res.status(400).json({ error: "amountUsdc is required" });
    const result = await writeMethod("fund_vault", [Number(req.params.id), Number(amountUsdc)]);
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

// POST /vaults/:id/relay-settlements — reads this vault's still-pending
// GenLayer settlements, pushes them to ObolusEscrow.settle() on Base
// Sepolia, then marks them relayed back on GenLayer. Safe to call
// repeatedly (a no-op once nothing is pending) — call this after
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
    const pending = await readMethod("get_pending_settlements", [vaultId]);
    if (!pending.length) {
      return res.json({ relayed: 0, txHash: null });
    }
    const { txHash, ids } = await relaySettlementsToEscrow(vaultId, pending);
    if (ids.length > 0) {
      await writeMethod("mark_settlements_relayed", [JSON.stringify(ids)]);
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
    const result = await writeMethod("cancel_vault", [vaultId]);
    await invalidate(`vault:${req.params.id}`);

    if (isEscrowConfigured()) {
      try {
        const pending = await readMethod("get_pending_settlements", [vaultId]);
        if (pending.length > 0) {
          const { ids } = await relaySettlementsToEscrow(vaultId, pending);
          if (ids.length > 0) {
            await writeMethod("mark_settlements_relayed", [JSON.stringify(ids)]);
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
