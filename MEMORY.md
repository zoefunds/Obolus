# Project Memory

A running record of non-obvious decisions, constraints, and fixes for this project — for
reviewers auditing the submission and for anyone picking this repo back up later. Ordinary
"what the code does" belongs in code comments or [README.md](README.md); this file is for the
*why*, especially where it isn't derivable by reading the code alone.

## Origin

This project (`obolus`, formerly working name "wer") reimplements
[`contracts/verifiable_decease_escrow.py`](contracts/verifiable_decease_escrow.py) — a
GenLayer Intelligent Contract originally built and tested in a separate project
(`~/ic2`) by the same author — as a full production app: the contract unchanged, plus
deploy tooling, a backend API, and a frontend. This is a packaging/productization effort
on the author's own prior work, not a fork or derivative of someone else's submission.

## Review-team compliance notes

The review rubric this project is being held to (verbatim, supplied by the user) rules
out: thin/duplicate demo projects, "AI + GenLayer" apps that don't need consensus,
copied/renamed boilerplate, validators that only check output format, contracts that
judge claims from user-submitted text alone, and live-app-only submissions without
source. Relevant to each:

- **Needs validator consensus, not just "an AI feature":** the contract's payout
  decision is irreversible and adversarial (claimant vs. contester vs. subject-if-alive),
  which is exactly the case `gl.eq_principle.prompt_comparative` exists for — see
  `docs/DECISION_RECORD.md` for the 12-idea comparison that led here.
- **Not judged from user-submitted text alone:** `_resolve_nondet` in the contract
  fetches every evidence URL itself inside the nondet block (`gl.nondet.web.render`);
  a claimant's text is never trusted as evidence on its own.
