import { Router } from "express";
import { readMethod, writeMethod } from "../contract.js";
import { cached, invalidate } from "../cache.js";
import { CONTRACT_ADDRESS } from "../genlayerClient.js";

export const miscRouter = Router();

// GET /platform/network
// Public chain/contract info the frontend needs to sign transactions
// client-side via a connected wallet — none of this is secret (the
// contract address and network are visible on-chain to anyone).
miscRouter.get("/platform/network", (_req, res) => {
  res.json({
    contractAddress: CONTRACT_ADDRESS || null,
    network: process.env.GENLAYER_NETWORK || "studionet",
  });
});

// GET /balances/:address
miscRouter.get("/balances/:address", async (req, res, next) => {
  try {
    const balance = await cached(`balance:${req.params.address}`, 5, () => readMethod("get_balance_of", [req.params.address]));
    res.json({ address: req.params.address, balanceWei: String(balance) });
  } catch (err) {
    next(err);
  }
});

// POST /balances/withdraw  body: { amountWei }
miscRouter.post("/balances/withdraw", async (req, res, next) => {
  try {
    const { amountWei } = req.body;
    if (!amountWei) return res.status(400).json({ error: "amountWei is required" });
    const result = await writeMethod("withdraw", [amountWei]);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /platform/stats
miscRouter.get("/platform/stats", async (_req, res, next) => {
  try {
    res.json(await cached("platform_stats", 5, () => readMethod("get_platform_stats", [])));
  } catch (err) {
    next(err);
  }
});

// GET /platform/config
miscRouter.get("/platform/config", async (_req, res, next) => {
  try {
    res.json(await cached("platform_config", 15, () => readMethod("get_config", [])));
  } catch (err) {
    next(err);
  }
});

// ---- owner-only admin (server signer must be the current contract owner) ----

miscRouter.post("/admin/pause", async (_req, res, next) => {
  try {
    res.json(await writeMethod("pause", []));
    await invalidate("platform_stats");
  } catch (err) {
    next(err);
  }
});

miscRouter.post("/admin/unpause", async (_req, res, next) => {
  try {
    res.json(await writeMethod("unpause", []));
    await invalidate("platform_stats");
  } catch (err) {
    next(err);
  }
});

// body: { minClaimantBondWei, minContesterBondWei }
miscRouter.post("/admin/minimum-bonds", async (req, res, next) => {
  try {
    const { minClaimantBondWei = 0, minContesterBondWei = 0 } = req.body;
    res.json(await writeMethod("set_minimum_bonds", [Number(minClaimantBondWei), Number(minContesterBondWei)]));
    await invalidate("platform_config");
  } catch (err) {
    next(err);
  }
});

// body: { newOwner }
miscRouter.post("/admin/owner", async (req, res, next) => {
  try {
    const { newOwner } = req.body;
    if (!newOwner) return res.status(400).json({ error: "newOwner is required" });
    res.json(await writeMethod("set_owner", [newOwner]));
  } catch (err) {
    next(err);
  }
});
