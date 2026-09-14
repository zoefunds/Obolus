# V1 Milestone — USDC on Base Sepolia

This milestone replaces GEN (GenLayer's native token) with real USDC on Base Sepolia as the
funding, staking, and payout asset across the entire app, and migrates the backend off a
Fly.io account the team lost access to. GenLayer keeps doing exactly what it's good at —
consensus-judged, evidence-based adjudication — and stops touching money. Money now lives
entirely in a purpose-built escrow contract on Base Sepolia.

## Why

GEN is GenLayer's native gas/value token — fine for a hackathon demo, but not what a real
inheritance product should hold value in. USDC is the asset people actually want their
estate denominated in, and Base Sepolia gives a real EVM chain with real USDC (Circle's
official Base Sepolia deployment) to hold it. This also follows the same split-chain
pattern already proven in two sibling GenLayer projects on this machine (`meme-olympics`,
`Event-Weaver`): **GenLayer judges, a Base contract custodies.**

## Architecture

```
React frontend (Vercel)
  |                              \
  | GenLayer wallet writes:       \ Base Sepolia wallet writes:
  | declare vault/claim/contest     approve USDC, deposit, claim
  | amounts (no value moves here)   (real USDC moves here)
  |                                  \
  v                                   v
GenLayer StudioNet contract        ObolusEscrow.sol (Base Sepolia)
(contracts/obolus.py)              (contracts/base/ObolusEscrow.sol)
  - vault/claim/contest bookkeeping   - holds real USDC per vault
  - death-verdict consensus            (deposits + bonds share one pool)
  - records Settlement rows            - settle() credits recipients,
    (who is owed how much)               gated by a cumulative-allocation
                                          guard, callable only by the relayer
       ^                                - claim()/claimMany() — self-serve,
       | reads pending settlements        anyone can pull their own credit
       | pushes them to Base
       |
Express backend (Fly.io: obolus-api)
  - relayer: sweeps GenLayer's pending settlements onto ObolusEscrow.settle()
  - builds approve+fundVault / claim calldata for the frontend to sign
  - cached reads (contract-address-scoped, so a redeploy can't serve stale data)
```

### Trust boundaries

| Component | Responsibility | Cannot do |
|---|---|---|
| GenLayer contract | Vault/claim/contest state, death-verdict consensus, computes who is owed what | Custody or transfer USDC |
| ObolusEscrow (Base) | Custodies USDC, credits recipients, lets them self-claim | Decide a verdict or alter payout amounts |
| Backend relayer | Relays GenLayer's already-computed settlements to Base | Choose who gets paid, or how much |
| User wallet | Approves, deposits, declares, claims | Move someone else's funds |

## What changed

### 1. Smart contract (`contracts/obolus.py`)

- Removed every `@gl.public.write.payable` decorator and all `gl.message.value` reads —
  the contract is now entirely value-free.
- `create_vault`, `fund_vault`, `submit_death_claim`, `contest_claim` now take a declared
  `*_usdc` integer argument (USDC base units, 6 decimals) instead of attached native value.
  The caller backs that declaration with a real deposit on `ObolusEscrow.fundVault()`.
- Removed the native-transfer path entirely (`_Recipient`/`_send_gen`/`gl.evm.contract_interface`)
  and the pull-based `withdraw()` function — there is no internal withdrawable balance
  anymore.
- Added a `Settlement` dataclass and storage (`settlements`, `vault_settlement_ids`,
  `settlement_count`): every payout instruction produced by `resolve_claim` or
  `cancel_vault` is recorded as a row instead of credited to an internal balance.
- Added `get_pending_settlements(vault_id)`, `get_settlements_for_vault(vault_id)`, and
  `mark_settlements_relayed(settlement_ids_json)` — the interface the backend relayer uses
  to sweep settlements onto Base Sepolia exactly once each.
- Renamed every `*_wei` field to `*_usdc` (`balance_usdc`, `claimant_bond_usdc`,
  `bond_usdc`, `min_claimant_bond_usdc`, `min_contester_bond_usdc`,
  `total_escrowed_usdc`, `total_paid_out_usdc`).
- All 61 direct-mode tests (`tests/direct/test_obolus.py`) rewritten for the new
  value-free signatures and passing; `genvm-lint` clean.

### 2. Base Sepolia payment layer (new)

- `contracts/base/ObolusEscrow.sol` — a from-scratch escrow contract (no external
  dependencies, deployable with plain `solc`):
  - `fundVault(vaultId, amount)` — anyone deposits USDC into a vault's pool (initial
    funding, top-ups, claimant bonds, and contester bonds all share one pool per vault).
  - `settle(vaultId, recipients[], amounts[])` — relayer-only, pushes one settlement
    round. Not single-use like a typical "set winners once" pattern — a vault can be
    settled many times over its life (REFUTED/INCONCLUSIVE reopens it for a fresh claim),
    so this instead enforces a running cumulative-allocation guard against what's actually
    been deposited.
  - `claim(vaultId)` / `claimMany(vaultIds[])` — self-serve pull pattern,
    checks-effects-interactions, reentrancy-guarded.
  - Owner controls: `setRelayer`, `transferOwnership`, `withdrawUnallocated` (can only
    reclaim never-allocated deposits, never anything already credited to someone).
