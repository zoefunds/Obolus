import { Router } from "express";
import { readMethod, writeMethod } from "../contract.js";
import { cached } from "../cache.js";
import { CONTRACT_ADDRESS } from "../genlayerClient.js";
import { requireServiceKey } from "../auth.js";
import { getTotalClaimable, getEscrowClaimable, config as baseConfig, isEscrowConfigured } from "../baseSepolia.js";

export const miscRouter = Router();

// GET /platform/network
// Public chain/contract info the frontend needs to sign transactions
// client-side via a connected wallet — none of this is secret (the
// contract address and network are visible on-chain to anyone).
miscRouter.get("/platform/network", (_req, res) => {
  res.json({
    contractAddress: CONTRACT_ADDRESS || null,
    network: process.env.GENLAYER_NETWORK || "studionet",
    baseSepolia: {
      chainId: 84532,
      usdcAddress: baseConfig.usdcAddress,
      escrowAddress: baseConfig.escrowAddress || null,
      configured: isEscrowConfigured(),
    },
  });
});

// GET /balances/:address — real, claimable USDC on Base Sepolia's
// ObolusEscrow (across every vault), not an internal GenLayer ledger — see
// MEMORY.md, "USDC migration". Call this instead of the old
// get_balance_of; the money itself moves via the user's own claim()/
// claimMany() call on ObolusEscrow, never through this backend.
miscRouter.get("/balances/:address", async (req, res, next) => {
  try {
    if (!isEscrowConfigured()) {
      return res.status(503).json({ error: "Escrow contract not configured yet" });
    }
    const totalClaimableUsdc = await cached(`balance:${req.params.address}`, 5, () =>
      getTotalClaimable(req.params.address)
    );
    res.json({ address: req.params.address, totalClaimableUsdc: String(totalClaimableUsdc) });
  } catch (err) {
    next(err);
  }
});

// GET /balances/:address/vault/:vaultId — claimable USDC for one vault
// specifically (useful right after a resolve/cancel before the aggregate
// cache above refreshes).
miscRouter.get("/balances/:address/vault/:vaultId", async (req, res, next) => {
  try {
    if (!isEscrowConfigured()) {
      return res.status(503).json({ error: "Escrow contract not configured yet" });
    }
    const claimableUsdc = await getEscrowClaimable(Number(req.params.vaultId), req.params.address);
    res.json({ address: req.params.address, vaultId: Number(req.params.vaultId), claimableUsdc: String(claimableUsdc) });
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

miscRouter.post("/admin/pause", requireServiceKey, async (_req, res, next) => {
  try {
    res.json(await writeMethod("pause", []));
  } catch (err) {
    next(err);
  }
});

miscRouter.post("/admin/unpause", requireServiceKey, async (_req, res, next) => {
  try {
    res.json(await writeMethod("unpause", []));
  } catch (err) {
    next(err);
  }
});

// body: { minClaimantBondUsdc, minContesterBondUsdc }
miscRouter.post("/admin/minimum-bonds", requireServiceKey, async (req, res, next) => {
  try {
    const { minClaimantBondUsdc = 0, minContesterBondUsdc = 0 } = req.body;
    res.json(await writeMethod("set_minimum_bonds", [Number(minClaimantBondUsdc), Number(minContesterBondUsdc)]));
  } catch (err) {
    next(err);
  }
});

// body: { newOwner }
miscRouter.post("/admin/owner", requireServiceKey, async (req, res, next) => {
  try {
    const { newOwner } = req.body;
    if (!newOwner) return res.status(400).json({ error: "newOwner is required" });
    res.json(await writeMethod("set_owner", [newOwner]));
  } catch (err) {
    next(err);
  }
});
