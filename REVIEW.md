# Review response — August 2026

## The review

> The main weakness is that interested parties can supply mutable, unauthenticated
> pages and early contests can crowd stronger later evidence out of resolution. For a
> stronger version, bind claims to authenticated or committed source content, make
> every bonded contest fairly eligible for review, and remove or authenticate the
> service-key write routes.

This document records exactly what changed in response, where, and why. All three
points are fixed as of commit `a864f91` and are live on the deployed instance
(contract `0x62dE8cd09b09721d665C4ec14aFAaDbDf15bdFdc`, backend
`obolus-backend.fly.dev`, frontend `obolus-app.vercel.app`).

---

## 1. "Interested parties can supply mutable, unauthenticated pages"

**Problem.** `submit_death_claim` and `contest_claim` accepted any `http(s)://` URL.
Evidence is fetched by validators only inside `resolve_claim`'s non-deterministic
round — which runs *after* the contest window closes, sometimes days or months after
submission. A live page is editable (or removable) by whoever controls it at any point
in that gap. A claimant or contester with control over the page they cited could
submit it while it said one thing, then edit it before resolution actually reads it —
there was nothing binding the judged content to what existed at submission time.

**Fix.** `contracts/obolus.py`:

- New `_require_committed_url(url, field)` (replaces `_normalize_url` at every
  evidence-URL call site) requires the URL to be a Wayback Machine snapshot:
  `https://web.archive.org/web/<14-digit-timestamp>/<original-url>`. A bare live URL
  is now rejected with `[EXPECTED] ... must be a Wayback Machine snapshot URL ...`.
- Applied to all four evidence inputs: `evidence_urls_json`, `evidence_image_url`
  (in `submit_death_claim`), `contest_urls_json`, `contest_image_url` (in
  `contest_claim`) — via `_parse_urls_json`, which now calls
  `_require_committed_url` instead of `_normalize_url` for every URL in the array.
- A Wayback snapshot is fixed at capture time and cannot be edited by the page's
  operator, the submitter, or anyone else afterward — it's the cheapest widely
  available commitment mechanism that doesn't require a new nondet call site
  (submission stays deterministic; only `resolve_claim` still does the actual fetch).

**Where to look:** `contracts/obolus.py`, `_require_committed_url` (~line 147),
`_parse_urls_json` (~line 192), and the two call sites in `submit_death_claim` /
`contest_claim`.

**User-facing:** `frontend/src/pages/SubmitClaimPage.jsx` and
`frontend/src/pages/VaultDetailPage.jsx` now hint at the archive.org requirement and
link to `web.archive.org/save` directly in the evidence-URL fields, with placeholder
text showing the expected format.

**Tests:** `tests/direct/test_obolus.py` — all evidence/contest URL fixtures now go
through a new `archived(url, ts=...)` helper that wraps them as Wayback snapshot URLs,
matching what the contract now requires.

---

## 2. "Early contests can crowd stronger later evidence out of resolution"

**Problem.** `_aggregate_contest_evidence` filled the fixed
`MAX_CONTEST_URLS_PER_RESOLUTION` (5) URL budget first-come-first-served: it walked
contests in submission order and kept appending each contest's URLs until the cap
hit. A single early contest submitting its full 5-URL allowance could consume the
*entire* resolution-round budget, meaning every later contester's evidence — no
matter how strong, and despite being fully bonded and validly submitted — was
silently never fed to the model at all.

**Fix.** `contracts/obolus.py`, `_aggregate_contest_evidence` now allocates the same
fixed budget **round-robin across every stored contest**: contest 1's first URL,
contest 2's first URL, ..., then contest 1's second URL, and so on, stopping once the
budget is full. Every bonded contest is now guaranteed at least one slot (as long as
the number of contests submitted is ≤ the budget) before any single contest gets a
second. The single contest-image slot (budget of 1, matching the 2-image total)
remains "first contest with an image, in submission order" — the only fair rule
possible with exactly one slot.

Contests are still fully append-only and immutable, as before — this change only
affects how the fixed per-resolution budget is *shared* across the contests already on
record, not which contests exist or what they contain.

**Where to look:** `contracts/obolus.py`, `_aggregate_contest_evidence` (~line 891).