- `contracts/base/deploy.js` — deploys via `ethers` + `solc`, reading the deployer key
  from env only (never a CLI arg or committed file).
- Deployed to Base Sepolia: **`0x1f26b190819BFf558e9FeBdC319ea9D9F1Ad6AD6`**
  (USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, Circle's official Base Sepolia
  deployment). An earlier deploy at `0x4b8E4E5C44D8d597Bb0d5Ab96c70072bEAd745EE` was
  superseded when the GenLayer contract was redeployed fresh — see "Redeploys" below.

### 3. Backend (`backend/`)

- `backend/src/baseSepolia.js` — the only module that talks to `ObolusEscrow`:
  builds approve+fundVault calldata for the frontend, relays pending settlements via
  `settle()`, reads pool/claimable balances, and turns a GenLayer vault id into the
  escrow's `bytes32` key.
- New/updated routes (`backend/src/routes/vaults.js`, `claims.js`, `misc.js`):
  - `GET /vaults/:id/escrow-fund-calldata` — approve + fundVault calldata for a declared
    amount.
  - `GET /vaults/:id/escrow-claim-calldata` — self-serve `claim()` calldata.
  - `GET /vaults/:id/settlements`, `GET /vaults/:id/pending-settlements` (via GenLayer
    reads) and `POST /vaults/:id/relay-settlements` — deliberately **permissionless**,
    same reasoning as `resolve_claim` being permissionless: it only ever relays amounts
    GenLayer already computed, and the escrow's own allocation guard is the real backstop.
  - `resolve_claim` and `cancel_vault` routes auto-sweep settlements immediately after
    a successful call (best-effort; a failure there never fails the response, since the
    settlement stays queryable/relayable later).
  - `GET /balances/:address` now reads real claimable USDC from `ObolusEscrow` instead of
    an internal GenLayer ledger.
  - Removed `POST /balances/withdraw` (no `withdraw()` on the contract anymore).
- `.env.example` documents the new `BASE_SEPOLIA_*` / `OBOLUS_ESCROW_ADDRESS` vars.

### 4. Frontend (`frontend/`)

- `lib/usdc.js` replaces `lib/gen.js` — 6-decimal formatting instead of 18-decimal.
- `lib/baseSepoliaWallet.js` — chain-switches the connected wallet to Base Sepolia
  (84532) and sends the approve/deposit/claim steps the backend hands back as calldata,
  waiting for each receipt before sending the next.
- Every value-carrying flow (create vault, fund vault, submit claim, contest claim) is now
  a two-step wallet flow: declare on GenLayer, then approve+deposit on Base Sepolia.
- Claiming a payout is a direct, self-serve Base Sepolia transaction — no backend
  involvement, no relayer needed on that path.
