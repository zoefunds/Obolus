import { Router } from "express";
import { readMethod, writeMethod } from "../contract.js";
import { cached, invalidate } from "../cache.js";

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
// body: { beneficiary, subjectName, subjectAkaJson, subjectBirthYear, contestWindowSeconds, valueWei }
vaultsRouter.post("/", async (req, res, next) => {
  try {
    const {
      beneficiary,
      subjectName,
      subjectAkaJson = "[]",
      subjectBirthYear = 0,
      contestWindowSeconds,
      valueWei,
    } = req.body;

    if (!beneficiary || !subjectName || !contestWindowSeconds || !valueWei) {
      return res.status(400).json({ error: "beneficiary, subjectName, contestWindowSeconds, valueWei are required" });
    }

    const { txHash, receipt } = await writeMethod(
      "create_vault",
      [beneficiary, subjectName, subjectAkaJson, Number(subjectBirthYear), Number(contestWindowSeconds)],
      BigInt(valueWei)
    );
    await invalidate("vault_count");
    res.status(201).json({ txHash, receipt });
  } catch (err) {
    next(err);
  }
});

// POST /vaults/:id/fund  body: { valueWei }
vaultsRouter.post("/:id/fund", async (req, res, next) => {
  try {
    const { valueWei } = req.body;
    if (!valueWei) return res.status(400).json({ error: "valueWei is required" });
    const result = await writeMethod("fund_vault", [Number(req.params.id)], BigInt(valueWei));
    await invalidate(`vault:${req.params.id}`);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /vaults/:id/beneficiary  body: { newBeneficiary }
vaultsRouter.post("/:id/beneficiary", async (req, res, next) => {
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
vaultsRouter.post("/:id/cancel", async (req, res, next) => {
  try {
    const result = await writeMethod("cancel_vault", [Number(req.params.id)]);
    await invalidate(`vault:${req.params.id}`);
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
