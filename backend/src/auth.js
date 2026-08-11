// Gate for the backend's relayer-signed write routes (see contract.js's
// writeMethod / genlayerClient.js's requireAccount). These routes sign with
// the server's own GENLAYER_PRIVATE_KEY on behalf of whoever calls them —
// unlike the deployed frontend, which always signs with the caller's own
// connected wallet (frontend/src/lib/writes.js) — so without a gate, any
// unauthenticated caller who finds the API can move funds through the
// relayer's account, including calling the owner-only /admin/* routes if
// that relayer key happens to be the contract owner.
//
// BACKEND_SERVICE_KEY must be set and match the `x-service-key` header for
// any of these routes to run. No key configured means writes are disabled
// (503) rather than left open — the safe default for a surface that is a
// fallback for scripted/non-browser callers, not the primary path.
const configuredKey = process.env.BACKEND_SERVICE_KEY;

export function requireServiceKey(req, res, next) {
  if (!configuredKey) {
    return res.status(503).json({
      error: "This backend's relayer write routes are disabled: set BACKEND_SERVICE_KEY to enable them.",
    });
  }
  const supplied = req.get("x-service-key");
  if (!supplied || supplied !== configuredKey) {
    return res.status(401).json({ error: "missing or invalid x-service-key header" });
  }
  return next();
}