- All UI copy and labels swapped from GEN to USDC across every page.

### 5. A real bug found and fixed during testing

The very first live test (create a vault through the deployed app) surfaced a bug:
**"Vault created but no vault id was returned."** The frontend was reading a write's
return value from `receipt.data.result`, but genlayer-js's wallet client doesn't put it
there — `receipt.data` is the call's own calldata, and `receipt.result` is just a numeric
consensus status code (e.g. `6` for `MAJORITY_AGREE`). The actual return value (a vault id,
a claim id, `resolve_claim`'s verdict dict) lives at
`consensus_data.leader_receipt[].result.payload`, and genlayer-js only includes the raw
bytes needed to decode it when `waitForTransactionReceipt` is called with
`fullTransaction: true` — otherwise it silently strips them down to a human-readable
string only.

Fixed in `frontend/src/lib/genlayerBrowser.js` (pass `fullTransaction: true`) and
`frontend/src/lib/writes.js` (decode the raw payload with genlayer-js's own
`abi.calldata.decode`, exposed as `resultValue` on every write). Verified live: created
several real vaults via script, confirmed the vault id decoded correctly, then cancelled
them to leave the contract clean.

### 6. Fly.io backend migrated off the lost account

The original `obolus-backend` Fly app was on an account the team no longer has access to.
- New app **`obolus-api`** created on the connected Fly account (`obolus-backend` was
  already taken globally by the old account).
- Every reference renamed across `fly.toml`, `frontend/vercel.json`'s API rewrite target,
  `package.json` pm2 scripts, `ecosystem.config.cjs`, and the `/health` route's service
  label.
- Deployed and verified live at `obolus-api.fly.dev` (2 machines, health checks passing).

### 7. Two fresh GenLayer redeploys, two fresh Base escrow redeploys

The GenLayer contract was redeployed twice during this milestone (by the project owner,
on GenLayer Studio — chain id `61999`), and the Base Sepolia escrow was redeployed to
match each time, since vault ids and pool state are meaningless across a contract change:

1. First USDC redeploy: `0x7574fb843Cfbf704ACAad82B4073ED47e32DcCc2` — paired with escrow
   `0x4b8E4E5C44D8d597Bb0d5Ab96c70072bEAd745EE`. Used to debug and fix the return-value
   decode bug above; ended up with 8 test vaults (all cancelled/cleaned up before the next
   redeploy).
2. **Current:** `0x396865B47A0311C0254dC7B12c5Ed30683235AcE` — paired with escrow
   `0x1f26b190819BFf558e9FeBdC319ea9D9F1Ad6AD6`. Confirmed fresh: `vault_count: 0`,
   `claim_count: 0`, every stat zeroed, escrow pool empty.

Cache safety: `backend/src/cache.js` namespaces every cached read by the currently
configured contract address, so pointing the backend at a new contract makes every prior
cache entry unreachable immediately — no manual flush was needed on either redeploy.

## Live addresses (as of this milestone)

| What | Address / URL |
|---|---|
| GenLayer contract (StudioNet) | `0x396865B47A0311C0254dC7B12c5Ed30683235AcE` |
| ObolusEscrow (Base Sepolia) | `0x1f26b190819BFf558e9FeBdC319ea9D9F1Ad6AD6` |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Backend API | `https://obolus-api.fly.dev` |
| Frontend | `https://obolus-app.vercel.app` |

## Known follow-ups

- The relayer/deployer key used for the Base Sepolia escrow is a throwaway key shared
  across deploy + relay roles — fine for testnet, should be split and rotated to
  production-grade key management before any real value is involved.
- `POST /vaults/:id/relay-settlements` is intentionally permissionless (mirrors
  `resolve_claim`); worth a rate-limit if it ever sees abuse, though there's nothing to
  gain by spamming it.
- No automated settlement-sweep cron yet — sweeping currently happens opportunistically
  (right after `resolve_claim`/`cancel_vault` from the frontend, or on demand via the
  relay-settlements endpoint). A scheduled sweep job would remove the last manual step.
