# Obolus

**Obolus** is an inheritance escrow that only releases USDC when the truth has been
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
- API: [obolus-api-gideon.fly.dev](https://obolus-api-gideon.fly.dev)
- GenLayer StudioNet contract: [`0xd7D13F11E636A57333075e1b4e9BCD276b57a44C`](https://explorer-studio.genlayer.com/address/0xd7D13F11E636A57333075e1b4e9BCD276b57a44C)
- Base Sepolia escrow: [`0xBb2a81ffD5a236715f24272f32947501F33D3BF0`](https://sepolia.basescan.org/address/0xBb2a81ffD5a236715f24272f32947501F33D3BF0)
- Base Sepolia USDC: [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e)

The current deployed pair completed a funded six-role public-chain end-to-end test.
The grantor, claimant, contester, beneficiary, relayer, and independent authorizer
were distinct; 0.12 test USDC entered escrow as principal and bonds, StudioNet
finalized a consensus-backed `CONFIRMED` ruling, Base allocated three individually
replay-protected entitlements, and both recipients withdrew. Exact transaction links
and balance deltas are in [`docs/SECURITY_REMEDIATION.md`](docs/SECURITY_REMEDIATION.md).
The verified remediation source and E2E harness are recorded at
[`2f4c481`](https://github.com/zoefunds/Obolus/commit/2f4c481bf33d1013bd4107cdea29505ef9db2f45).

The complete remediation change set starts at commit
[`fa5a9e9`](https://github.com/zoefunds/Obolus/commit/fa5a9e9c55dce069969ec46e8cb95dd9b71fcebb);
use the immutable compare link supplied with the latest release or
[`fa5a9e9...main`](https://github.com/zoefunds/Obolus/compare/fa5a9e9c55dce069969ec46e8cb95dd9b71fcebb...main)
to inspect the current branch tip.

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

See [REVIEW.md](REVIEW.md) for the current remediation summary and
[`docs/SECURITY_REMEDIATION.md`](docs/SECURITY_REMEDIATION.md) for the complete trust
model, deployment references, test gates, and remaining external CI limitation.

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

1. **A vault** — a pot of USDC a grantor locks up (deposited on Base Sepolia, judged on
   GenLayer — see §7), naming *who gets it* (the beneficiary) and *whose death unlocks
   it* (the subject — usually the grantor themself, but not required to be).
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
              create_vault (metadata only, balance starts at 0)
                          │       then fund_vault(payment_id) once
                          │       a real USDC deposit is confirmed
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
| Grantor cancels (no open claim) | → grantor, settled + relayed, claimable on Base | n/a | n/a |
| `CONFIRMED` | → beneficiary, settled + relayed, claimable on Base | → settled + relayed to claimant, claimable on Base | → each forfeited into beneficiary's payout, claimable on Base |
| `REFUTED` | stays in vault, reopens `ACTIVE` | → forfeited into vault | → each settled + relayed to its own contester, claimable on Base |
| `INCONCLUSIVE` | untouched, reopens `ACTIVE` | → settled + relayed to claimant, claimable on Base | → each settled + relayed to its own contester, claimable on Base |

("Contester's bond" is plural in practice — see §6 for why a claim can carry more than
one.)

**All payouts are relayed, then self-claimed — there is no `withdraw()` on GenLayer.**
`resolve_claim`/`cancel_vault` only *record* who is owed what, as a `Settlement` row on
GenLayer (see §7) — no real value moves there. The backend relayer reads the complete
paginated settlement index, verifies individual delivery against Base `settledIds`, and pushes missing (recipient, amount) rows to
`ObolusEscrow.settle()` on Base Sepolia (the app does this automatically right after a
wallet-signed `resolve_claim`/`cancel_vault`, and `POST /vaults/:id/relay-settlements`
can be called again any time as a safe no-op/retry). Only then can the recipient call
`claim()` (or `claimMany()` for several vaults at once) on `ObolusEscrow` themselves, on
Base Sepolia, to actually receive the USDC. Check `getClaimable(vaultId, recipient)` on
the escrow contract (or `GET /vaults/:id/settlements`) — money can be sitting there,
unclaimed, from an old verdict you've forgotten about.

## 5. Roles

| Role | Can do | Cannot do |
|---|---|---|
| **Grantor** | Create/fund a vault, change beneficiary, cancel — but *only* while the vault is `ACTIVE` with no open claim | Touch a vault once a claim is pending — these powers freeze the moment judgment starts |
| **Beneficiary** | Claim their USDC on `ObolusEscrow` (Base Sepolia) once the backend relayer has pushed the settlement from a `PAYOUT_READY` verdict | Nothing else — no vault-side powers; cannot self-serve a payout before it's been relayed |
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
  trusted as typed-in claims. Every URL must be a **Wayback Machine snapshot**
  (`https://web.archive.org/web/<timestamp>/<original-url>`), not a live page — a live
  page is editable (or removable) by whoever controls it at any point between submission
  and the moment `resolve_claim`'s nondet round actually fetches it, which is exactly the
  gap an interested party could otherwise exploit to swap in different content after the
  fact. Archive a source at `https://web.archive.org/save/<url>` first, then submit the
  resulting permalink. (`_require_committed_url` in `contracts/obolus.py` enforces this.)
- an optional single image URL (certificate/obituary page), same Wayback-snapshot
  requirement — captured as a screenshot or raw image and shown to the model visually.
- a free-text note (context only, e.g. "I'm his nephew" — never itself evidence).
- a `payment_id`, i.e. a bond in USDC — but never a number the claimant just types in.
  The claimant first deposits real USDC into `ObolusEscrow.fundVault(vaultId, amount)`
  on Base Sepolia, the backend relayer confirms that specific deposit on-chain and
  attests it to GenLayer as a `Payment` (`record_payment`), and only *that*
  relayer-confirmed `payment_id` can be spent as a bond (`_consume_payment` — see §7).
  The bond amount recorded is always exactly what the confirmed deposit says, never a
  caller-declared figure. An empty `payment_id` is allowed and declares a zero bond.

A **contest** takes the mirror image: 1–5 archived URLs, one optional archived image, a
`payment_id`-bound bond via the same deposit → confirm-payment → spend flow. Contests
are **append-only** — each submission is stored as its own row
(`get_contests_for_claim` returns the full list), capped at `MAX_CONTESTS_PER_CLAIM = 20`
per claim. Nobody, including the original submitter, can edit or overwrite a stored
contest; a stronger proof-of-life submission already on record can never be silently
replaced by whoever files next. All stored contests are aggregated into the same
resolution round. The contract reserves one URL for every accepted contest before
filling the remaining contest-evidence capacity, so all 20 bonded contest slots receive
meaningful consideration and an early five-URL submission cannot exclude a later
contester. Each contester's bond is routed individually from the final verdict;
nobody's stake is merged into someone else's.

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
contracts/obolus.py                      the Intelligent Contract itself (GenVM/Python) — judgment only, value-free
contracts/base/ObolusEscrow.sol          the real USDC custody/payout contract on Base Sepolia
examples/estate_planner_example.py       a worked consumer contract integration
tests/direct/                            86 direct-mode pytest tests on contracts/obolus.py
backend/test/                            node --test coverage for relay, authorizer, and Solidity compilation
contracts/base/test/                     8 executable Foundry escrow security and withdrawal tests
scripts/deploy.mjs                       deploys the GenLayer contract via genlayer-js
contracts/base/deploy.js                 deploys ObolusEscrow.sol to Base Sepolia
backend/                                 Express API, relayer fallback, and Base Sepolia payment relay
backend/src/authorizer.js                separately deployed latest-final settlement/refund authorizer
frontend/                                React + Vite app — writes are signed by the connected wallet
```

### Split-chain design: GenLayer judges, Base Sepolia holds the money

`contracts/obolus.py` is deliberately **value-free** — it never custodies or moves real
USDC itself. It only judges evidence and keeps a declared ledger (`balance_usdc`,
bonds, `Settlement` records). The actual USDC lives in `contracts/base/ObolusEscrow.sol`
on Base Sepolia. Two things bridge the two chains, both driven by the backend acting as
a trusted relayer:

- **Funding in (Base → GenLayer):** a grantor/claimant/contester deposits real USDC into
  `ObolusEscrow.fundVault(vaultId, amount)` on Base Sepolia, which emits a `Deposited`
  event with a unique `paymentId`. The backend's `POST /vaults/:id/confirm-payment`
  route reads that confirmed event/receipt directly off-chain (never trusting anything
  the caller claims) and calls GenLayer's `record_payment(payment_id, vault_id, payer,
  amount_usdc)` — restricted to the contract's configured `relayer` address. The
  resulting `Payment` row is what `fund_vault`, `submit_death_claim`, and `contest_claim`
  each spend exactly once via `_consume_payment`, which checks the payment is unspent,
  was deposited for *this* vault, and by *this* caller — see §6. This is the fix for the
  prior value-free design, where any caller (including a direct contract call bypassing
  the website) could declare an arbitrary `amount_usdc`/`bond_usdc` backed by no real
  deposit at all. A finalized refund tombstone is recorded before any failed-payment
  refund is signed, so an in-flight or later attestation cannot revive refunded USDC.
- **Payout out (GenLayer → Base):** `resolve_claim`/`cancel_vault` never move value —
  they record `Settlement` rows (who is owed what, from which vault's escrow pool). The
  backend reads the complete paginated latest-final settlement index and treats Base's
  per-entitlement `settledIds` as delivery truth. A separately deployed authorizer
  independently repeats that reconciliation and signs the exact ruling hash,
  per-entitlement replay IDs, recipients, amounts, chain, escrow, and expiry. Only then
  can the relayer call `ObolusEscrow.settle`; afterward it calls
  `mark_settlements_relayed(ids, baseTxHash)` at finality. The
  recipient still has to call `claim()`/`claimMany()` on `ObolusEscrow` themselves to
  actually receive the USDC — see §4.

### How a write actually happens

**Every value-bearing action is a three-step flow, split across two chains and two
signers.** Take funding a vault as the example (submitting a claim / contesting one
follow the identical pattern): (1) the connected wallet signs and sends a real USDC
deposit to `ObolusEscrow.fundVault(vaultId, amount)` on **Base Sepolia**; (2) the
frontend calls the backend's `POST /vaults/:id/confirm-payment`, which reads that
deposit's confirmed receipt and — signed by the backend's own relayer key — attests it
to GenLayer via `record_payment`, returning a `payment_id`; (3) the connected wallet
then signs the actual GenLayer write (`fund_vault`, `submit_death_claim`, or
`contest_claim`) passing that `payment_id`. Steps 1 and 3 are user-signed; step 2 is the
one place a server-held key (the relayer) signs on the user's behalf, and it can only
ever attest a deposit it actually observed on Base — it can never fabricate one or move
funds itself.

**Every *other* write in the deployed app is signed by the user's own connected wallet —
not a server-held key.** `frontend/src/lib/genlayerBrowser.js` builds a `genlayer-js` client
whose `account` is the wallet's address (a plain string), which makes the SDK route
signing through the injected wallet (`window.ethereum`) instead of a private key. On
connect, the app force-switches the wallet onto GenLayer StudioNet
(`wallet_switchEthereumChain` / `wallet_addEthereumChain`) so a write can't silently land
on the wrong chain.

The backend's `/vaults`, `/claims`, `/admin` **write** routes still exist
(`backend/src/contract.js`, signed by a `GENLAYER_PRIVATE_KEY` relayer key), kept as an
alternative API surface for non-browser callers — scripts, other services — but the
deployed frontend doesn't call them (it only calls the always-permissionless
`POST /vaults/:id/confirm-payment` and `POST /vaults/:id/relay-settlements` routes
through the backend, both of which touch no funds the caller doesn't already have a
real, chain-verified claim to). Every one of the service-key-gated routes is gated behind
`backend/src/auth.js`'s `requireServiceKey` middleware: the caller must send a
`x-service-key` header matching the server's `BACKEND_SERVICE_KEY` env var, or the route
502s/401s. With no `BACKEND_SERVICE_KEY` configured (the default), the whole relayer
write surface is disabled — since the relayer key signs on behalf of whoever calls it
(not the caller's own identity) and may itself be the contract owner, an unauthenticated
route here would let anyone move funds through the relayer or call the owner-only
`/admin/*` routes. Reads always go through the backend: cached (Redis, 5–15s TTL) and
cheap, no signature needed, no service key required.

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
pytest tests/direct/ -v          # 86 direct-mode tests
npm test --workspace backend     # 28 relay/authorizer/refund/finality/Solidity tests
forge test -vv                   # 8 executable escrow security/withdrawal tests

# Configure
cp .env.example .env
# fill in GENLAYER_PRIVATE_KEY (only needed for scripts/deploy.mjs and the backend's
# relayer write fallback — the deployed frontend signs with a browser wallet instead),
# VDE_CONTRACT_ADDRESS (skip this if you're about to deploy your own GenLayer contract),
# BASE_SEPOLIA_RPC_URL / BASE_SEPOLIA_USDC_ADDRESS / OBOLUS_ESCROW_ADDRESS /
# BASE_SEPOLIA_RELAYER_PRIVATE_KEY (the Base Sepolia payment layer — see §7; skip
# OBOLUS_ESCROW_ADDRESS if you're about to deploy your own escrow),
# SETTLEMENT_AUTHORIZER_URL / SETTLEMENT_AUTHORIZER_TOKEN for the relay and a distinct
# SETTLEMENT_AUTHORIZER_PRIVATE_KEY only in the isolated authorizer service,
# REDIS_URL (optional), and BACKEND_SERVICE_KEY (only when enabling relay write fallback)

# Deploy your own GenLayer contract instance (writes VDE_CONTRACT_ADDRESS into .env)
node scripts/deploy.mjs

# Deploy your own ObolusEscrow instance on Base Sepolia (updates local .env with the
# deployed address and confirmed deployment block)
DEPLOYER_PRIVATE_KEY=... BASE_SEPOLIA_RPC_URL=... RELAYER_ADDRESS=0x... \
  SETTLEMENT_AUTHORIZER_ADDRESS=0x... \
  node contracts/base/deploy.js

# Backend — http://localhost:4000
npm run backend

# Frontend — http://localhost:5173, proxies /api → backend in dev
npm run frontend
```

To use the frontend against your own contracts, connect a wallet, add/select GenLayer
StudioNet (chain id `61999`, RPC `https://studio.genlayer.com/api` — the app prompts for
this automatically on connect) and make sure `VDE_CONTRACT_ADDRESS` and
`OBOLUS_ESCROW_ADDRESS` on the backend point at your deployments (`GET /platform/network`
exposes the GenLayer address to the frontend). Funding, claiming, and contesting also
need a Base Sepolia wallet with test USDC (`BASE_SEPOLIA_USDC_ADDRESS`) and ETH for gas.

## 9. Deployment

The live instance runs as two isolated Fly.io services (relay API and authorizer) plus
the Vercel frontend. Generate separate relay and authorizer keys; the Solidity deploy
rejects using the same address for both roles.

```bash
# Backend — Fly.io, 2 machines, never scales to zero (fly.toml:
# min_machines_running = 1, auto_stop_machines = false)
flyctl apps create <your-app-name>
flyctl secrets set \
  VDE_CONTRACT_ADDRESS=0x... \
  GENLAYER_PRIVATE_KEY=0x... \
  BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
  BASE_SEPOLIA_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  OBOLUS_ESCROW_ADDRESS=0x... \
  BASE_SEPOLIA_RELAYER_PRIVATE_KEY=0x... \
  SETTLEMENT_AUTHORIZER_URL=http://<authorizer-app>.internal:4100/authorize \
  SETTLEMENT_AUTHORIZER_TOKEN=<shared-random-token> \
  REDIS_URL=rediss://... \
  BACKEND_SERVICE_KEY=$(openssl rand -hex 32) \
  --app <your-app-name>
flyctl deploy --config fly.toml --dockerfile backend/Dockerfile --app <your-app-name>

# Independent authorizer — a different Fly app and private key. The relay reaches it
# over Fly's private .internal network; the bearer token remains mandatory.
flyctl apps create <authorizer-app>
flyctl secrets set \
  VDE_CONTRACT_ADDRESS=0x... \
  OBOLUS_ESCROW_ADDRESS=0x... \
  BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
  SETTLEMENT_AUTHORIZER_PRIVATE_KEY=0x... \
  SETTLEMENT_AUTHORIZER_TOKEN=<same-shared-random-token> \
  --app <authorizer-app>
flyctl deploy --config fly.authorizer.toml --dockerfile backend/Dockerfile \
  --app <authorizer-app>

# Frontend — Vercel; frontend/vercel.json rewrites /api/* to the Fly backend
# server-side, so the browser never makes a cross-origin call for reads
cd frontend
vercel --prod
```

The currently configured addresses and immutable deployment references are listed at
the top of this README and in
[`docs/SECURITY_REMEDIATION.md`](docs/SECURITY_REMEDIATION.md). The API's
`GET /platform/network` endpoint is the runtime source of truth for clients.

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

Current production addresses, operational invariants, and the release procedure live
in [MEMORY.md](MEMORY.md). Security rationale and immutable deployment references live
in [`docs/SECURITY_REMEDIATION.md`](docs/SECURITY_REMEDIATION.md).

## 10. API reference

**GenLayer contract writes** (value-free — none are payable; see §7): `create_vault`,
`fund_vault`, `set_beneficiary`, `cancel_vault`, `submit_death_claim`, `contest_claim`,
`resolve_claim`, `record_payment` (relayer-only), `mark_settlements_relayed`, `pause`,
`unpause`, `set_minimum_bonds`, `set_owner`, `set_relayer`, and
`void_payment_for_refund` (relayer-only finalized refund tombstone).

**GenLayer contract views**: `get_vault`, `get_vault_count`, `get_claim`,
`get_contests_for_claim`, `get_claims_for_vault`, `get_vaults_for_grantor`,
`get_vaults_for_beneficiary`, `get_settlements_for_vault`, `get_pending_settlements`,
`get_settlements_page`, `get_pending_settlements_page`, `get_payment`,
`is_payment_voided`, `is_resolvable`, `get_platform_stats`, `get_config`.

**ObolusEscrow (Base Sepolia) writes**: `fundVault`, `settle` (relayer plus an
independent finalized-ruling authorization), `refundFailedPayment` (original payer
plus independent authorization), `claim`, `claimMany`, `setRelayer`,
`rotateSettlementAuthorizer` (current authorizer only), and `transferOwnership`.
There is no owner withdrawal and the owner cannot seize the authorizer role.
**ObolusEscrow views**: `getPool`, `getClaimable`, `totalClaimable`, `paymentExists`,
`deposits`, `settledIds`, `settlementAuthorizationDigest`,
`refundAuthorizationDigest`, `owner`, `relayer`, and `settlementAuthorizer`.

Full docstrings live in [`contracts/obolus.py`](contracts/obolus.py). `get_claim`'s
response includes `contest_count` and `total_contester_bond_usdc` (aggregates across all
stored contests) rather than a single contester's fields — fetch the individual rows
with `get_contests_for_claim` / `GET /claims/:id/contests`.

**Backend REST surface** (`backend/src/routes/`), all under `/api/*` from the frontend:

| Method & path | Body | Contract call |
|---|---|---|
| `GET /vaults/:id` | | `get_vault` |
| `GET /vaults` | | `get_vault_count` |
| `GET /vaults/:id/claims` | | `get_claims_for_vault` |
| `GET /vaults/by-grantor/:address` | | `get_vaults_for_grantor` |
| `GET /vaults/by-beneficiary/:address` | | `get_vaults_for_beneficiary` |
| `POST /vaults` | `{ beneficiary, subjectName, subjectAkaJson, subjectBirthYear, contestWindowSeconds }` | `create_vault` (metadata only — vault starts at balance 0) |
| `GET /vaults/:id/escrow-fund-calldata?amountUsdc=N` | | none — returns `approve` + `fundVault` calldata for the wallet to send on Base Sepolia |
| `POST /vaults/:id/confirm-payment` | `{ txHash }` (of the Base Sepolia deposit) | `record_payment`, after reading the confirmed `Deposited` event itself |
| `GET /vaults/:id/refund-intent?txHash=...&paymentId=...` | | read-only exact EIP-191 message for the original Base payer to sign |
| `POST /vaults/:id/refund-failed-payment-calldata` | `{ txHash, paymentId, payerSignature }` | verifies the original payer, passes independent read-only eligibility preflight, finalizes `void_payment_for_refund`, then returns payer-only Base refund calldata |
| `POST /vaults/:id/fund` | `{ paymentId }` | `fund_vault` |
| `POST /vaults/:id/beneficiary` | `{ newBeneficiary }` | `set_beneficiary` |
| `POST /vaults/:id/cancel` | | `cancel_vault` (+ auto-relays any resulting settlement) |
| `POST /vaults/:vaultId/claims` | `{ evidenceUrlsJson, evidenceImageUrl, note, paymentId }` | `submit_death_claim` |
| `GET /claims/:id` | | `get_claim` |
| `GET /claims/:id/contests` | | `get_contests_for_claim` |
| `GET /claims/:id/resolvable` | | `is_resolvable` |
| `POST /claims/:id/contest` | `{ contestUrlsJson, contestImageUrl, paymentId }` | `contest_claim` |
| `POST /claims/:id/resolve` | | `resolve_claim` (+ auto-relays any resulting settlement) |
| `GET /vaults/:id/settlements` | | `get_settlements_for_vault` |
| `POST /vaults/:id/relay-settlements` | | none — pages through every finalized settlement, reconciles individual IDs against Base, settles missing rows, then records delivery hashes |
| `GET /vaults/:id/escrow-claim-calldata` | | none — returns `claim()` calldata for the wallet to send on Base Sepolia |
| `GET /platform/stats` | | `get_platform_stats` |
| `GET /platform/config` | | `get_config` |
| `GET /platform/network` | | contract address + network name (public, no contract call) |
| `POST /admin/pause` / `/admin/unpause` / `/admin/minimum-bonds` / `/admin/owner` | | owner-only writes |

`POST /vaults`, `POST /vaults/:id/beneficiary`, `POST /vaults/:id/cancel`,
`POST /claims/:id/contest`, and `POST /claims/:id/resolve` are gated behind
`requireServiceKey` (the relayer-signed write fallback — see §7); `POST /vaults/:id/fund`
and `POST /vaults/:vaultId/claims` likewise require a service key at their mount site.
`POST /vaults/:id/confirm-payment` and `POST /vaults/:id/relay-settlements` are
deliberately permissionless — see §7 for why that's safe.

## 11. Known limitations

- **The backend's relayer write routes are a fallback, not the primary path.** The
  deployed frontend signs every write with the connected wallet; the backend's
  `GENLAYER_PRIVATE_KEY`-signed routes exist for non-browser callers only, and are gated
  by `backend/src/auth.js`'s `requireServiceKey` middleware — a caller must present the
  `x-service-key` header matching `BACKEND_SERVICE_KEY`, and with no
  `BACKEND_SERVICE_KEY` configured the routes are disabled outright (503), including the
  owner-only `/admin/*` routes. If you don't have a real non-browser caller for this
  surface, leave `BACKEND_SERVICE_KEY` unset rather than issuing a key.
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
- **Wayback Machine snapshots bind evidence to committed content, not to truth.** A
  snapshot proves "this page said X at capture time" — it doesn't prove X was accurate,
  and a submitter could in principle archive a page they themselves control right after
  editing it to say whatever they want, then submit that snapshot. This closes the
  specific gap the review flagged (content changing between submission and resolution),
  it doesn't make every archived source trustworthy — the LLM verdict still has to weigh
  source credibility (a named registry vs. an anonymous blog) the same way it always did.
  See the evidence and consensus section in
  [`docs/SECURITY_REMEDIATION.md`](docs/SECURITY_REMEDIATION.md).
