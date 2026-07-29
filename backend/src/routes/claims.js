import { Router } from "express";
import { readMethod, writeMethod } from "../contract.js";
import { cached, invalidate } from "../cache.js";

export const claimsRouter = Router();

// GET /claims/:id
claimsRouter.get("/:id", async (req, res, next) => {
  try {
    const claim = await cached(`claim:${req.params.id}`, 5, () => readMethod("get_claim", [Number(req.params.id)]));
    res.json(claim);
  } catch (err) {
    next(err);
  }
});

// GET /claims/:id/resolvable
claimsRouter.get("/:id/resolvable", async (req, res, next) => {
  try {
    const resolvable = await readMethod("is_resolvable", [Number(req.params.id)]);
    res.json({ resolvable });
  } catch (err) {
    next(err);
  }
});

// POST /vaults/:vaultId/claims
// body: { evidenceUrlsJson, evidenceImageUrl, note, valueWei }
export const submitClaim = async (req, res, next) => {
  try {
    const { evidenceUrlsJson, evidenceImageUrl = "", note = "", valueWei = "0" } = req.body;
    if (!evidenceUrlsJson) return res.status(400).json({ error: "evidenceUrlsJson is required (JSON array of URLs)" });

    const { txHash, receipt } = await writeMethod(
      "submit_death_claim",
      [Number(req.params.vaultId), evidenceUrlsJson, evidenceImageUrl, note],
      BigInt(valueWei)
    );
    await invalidate(`vault:${req.params.vaultId}`);
    await invalidate(`vault_claims:${req.params.vaultId}`);
    res.status(201).json({ txHash, receipt });
  } catch (err) {
    next(err);
  }
};

// POST /claims/:id/contest  body: { contestUrlsJson, contestImageUrl, valueWei }
claimsRouter.post("/:id/contest", async (req, res, next) => {
  try {
    const { contestUrlsJson, contestImageUrl = "", valueWei = "0" } = req.body;
    if (!contestUrlsJson) return res.status(400).json({ error: "contestUrlsJson is required (JSON array of URLs)" });

    const result = await writeMethod(
      "contest_claim",
      [Number(req.params.id), contestUrlsJson, contestImageUrl],
      BigInt(valueWei)
    );
    await invalidate(`claim:${req.params.id}`);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /claims/:id/resolve
// This triggers the contract's single non-deterministic block (evidence
// fetch + LLM verdict under validator consensus) — expect it to be slower
// than the other writes.
claimsRouter.post("/:id/resolve", async (req, res, next) => {
  try {
    const result = await writeMethod("resolve_claim", [Number(req.params.id)]);
    await invalidate(`claim:${req.params.id}`);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
