# Obolus

**Obolus** is an inheritance escrow that only releases GEN when the truth has been
established — not when a timer runs out, not when one person says so, but when
GenLayer's validator network independently reads real, fetched evidence and agrees.

> In Greek myth, an *obolus* was the coin placed in the mouth of the dead, payment for
> Charon to ferry them across the Styx. Here, the coin only moves once the crossing is
> real.

Built on [GenLayer](https://genlayer.com), an L1 whose smart contracts ("Intelligent
Contracts") can read the open web and reach LLM-judged conclusions under validator
consensus — not just execute deterministic code. Obolus is that capability applied to a
single, high-stakes question: *has this specific named person died?*

**Live:**
- App: [obolus-app.vercel.app](https://obolus-app.vercel.app)
- API: [obolus-backend.fly.dev](https://obolus-backend.fly.dev)
- Contract: `0x82a1e87F2Abc790B950fD645E6D7A5aC27F43f91` on GenLayer StudioNet

---

## Table of contents

1. [The problem](#1-the-problem)
2. [How it works](#2-how-it-works-mental-model)
3. [Why this needs a blockchain with LLM judgment](#3-why-this-needs-a-blockchain-with-llm-judgment-at-all)
4. [Lifecycle & states](#4-lifecycle--states)
5. [Roles](#5-roles)
6. [Evidence model](#6-evidence-model)
7. [Architecture](#7-architecture)
8. [Running it yourself](#8-running-it-yourself)
9. [Deployment](#9-deployment)
10. [API reference](#10-api-reference)
11. [Known limitations](#11-known-limitations)

---

## 1. The problem

Every "digital inheritance" or "dead man's switch" product live today uses one of two
mechanisms, and both are broken:

- **Inactivity timers.** No login/check-in for N days → funds move. But silence isn't
  death. People travel, get hospitalized, lose a phone, go to prison, or just take a
  break. An inactivity timer cannot tell "he died" apart from "he's on a boat."
- **A trusted executor.** One person (or committee) decides, and their word is final.
  This recreates the exact thing probate courts exist to referee: a family member
  disputes the call, the executor is slow, conflicted, or wrong, and there is no
  built-in way to adjudicate it except lawyers and time.

Obolus replaces both with a third option: **produce evidence, give anyone with contrary
evidence a real window to contest it, and let independent validators judge the
totality of that evidence** — obituaries, registries, news, an optional certificate
screenshot, and any "proof of life" counter-evidence — before a single unit of value
moves.

## 2. How it works (mental model)

Three linked primitives:

1. **A vault** — a pot of GEN a grantor locks up, naming *who gets it* (the
   beneficiary) and *whose death unlocks it* (the subject — usually the grantor
   themself, but not required to be).
2. **A claim** — anyone can say "I believe the subject has died, here's my evidence."
   They post a bond as skin in the game. This opens a **contest window**, timed off
   the chain's own clock (not a caller-supplied timestamp — see §6).
3. **A resolution** — once the window closes, anyone can trigger judgment. GenLayer
   validators independently fetch every submitted URL (the claim's own evidence, plus
   every contest filed against it), look at any attached images, and each reach a
   categorical verdict. They must **agree exactly** on the verdict category and
   confidence band for it to count — this is consensus, not one model's opinion.

The verdict can only go three ways, and only one of them moves money:

| Verdict | What it means | What happens |
|---|---|---|
| **CONFIRMED** (deceased, high confidence) | Evidence concretely and specifically names this subject as deceased | Vault balance → beneficiary. Claimant's bond returned. Every contester's bond (if any) is forfeited into the same payout. |
| **REFUTED** (alive, high confidence) | Evidence concretely shows the subject was active/alive after the claim, or directly contradicts it | Nothing paid out. Claimant's bond is slashed into the vault. Every contester's bond returned to its own submitter — they were right. |
| **INCONCLUSIVE** (abstain) | Evidence is thin, ambiguous, contradictory, or unreachable | *Nothing happens to the vault.* Claimant's bond AND every contester's bond returned in full. A fresh claim can be tried later with better evidence. |

Claims can accumulate **multiple contests** — every counter-evidence submission is
stored as its own row (append-only, up to `MAX_CONTESTS_PER_CLAIM = 20`), and every
stored contest is fed into the same resolution round and routed individually. No
contest can ever be edited or overwritten, including by its own submitter or a later
contester — a stronger proof-of-life submission already on record can't be silently
erased by whoever contests next.

**Abstention is the default, not a failure mode.** Confidence itself is a category —
LOW / MEDIUM / HIGH — never a number, and only HIGH ever flips a terminal state. A model
convinced-but-not-certain lands on INCONCLUSIVE by contract rule, not by asking the model
to be modest.

## 3. Why this needs a blockchain with LLM judgment at all

- An **off-chain API** just relocates the trusted-executor problem to a company.
- A **price-feed oracle** doesn't apply — there's no number for "did a person die."
- A **hash/deterministic check** doesn't apply — the inputs are prose (news articles,
  registry pages) and the question is a reading-comprehension + disambiguation problem
  (same name ≠ same person; a premature obituary; a stale article).
- An **optimistic-oracle + human dispute committee** is closer, but the dispute
  resolution itself is still off-chain and manual. Obolus's contest window *is* the
  dispute window, but resolution stays on-chain, evidence-driven, and bonded — no
  committee to seat.
- A **single LLM call** means whoever controls that call controls the payout, with no
  independent check.

At least three parties have opposing incentives here — the beneficiary (wants release),
the subject if actually alive (wants to prevent wrongful release), and any claimant or
contester (who may be biased either way). Validator consensus is the only mechanism that
lets the money and the judgment live in the same trust-minimized place without
appointing a fixed committee.

## 4. Lifecycle & states

**Vault status:** `ACTIVE` → `CLAIM_PENDING` → (`PAYOUT_READY` | back to `ACTIVE`), or
`ACTIVE` → `CANCELLED`.

```
                 create_vault (fund with GEN)
                          │
                          ▼
                     ┌─────────┐   submit_death_claim   ┌───────────────┐
        cancel_vault │ ACTIVE  │ ───────────────────────▶│ CLAIM_PENDING │
        (grantor,    └─────────┘                          └───────────────┘
        refund) ▲          ▲                                     │
                 │          │  REFUTED / INCONCLUSIVE            │ resolve_claim
                 │          └─────────────────────────────────────┤ (CONFIRMED, HIGH)
            ┌──────────┐                                          ▼
            │CANCELLED │                                  ┌───────────────┐
            └──────────┘                                  │ PAYOUT_READY  │
                                                            └───────────────┘
```

**Claim status:** `OPEN` → (optionally) `CONTESTED` → one terminal state:
`CONFIRMED`, `REFUTED`, or `INCONCLUSIVE` (the last two reopen the vault to `ACTIVE`).

**Fund destinations, every terminal branch:**

| Outcome | Vault balance | Claimant's bond | Contester's bond |
|---|---|---|---|
| Grantor cancels (no open claim) | → grantor, withdrawable | n/a | n/a |
| `CONFIRMED` | → beneficiary, withdrawable | → returned to claimant | → each forfeited into beneficiary's payout |
| `REFUTED` | stays in vault, reopens `ACTIVE` | → forfeited into vault | → each returned to its own contester |
| `INCONCLUSIVE` | untouched, reopens `ACTIVE` | → returned to claimant | → each returned to its own contester |

("Contester's bond" is plural in practice — see §6 for why a claim can carry more than
one.)

**All payouts are pull-based.** A verdict only *credits* an internal balance; the actual
transfer happens only when the recipient calls `withdraw()`. Check the **Balance** page
in the app (or `GET /balances/:address`) — money can be sitting there from an old claim
you've forgotten about.

## 5. Roles

| Role | Can do | Cannot do |
|---|---|---|
| **Grantor** | Create/fund a vault, change beneficiary, cancel — but *only* while the vault is `ACTIVE` with no open claim | Touch a vault once a claim is pending — these powers freeze the moment judgment starts |
| **Beneficiary** | Withdraw once `PAYOUT_READY` | Nothing else — no vault-side powers |
| **Claimant** | Anyone — submit a death claim with evidence + a bond | Force a verdict; the outcome is evidence-driven only |
| **Contester** | Anyone — submit counter-evidence + a bond before the deadline; more than one person may contest the same claim | Force a verdict; edit or remove a previously stored contest, even their own |
| **Resolver** | Anyone — trigger `resolve_claim` once the window closes | Nothing extra; permissionless, not a privileged action |
| **Platform owner** | Pause/unpause new activity, set minimum bonds, transfer ownership | **Cannot ever move funds.** Explicitly cannot block `resolve_claim` or `withdraw` even while paused |

Claiming and contesting are deliberately open to anyone, not just the grantor's known
circle — a co-heir or acquaintance may hold evidence the grantor's own family can't
produce, including the exact case where it's the grantor's own keys, not their life,
that's been lost.

## 6. Evidence model

A **death claim** takes:
- 1–5 evidence URLs (obituary, registry, news) — fetched live by validators as text, not
  trusted as typed-in claims.
- an optional single image URL (certificate/obituary page) — captured as a screenshot or
  raw image and shown to the model visually.
- a free-text note (context only, e.g. "I'm his nephew" — never itself evidence).
- a bond in GEN.

A **contest** takes the mirror image: 1–5 URLs, one optional image, a bond. Contests are
**append-only** — each submission is stored as its own row (`get_contests_for_claim`
returns the full list), capped at `MAX_CONTESTS_PER_CLAIM = 20` per claim. Nobody,
including the original submitter, can edit or overwrite a stored contest; a stronger
proof-of-life submission already on record can never be silently replaced by whoever
files next. All stored contests are aggregated and fed into the same resolution round
(bounded to `MAX_CONTEST_URLS_PER_RESOLUTION` total URLs, earliest-submitted first), and
each contester's own bond is routed individually based on the final verdict — nobody's
stake gets merged into someone else's.

A dead/unreachable source is **never** treated as evidence of anything — the model is
explicitly instructed that `FETCH_FAILED` is neutral, not suspicious.

**Timing is chain-derived, not caller-supplied.** Every timestamp used for the contest
window and resolution eligibility comes from the chain's own clock (`_chain_now_ts()`),
not a `now_ts` argument a caller could pass in — an earlier design took a caller-supplied
timestamp on several methods, which would have let a claim be timed by a spoofed value;
that parameter has been removed from `create_vault`, `cancel_vault`,
`submit_death_claim`, `contest_claim`, `resolve_claim`, and `is_resolvable`.

## 7. Architecture

```
contracts/obolus.py                      the Intelligent Contract itself (GenVM/Python)
examples/estate_planner_example.py       a worked consumer contract integration
tests/direct/                            59+4 direct-mode pytest tests
scripts/deploy.mjs                       deploys via genlayer-js (not the CLI — it hardcodes value: 0n)
backend/                                 Express API — reads (cached), plus a relayer-signed write fallback
frontend/                                React + Vite app — writes are signed by the connected wallet
video/                                   demo video production materials (storyboard, voiceover, on-screen copy)
```

### How a write actually happens

**Every write in the deployed app is signed by the user's own connected wallet — not a
server-held key.** `frontend/src/lib/genlayerBrowser.js` builds a `genlayer-js` client
whose `account` is the wallet's address (a plain string), which makes the SDK route
signing through the injected wallet (`window.ethereum`) instead of a private key. On
connect, the app force-switches the wallet onto GenLayer StudioNet
(`wallet_switchEthereumChain` / `wallet_addEthereumChain`) so a write can't silently land
on the wrong chain.

The backend's `/vaults`, `/claims`, `/admin` **write** routes still exist
(`backend/src/contract.js`, signed by a `GENLAYER_PRIVATE_KEY` relayer key), kept as an
alternative API surface for non-browser callers — scripts, other services — but the
deployed frontend doesn't call them. Reads always go through the backend: cached
(Redis, 5–15s TTL) and cheap, no signature needed.

### Admin surface

`/admin` (pause/unpause, minimum bonds, ownership transfer) is only shown in navigation,
and only rendered, when the connected wallet matches the contract's current owner
(`get_config().owner`). This is a UX guard, not the real access control — the contract
itself enforces `only the owner may call this` on-chain regardless of what the frontend
shows.

### Why `resolve_claim` is slow

It's the contract's one non-deterministic step: fetching evidence URLs, optionally
capturing images, running one LLM call, and reaching validator consensus on the verdict.
Every other write is a fast, plain transaction. The UI treats "Resolve" as a distinct
longer-running action (a few seconds to a few minutes) rather than styling it like the
instant writes.

## 8. Running it yourself

```bash
git clone https://github.com/zoefunds/Obolus.git
cd Obolus
npm install

# Contract
genvm-lint check contracts/obolus.py --json
pip install -r requirements.txt
pytest tests/direct/ -v          # 59 tests on the primitive, 4 on the consumer example

# Configure
cp .env.example .env
# fill in GENLAYER_PRIVATE_KEY (only needed for scripts/deploy.mjs and the backend's
# relayer write fallback — the deployed frontend signs with a browser wallet instead),
# VDE_CONTRACT_ADDRESS (skip this if you're about to deploy your own), REDIS_URL (optional)

# Deploy your own contract instance (writes VDE_CONTRACT_ADDRESS into .env)
node scripts/deploy.mjs

# Backend — http://localhost:4000
npm run backend

# Frontend — http://localhost:5173, proxies /api → backend in dev
npm run frontend
```

To use the frontend against your own contract, connect a wallet, add/select GenLayer
StudioNet (chain id `61999`, RPC `https://studio.genlayer.com/api` — the app prompts for
this automatically on connect) and make sure `VDE_CONTRACT_ADDRESS` on the backend points
at your deployment (`GET /platform/network` exposes it to the frontend).

## 9. Deployment

The live instance runs on Fly.io (backend) and Vercel (frontend):

```bash
# Backend — Fly.io, 2 machines, never scales to zero (fly.toml:
# min_machines_running = 1, auto_stop_machines = false)
flyctl apps create <your-app-name>
flyctl secrets set \
  VDE_CONTRACT_ADDRESS=0x... \
  GENLAYER_PRIVATE_KEY=0x... \
  REDIS_URL=rediss://... \
  --app <your-app-name>
flyctl deploy --config fly.toml --dockerfile backend/Dockerfile --app <your-app-name>

# Frontend — Vercel; frontend/vercel.json rewrites /api/* to the Fly backend
# server-side, so the browser never makes a cross-origin call for reads
cd frontend
vercel --prod
```

Two Vercel settings worth knowing if you fork this: **Deployment Protection (SSO)** is
on by default for team-scoped projects and will 302 every request, including custom
aliases — disable it per-project (`vercel project protection disable <name> --sso`) if
the site needs to be public. And `<name>.vercel.app` is a **global** namespace across all
Vercel accounts, not scoped to yours — your first choice of short name may already be
taken by someone unrelated.

Production process resilience for the backend (`npm run backend:prod`) uses `pm2` via
[`ecosystem.config.cjs`](ecosystem.config.cjs) with `autorestart: true`, on top of
`server.js`'s own `uncaughtException`/`unhandledRejection` handlers that keep the process
serving through a stray rejected promise.

**A note on the exact deployment history, bugs found, and why specific choices were
made** (the StudioNet chain-config bug that silently dropped every write, the
`FINALIZED` vs `ACCEPTED` wait-status bug, the `.env` path resolution issue under pm2,
etc.) lives in [MEMORY.md](MEMORY.md) — worth reading before changing anything in
`backend/src/chains.js`, `backend/src/genlayerClient.js`, or
`frontend/src/lib/genlayerBrowser.js`.

## 10. API reference

**Contract writes** (all payable except `withdraw`/admin calls): `create_vault`,
`fund_vault`, `set_beneficiary`, `cancel_vault`, `submit_death_claim`, `contest_claim`,
`resolve_claim`, `withdraw`, `pause`, `unpause`, `set_minimum_bonds`, `set_owner`.

**Contract views**: `get_vault`, `get_vault_count`, `get_claim`, `get_contests_for_claim`,
`get_claims_for_vault`, `get_vaults_for_grantor`, `get_vaults_for_beneficiary`,
`get_balance_of`, `is_resolvable`, `get_platform_stats`, `get_config`.

Full docstrings live in [`contracts/obolus.py`](contracts/obolus.py). `get_claim`'s
response includes `contest_count` and `total_contester_bond_wei` (aggregates across all
stored contests) rather than a single contester's fields — fetch the individual rows
with `get_contests_for_claim` / `GET /claims/:id/contests`.

**Backend REST surface** (`backend/src/routes/`), all under `/api/*` from the frontend:

| Method & path | Contract call |
|---|---|
| `GET /vaults/:id` | `get_vault` |
| `GET /vaults` | `get_vault_count` |
| `GET /vaults/:id/claims` | `get_claims_for_vault` |
| `GET /vaults/by-grantor/:address` | `get_vaults_for_grantor` |
| `GET /vaults/by-beneficiary/:address` | `get_vaults_for_beneficiary` |
| `POST /vaults` | `create_vault` |
| `POST /vaults/:id/fund` | `fund_vault` |
| `POST /vaults/:id/beneficiary` | `set_beneficiary` |
| `POST /vaults/:id/cancel` | `cancel_vault` |
| `POST /vaults/:vaultId/claims` | `submit_death_claim` |
| `GET /claims/:id` | `get_claim` |
| `GET /claims/:id/contests` | `get_contests_for_claim` |
| `GET /claims/:id/resolvable` | `is_resolvable` |
| `POST /claims/:id/contest` | `contest_claim` |
| `POST /claims/:id/resolve` | `resolve_claim` |
| `GET /balances/:address` | `get_balance_of` |
| `POST /balances/withdraw` | `withdraw` |
| `GET /platform/stats` | `get_platform_stats` |
| `GET /platform/config` | `get_config` |
| `GET /platform/network` | contract address + network name (public, no contract call) |
| `POST /admin/pause` / `/admin/unpause` / `/admin/minimum-bonds` / `/admin/owner` | owner-only writes |

## 11. Known limitations

- **The backend's relayer write routes are a fallback, not the primary path — and are
  currently unauthenticated.** The deployed frontend signs every write with the
  connected wallet; the backend's `GENLAYER_PRIVATE_KEY`-signed routes exist for
  non-browser callers only, but nothing currently stops anyone who finds the API from
  calling them directly (including admin routes, if the relayer key is the owner). Add
  an auth check in front of `backend/src/routes/*` writes, or remove the write routes
  entirely, before treating this backend as a hardened public surface.
- **`resolve_claim` can return `INCONCLUSIVE`** for perfectly true claims if the
  evidence submitted is thin, ambiguous, or unreachable — by design (see §2). Resubmit
  with stronger sourcing.
- **Direct-mode contract tests cannot exercise a real cross-contract call** — see the
  contract's own module docstring and `tests/direct/test_estate_planner_example.py`.
- **A claim's stored contests are bounded** (`MAX_CONTESTS_PER_CLAIM = 20`) — a hostile
  actor spamming contests against one claim can't grow it unboundedly, but a
  legitimately contested claim beyond that count would need a design change (this
  hasn't come up in testing).
- **Wallet-signed writes require GenLayer StudioNet support in your wallet.** The app
  prompts to add/switch the network automatically on connect; this needs standard EIP-1193
  support (`wallet_addEthereumChain`), which most injected wallets (MetaMask, Rabby, etc.)
  provide.