**Verified:** manually exercised with a synthetic case (one contest submitting 5 URLs,
a second submitting 1) — the second contest's URL is now included in the aggregate
instead of being dropped. See commit `a864f91` message for the walkthrough.

---

## 3. "Remove or authenticate the service-key write routes"

**Problem.** `backend/src/routes/{vaults,claims,misc}.js` exposed every contract write
(`create_vault`, `fund_vault`, `set_beneficiary`, `cancel_vault`,
`submit_death_claim`, `contest_claim`, `resolve_claim`, `withdraw`, and the four
`/admin/*` owner-only calls) as plain, unauthenticated `POST` routes signed by the
backend's own `GENLAYER_PRIVATE_KEY` relayer account — not the caller's identity. The
deployed frontend never called them (it signs everything with the connected wallet via
`frontend/src/lib/writes.js`), but nothing stopped anyone who found the API from
calling them directly. Worst case: if the relayer key happened to be the contract
owner, anyone on the internet could call `/admin/owner` and steal ownership, or
`/admin/pause` to grief the platform, with zero authentication.

**Fix (authenticate, not remove — these routes are a documented fallback for
non-browser callers).** New `backend/src/auth.js` exports `requireServiceKey`, an
Express middleware that:

- 503s outright if `BACKEND_SERVICE_KEY` isn't configured on the server (the default —
  writes are disabled, not "open with no key required").
- 401s if the request's `x-service-key` header doesn't match `BACKEND_SERVICE_KEY`.

Applied to **every** write route: `POST /vaults`, `/vaults/:id/fund`,
`/vaults/:id/beneficiary`, `/vaults/:id/cancel`, `/vaults/:vaultId/claims`,
`/claims/:id/contest`, `/claims/:id/resolve`, `/balances/withdraw`, `/admin/pause`,
`/admin/unpause`, `/admin/minimum-bonds`, `/admin/owner`. Read routes (`GET /vaults`,
`GET /claims/:id`, `/platform/*`, `/balances/:address`) are untouched — no key needed
for reads.

**Deployed verification:** `POST https://obolus-backend.fly.dev/admin/pause` →
`503` (no `BACKEND_SERVICE_KEY` set on the live instance, by design — the relayer
fallback is off until someone actually needs it).

**Where to look:** `backend/src/auth.js` (new), and the `requireServiceKey` import at
the top of each modified route file plus its insertion into every `.post(...)` call in
`backend/src/routes/vaults.js`, `claims.js`, `misc.js`, and the one route mounted
directly in `backend/src/server.js`.

**Config:** `.env.example` documents `BACKEND_SERVICE_KEY` (`openssl rand -hex 32` if
you actually need the relayer fallback enabled); `README.md` §7–9 updated to match.

---

## Related: cache staleness across contract redeploys (not in the original review, fixed opportunistically)

While redeploying to the new contract address, `backend/src/cache.js`'s Redis-backed
read cache was keyed only by e.g. `vault:1` — a bare numeric id. Vault/claim ids are
1-indexed *per contract deployment*, so `vault:1` on a freshly redeployed contract is
an unrelated record to whatever `vault:1` meant under the previous deployment, and a
stale cache entry (up to 15s TTL) could briefly serve old-contract data as if it were
the new contract's right after a redeploy. Every cache key is now prefixed with the
active `VDE_CONTRACT_ADDRESS` (`cache.js`'s `scopedKey`), so switching contract
addresses makes every prior entry unreachable immediately — no manual flush needed,
and it's structurally impossible for two different contract deployments to collide in
the cache going forward.

---

## Deployment record

- Contract redeployed to `0x62dE8cd09b09721d665C4ec14aFAaDbDf15bdFdc` (StudioNet).
- `flyctl secrets set VDE_CONTRACT_ADDRESS=... --app obolus-backend`, then
  `flyctl deploy --config fly.toml --dockerfile backend/Dockerfile --app obolus-backend`
  to ship the auth/cache-scoping code alongside the new address.
- `vercel --prod` from `frontend/` to ship the updated evidence-URL hints.
- Verified live: `GET /health` ok, `GET /platform/network` returns the new contract
  address, `GET /platform/stats` shows `vault_count: 0` / `claim_count: 0` (clean
  slate — no carry-over from the previous deployment), `POST /admin/pause` → `503`.
