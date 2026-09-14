import { Router } from "express";
import { readMethod, writeMethod } from "../contract.js";
import { cached, invalidate } from "../cache.js";
import { requireServiceKey } from "../auth.js";
import { relaySettlementsToEscrow, isEscrowConfigured } from "../baseSepolia.js";

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

// GET /claims/:id/contests
claimsRouter.get("/:id/contests", async (req, res, next) => {
  try {
    const contests = await cached(`claim_contests:${req.params.id}`, 5, () =>
      readMethod("get_contests_for_claim", [Number(req.params.id)])
    );
    res.json(contests);
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
// body: { evidenceUrlsJson, evidenceImageUrl, note, bondUsdc }
// bondUsdc is a DECLARED figure (base units) — back it with a real deposit
// on ObolusEscrow via GET /vaults/:vaultId/escrow-fund-calldata first.
// Mounted directly (not on claimsRouter) in server.js — see there for why
// requireServiceKey is applied at the mount site instead of here.
export const submitClaim = async (req, res, next) => {
  try {
    const { evidenceUrlsJson, evidenceImageUrl = "", note = "", bondUsdc = 0 } = req.body;
    if (!evidenceUrlsJson) return res.status(400).json({ error: "evidenceUrlsJson is required (JSON array of URLs)" });

    const { txHash, receipt } = await writeMethod("submit_death_claim", [
      Number(req.params.vaultId),
      evidenceUrlsJson,
      evidenceImageUrl,
      note,
      Number(bondUsdc),
    ]);
    await invalidate(`vault:${req.params.vaultId}`);
    await invalidate(`vault_claims:${req.params.vaultId}`);
    res.status(201).json({ txHash, receipt });
  } catch (err) {
    next(err);
  }
};

// POST /claims/:id/contest  body: { contestUrlsJson, contestImageUrl, bondUsdc }
claimsRouter.post("/:id/contest", requireServiceKey, async (req, res, next) => {
  try {
    const { contestUrlsJson, contestImageUrl = "", bondUsdc = 0 } = req.body;
    if (!contestUrlsJson) return res.status(400).json({ error: "contestUrlsJson is required (JSON array of URLs)" });

    const result = await writeMethod("contest_claim", [
      Number(req.params.id),
      contestUrlsJson,
      contestImageUrl,
      Number(bondUsdc),
    ]);
    await invalidate(`claim:${req.params.id}`);
    await invalidate(`claim_contests:${req.params.id}`);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /claims/:id/resolve
// This triggers the contract's single non-deterministic block (evidence
// fetch + LLM verdict under validator consensus) — expect it to be slower
// than the other writes. If the escrow relayer is configured, this also
// immediately sweeps any settlements the verdict produced onto Base
// Sepolia — a relay failure here is logged but never fails the response,
// since resolve_claim itself already succeeded and the settlements remain
// safely queryable/relayable later via POST /vaults/:vaultId/relay-settlements.
claimsRouter.post("/:id/resolve", requireServiceKey, async (req, res, next) => {
  try {
    const result = await writeMethod("resolve_claim", [Number(req.params.id)]);
    await invalidate(`claim:${req.params.id}`);

    if (isEscrowConfigured()) {
      try {
        const claimView = await readMethod("get_claim", [Number(req.params.id)]);
        const vaultId = Number(claimView.vault_id);
        const pending = await readMethod("get_pending_settlements", [vaultId]);
        if (pending.length > 0) {
          const { ids } = await relaySettlementsToEscrow(vaultId, pending);
          if (ids.length > 0) {
            await writeMethod("mark_settlements_relayed", [JSON.stringify(ids)]);
          }
        }
      } catch (relayErr) {
        console.error("settlement relay after resolve_claim failed (will retry via relay-settlements):", relayErr);
      }
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});