- **Not format-only validation:** the equivalence principle
  (`_resolve_nondet`'s `principle` string) compares `determination` + `confidence`
  *substance*, explicitly not JSON well-formedness.
- **Full source is this repo** — contract, tests, backend, frontend, deploy tooling all
  included, not just a hosted link.

## The value-transfer path (and a bug that silently broke it)

Every payable contract call (`create_vault`, `fund_vault`, `submit_death_claim`,
`contest_claim`) and `withdraw()` moves *real* GEN — this was a hard requirement, not a
simulated balance. The backend's `writeMethod` (`backend/src/contract.js`) passes a real
`bigint value` straight into `genlayer-js`'s `client.writeContract({ value })`, which
embeds it in the actual `addTransaction` call sent to the chain's consensus contract
(verified by reading `genlayer-js@0.8.0`'s `_sendTransaction` source directly — it is
not dropped or defaulted to `0n` anywhere in that path).

**Bug found and fixed:** `genlayer-js@0.8.0` does not ship a "studionet" chain
definition — only `localnet` and `simulator`. An earlier version of this code declared a
brand-new chain object pointing at Studio's RPC URL. That looked reasonable but was
silently broken: the SDK only auto-discovers the on-chain `consensusMainContract`
address (via the `sim_getConsensusContract` RPC method) for its own `simulator` chain
object, matched *by chain id* (`node_modules/genlayer-js/src/chains/actions.ts`,
`initializeConsensusSmartContract`). A new chain object — even one hitting the exact
same RPC endpoint — never gets `consensusMainContract` populated, so every
value-carrying write would have failed with "Consensus main contract not initialized."

**Fix:** GenLayer Studio is a *hosted instance of the Simulator* — same RPC surface.
`backend/src/chains.js` and `scripts/deploy.mjs` now reuse the SDK's own `simulator`
chain object and only override its RPC URL to Studio's endpoint via `createClient`'s
`endpoint` option, so chain-id matching (and therefore consensus-contract discovery,
and therefore real value transfer) works correctly.

**How to verify this stays correct:** `GET /platform/config` should succeed (not
`VDE_CONTRACT_ADDRESS is not configured`, which is a separate, expected state pre-deploy)
once a contract is deployed, and a `POST /vaults` with a nonzero `valueWei` should
produce a vault whose `balance_wei` matches — check with `GET /vaults/:id` immediately
after.

## Writes are signed by the connected wallet, not a server relayer

This went through three iterations worth recording, because the middle one was a
reasonable-looking dead end:

1. **First cut:** a manual "set address" text field — purely a viewing identity
   (`get_vaults_for_grantor`, `get_balance_of`), with every write signed by one
   server-side relayer key (`GENLAYER_PRIVATE_KEY`). Simple, but not what "connect
   wallet" should mean.
2. **Reconsidered:** `genlayer-js@0.8.0`'s own browser-wallet helper
   (`node_modules/genlayer-js/src/wallet/connect.ts`, a MetaMask **Snap** flow) explicitly
   throws for `network === "testnet" || "mainnet"` — *"is not available yet. Please use
   localnet."* That looked like a hard SDK limitation ruling out real signing against
   StudioNet.
3. **Actually shipped:** that restriction is specific to `connect()`'s convenience
   wrapper (which also installs the Snap for calldata pretty-printing) — not to the
   underlying transport. `node_modules/genlayer-js/src/client/client.ts`'s transport only
   branches on `typeof client.account !== "object"` to decide whether to route `eth_*`
   calls through `window.ethereum` instead of plain RPC fetch; it never checks which
   chain you're on. So `frontend/src/lib/genlayerBrowser.js` bypasses `connect()`
   entirely: it manually does the `wallet_switchEthereumChain` /
   `wallet_addEthereumChain` dance (the same one `connect()` does internally, minus the
   Snap install and the network throw) against GenLayer Studio's chain — reusing the
   SDK's own `simulator` chain object with its RPC URL overridden, exactly like the
   backend does (see "The value-transfer path" above) — then builds
   `createClient({ chain: simulator, account: walletAddress })` with the address as a
   **plain string**, not a private-key account object. That's what makes the wallet
   itself sign every transaction.

Every write in the frontend (`frontend/src/lib/writes.js`'s `write()`) now goes through
this connected-wallet client — `create_vault`, `fund_vault`, `submit_death_claim`,
`contest_claim`, `resolve_claim`, `withdraw`, and every admin call. The backend's
`/vaults`, `/claims`, `/admin` **write** routes (`backend/src/contract.js`'s
`writeMethod`, signed by `GENLAYER_PRIVATE_KEY`) are kept only as a documented
alternative API surface for non-browser callers (scripts, other services) — the deployed
frontend no longer calls them. Reads still go through the backend (cached, cheap, no
signature needed): `GET /platform/network` exposes the public contract address + network
name the browser client needs, since neither is secret.

**Update: writes were silently failing, and the real cause was simpler than "GenLayer
doesn't support it."** The user reported "transaction not going through" after this
shipped. Root cause: the whole project was pinned to `genlayer-js@0.8.0`, which
genuinely has no working StudioNet chain (only `localnet`/`simulator`) — so both the
frontend's wallet client *and* the backend's relayer client were built on a hack (reusing
the SDK's `simulator` chain object with its RPC URL swapped to Studio's endpoint). That
hack looked plausible — same RPC surface, `sim_getConsensusContract` exists on both — but
`simulator`'s `consensusMainContract` only ever gets populated by that RPC call
succeeding against `simulator`'s *own* expected shape, and it silently never did against
Studio, so every value-carrying write failed to find a consensus contract to call.

Found the actual fix by reading a second, separate GenLayer project on this machine
(`~/Event-Weaver`) that has confirmed-working StudioNet writes: it uses
`genlayer-js@1.1.8`, which ships a **real** `studionet` chain export — correct RPC URL,
correct chain id, and a hardcoded `consensusMainContract` address + ABI baked into the
SDK itself, no runtime discovery needed at all. Upgraded this project to `genlayer-js@^1.1.8`
everywhere (root, backend, frontend) and deleted the `simulator`-mutation hack entirely —
`backend/src/chains.js` is now a one-line re-export, and `frontend/src/lib/genlayerBrowser.js`
imports `studionet` directly.

**Second, related bug fixed at the same time:** every `waitForTransactionReceipt` call
was waiting for `"FINALIZED"` status, which only lands after StudioNet's appeal window
closes — far later than needed to know the write executed. `~/Event-Weaver` waits for
`"ACCEPTED"` instead (interval 4-5s, 60-90 retries). Changed both
`backend/src/contract.js` and `frontend/src/lib/genlayerBrowser.js` to match.

**Confirmed live**, not just by reading source this time: called `POST /admin/unpause`
against the real deployed contract through the fixed backend and got back a genuine
5-validator consensus result — `"execution_result":"SUCCESS"`, `"result_name":
"MAJORITY_AGREE"`, all 5 validators voting `"AGREE"`, `"status_name":"ACCEPTED"` — in
about 6 seconds. The frontend's browser-wallet path uses the identical `studionet`
chain object and the same `ACCEPTED`-wait logic, so the mechanism is now verified end to
end on the backend side; a live wallet-signed write from an actual browser extension is
still the one thing only the user can confirm from here.

## Backend uptime ("must never die")

Two independent layers, because neither alone is sufficient:

1. **Process-level:** `backend/src/server.js` installs `process.on("uncaughtException"
   / "unhandledRejection", ...)` handlers that log and keep serving, so a stray rejected
   promise outside an Express handler (e.g. from `genlayer-js`'s internal background
   `initializeConsensusSmartContract().catch(...)`) can't take the whole process down.
   Request-scoped errors already go through Express's own error-handling middleware and
   never reach these handlers.
2. **Supervisor-level:** [`ecosystem.config.cjs`](ecosystem.config.cjs) runs the backend
   under `pm2` with `autorestart: true` and exponential backoff, so even a crash that
   *does* exit the process gets restarted automatically. Run via `npm run backend:prod`;
   persist across host reboots with `npx pm2 save && npx pm2 startup`.

## Design system

The frontend's visual language (colors, type scale, glassmorphism, component patterns)
is transcribed from a design brief the user supplied (`DESIGN.md` + four HTML mockups:
landing, create-vault, vault-details-claims, resolution-withdrawal) — see
`frontend/tailwind.config.js` for the token transcription. Per user instruction
(2026-07-27), those mockups were a *reference*, not something to copy-paste: every page
was rebuilt as real React components wired to the actual backend API and the contract's
real state machine (`ACTIVE`/`CLAIM_PENDING`/`PAYOUT_READY`/`CANCELLED`,
`OPEN`/`CONTESTED`/`CONFIRMED`/`REFUTED`/`INCONCLUSIVE`), not the mockups' placeholder
copy/numbers. Type scale was reduced from the mockups' original sizes per user
instruction (2026-07-27, "use small text and not large").

Brand name **Obolus** — the ancient Greek coin placed for Charon's toll, chosen because
funds here only cross on confirmed passage (death), matching the product exactly.

## Live deployment (2026-07-27)

- **Contract:** `0xEd42fEc35Ae47F396668976a8fB16fa9a42aDa05` on GenLayer StudioNet.
- **Backend:** `https://obolus-backend.fly.dev` — Fly.io app `obolus-backend`, 2 machines
  (`min_machines_running = 1`, `auto_stop_machines = false` in `fly.toml`, so it never
  scales to zero — the "must never die" requirement). Redis (Upstash, via `REDIS_URL`
  secret) caches reads with a 5–15s TTL (`backend/src/cache.js`) to cut load on
  StudioNet's RPC; writes always bypass the cache and hit the chain directly.
- **Frontend:** `https://obolus-app.vercel.app` — Vercel project
  `adebiyi2002gmailcoms-projects/obolus` (renamed from its default `frontend`; the plain
  `obolus.vercel.app` was already claimed by an unrelated account — `.vercel.app`
  subdomains are global across all Vercel users, not scoped per-account). Deployment
  Protection (SSO wall) was on by default for team-scoped projects and had to be
  explicitly disabled (`vercel project protection disable obolus --sso`) for the site to
  be publicly reachable at all — the first alias attempt returned a 302 to
  `vercel.com/sso-api` instead of the app. `frontend/vercel.json` rewrites `/api/*` to
  the Fly backend server-side for reads, so the browser never makes a cross-origin call
  for those; writes bypass the backend entirely (see below).
- **`GENLAYER_PRIVATE_KEY`** is set as a Fly secret — supplied directly by the project
  owner as an explicitly-labeled throwaway key, not requested or generated by me (a real
  private key should never be typed into a chat session on request). It's encrypted at
  rest by Fly and never logged. It backs the backend's relayer write routes, which the
  deployed frontend no longer calls (see "Writes are signed by the connected wallet"
  above) — those routes remain live only as an alternate API surface for non-browser
  callers.

### Bugs found and fixed while getting the live deployment working

All four were invisible in local dev against no contract / a placeholder `.env` and only
surfaced once wired to the real deployed contract — worth knowing if similar symptoms
show up after future changes:

1. **`dotenv/config` resolved the wrong `.env`.** `backend/` is a workspace nested under
   the repo root, but `.env` lives at the root; bare `dotenv/config` resolves relative to
   `process.cwd()`, which under pm2's `cwd: "./backend"` is `backend/`, not the root — so
   every env var silently read as unset. Fixed by resolving the root `.env` path
   explicitly in both `genlayerClient.js` and `server.js` (harmless in the Fly/Vercel
   deployment, which uses real env vars / secrets instead of a `.env` file).
2. **A placeholder `GENLAYER_PRIVATE_KEY` crashed the whole process at import time.**
   `.env.example`'s all-zeros placeholder isn't a valid key, and `createAccount()` threw
   synchronously during module load — before Express even started listening. Fixed by
   validating the key shape and degrading to read-only instead of crashing (see
   `genlayerClient.js`).
3. **Reads failed with "window is not defined" when no signing key was configured.**
   `genlayer-js`'s transport checks `typeof client.account !== "object"` to decide
   whether to route `eth_*` calls through `window.ethereum` (assuming a browser) instead
   of plain RPC fetch. A client built with `account: undefined` (the read-only case)
   tripped that check even in Node. Fixed by always giving the client *some* local
   account object — an ephemeral, unfunded one when no real key is configured — since
   `contract.js`'s `writeMethod` already passes the real signing account explicitly per
   write call, overriding this default.
4. **Every dict-returning view came back as `{}`.** `genlayer-js`'s calldata decoder
   returns Python dicts as JS `Map` instances, and `Map` has no own enumerable string
   keys, so Express's `res.json(map)` silently serialized to `{}` — no error, just wrong
   data. Fixed with a recursive `toPlain()` normalizer in `contract.js` that also handles
   `bigint` (which `JSON.stringify` rejects outright).
5. **`waitForTransactionReceipt`'s default budget (3s × 10 retries = 30s) was too
   short.** A plain deterministic write (`pause`/`unpause`) took ~35s to finalize live on
   StudioNet and hit "Transaction status is not FINALIZED" — and `resolve_claim`'s nondet
   round (evidence fetch + LLM verdict + validator consensus) will need far longer than
   that. Raised to 4s × 90 (6 minutes) in both `backend/src/contract.js` and
   `frontend/src/lib/genlayerBrowser.js`. Still worth watching: a genuinely slow
   `resolve_claim` could exceed even that, and a long-held HTTP request on the backend
   path ties up a connection for the whole wait.
6. **`flyctl secrets set` restarts the running image — it does not rebuild it.** Backend
   code changes made after the first `flyctl deploy` (caching, `toPlain`, the
   `/platform/network` route, the longer receipt timeout) silently kept running the old
   image until an explicit `flyctl deploy` was run again. A secrets-only change and a
   code change look identical from the CLI output ("machines updated") but only one of
   them ships new code.
7. **Vercel's Deployment Protection (SSO) blocks even custom `.vercel.app` aliases by
   default on a team-scoped account** — not just the auto-generated preview URLs. A
   freshly aliased custom subdomain still 302'd to `vercel.com/sso-api` until protection
   was explicitly disabled per-project.
