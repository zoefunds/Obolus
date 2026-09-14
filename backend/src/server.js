import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import cors from "cors";
import { vaultsRouter } from "./routes/vaults.js";
import { claimsRouter, submitClaim } from "./routes/claims.js";
import { miscRouter } from "./routes/misc.js";
import { requireServiceKey } from "./auth.js";

// See genlayerClient.js for why this can't be a bare `dotenv/config` import.
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

// This service must stay up 24/7: a genlayer-js call that rejects outside
// an Express handler (e.g. a stray network error during client init) would
// otherwise crash the whole process via Node's default unhandled-rejection
// behavior. Log and keep serving instead — request-scoped errors already
// go through the Express error handler below and never reach here. Actual
// process supervision (auto-restart if it does exit) is pm2's job — see
// ecosystem.config.cjs / `npm run backend:prod`.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection (backend stays up):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (backend stays up):", err);
});

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "obolus-api" }));

app.use("/vaults", vaultsRouter);
app.post("/vaults/:vaultId/claims", requireServiceKey, submitClaim);
app.use("/claims", claimsRouter);
app.use("/", miscRouter);

// Centralized error handler. Contract UserErrors surface as
// "[EXPECTED] ...", "[EXTERNAL] ...", "[TRANSIENT] ...", "[LLM_ERROR] ..."
// prefixes per the contract's own error-classification scheme — pass the
// classification straight through so callers can branch on it without
// re-parsing contract internals here.
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "internal error" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Obolus backend listening on :${port}`);
});
