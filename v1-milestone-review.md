# V1 milestone review — payment binding (September 2026)

## The ask

> Please bind every principal and bond record to a unique confirmed payment for the
> correct vault and participant, including direct contract calls outside the website.
> Make Base settlement consume a unique settlement identifier and add contract/relay
> tests for unpaid declarations, duplicate payment records and Base success followed
> by failed GenLayer marking, proving retries cannot allocate twice or spend another
> participant's deposit.

This document records exactly what changed in response, where, why, and what's
deployed as of this milestone.

---

## 1. The problem

Since the GEN→USDC/Base Sepolia migration (`44cdcfb`), GenLayer's `create_vault`,
`fund_vault`, `submit_death_claim`, and `contest_claim` all took a bare
caller-supplied `amount_usdc`/`bond_usdc` integer and recorded it directly. There was
no check anywhere that a matching real USDC deposit had actually landed on
`ObolusEscrow` on Base Sepolia. Anyone calling these writes directly against the
GenLayer contract — bypassing the website entirely — could declare an arbitrary
principal or bond backed by nothing.

Separately, `ObolusEscrow.settle()` took no identifier for the settlement batch being
pushed. A relayer retry after a partial failure (Base `settle()` succeeds, the
follow-up `mark_settlements_relayed` call on GenLayer then fails) had no contract-level
guard against re-applying the same batch a second time.

## 2. The fix

### `contracts/obolus.py` (GenLayer)

- New `Payment` dataclass + `payments: TreeMap[str, Payment]` storage, and a
  `relayer: Address` config field (defaults to the deploying owner; rotate later with
  `set_relayer`, owner-only).
- New `record_payment(payment_id, vault_id, payer, amount_usdc)`, relayer-only: attests
  a specific, already-confirmed Base Sepolia deposit. Rejects an empty `payment_id`, a
  non-positive amount, and — the duplicate-payment-record case — recording the same
  `payment_id` twice.
- New `_consume_payment(payment_id, expected_vault_id, expected_payer)`, the single
  choke point every principal/bond declaration now goes through. It rejects:
  - an unknown `payment_id` (the **unpaid-declaration** case — no matching Payment row
    at all);
  - a payment already spent (no double allocation from one deposit — **retries cannot
    allocate twice**);
  - a payment recorded for a different vault (correct-vault binding);
  - a payment recorded for a different payer (a caller **cannot spend another
    participant's deposit**, even one whose `payment_id` they can observe).
- `create_vault` no longer takes `amount_usdc` at all — a vault always starts at
  `balance_usdc = 0`. `fund_vault(vault_id, payment_id)`, `submit_death_claim(...,
  payment_id)`, and `contest_claim(..., payment_id)` replace the old trusted-amount
  params; the credited/bonded amount is always exactly the attested payment's amount.
  An empty `payment_id` still declares a zero bond outright (no transfer is needed to
  back "no bond"), but any *nonzero* bond has no path except a real, relayer-attested
  payment. This applies identically to a call routed through the website and a direct
  call against the contract — there is no code path that skips `_consume_payment`.

### `contracts/base/ObolusEscrow.sol` (Base Sepolia)

- `fundVault` now returns/emits a unique `paymentId` per deposit
  (`keccak256(address(this), vaultId, sender, amount, paymentNonce++)`), which the
  backend relayer reads off the `Deposited` event and attests via `record_payment`.
- `settle()` now takes a `settlementId` and rejects a repeat via a `settledIds`
  mapping — a retried push of the same batch reverts on-chain instead of
  re-allocating.

### Backend (`backend/src/baseSepolia.js`, `routes/vaults.js`, `routes/claims.js`)

- New `readConfirmedDeposit` decodes the real `Deposited` event off an already-mined
  tx receipt — never trusts a client-claimed amount/payer.
- New, deliberately permissionless `POST /vaults/:id/confirm-payment` route calls it,
  then attests the result to GenLayer via `record_payment` — same trust posture as the
  existing `/relay-settlements` route (nothing to gain by calling it early, on someone
  else's tx, or repeatedly; GenLayer's own relayer gate and duplicate-`payment_id`
  rejection are the real backstop).
- New `deriveSettlementId(vaultId, settlementIds)` derives one settlement batch's id
  deterministically from the vault and the exact (sorted) set of GenLayer settlement
  ids being pushed. A retried relay of the same still-pending batch always reproduces
  the same id, which `relaySettlementsToEscrow` now checks against `settledIds` before
  calling `settle()` again — a genuinely new batch still derives a different id and is
  relayed normally.
- `create_vault` / `fund_vault` / `submit_death_claim` / `contest_claim` write routes,
  and the frontend (`CreateVaultPage.jsx`, `SubmitClaimPage.jsx`,
  `VaultDetailPage.jsx`), updated to deposit → confirm-payment → pass `payment_id` into
  the GenLayer write, instead of declaring an amount directly.

## 3. Tests

**`tests/direct/test_obolus.py`** (GenLayer, direct/in-memory mode — 74 passed):

| Test | Proves |
|---|---|
| `test_record_payment_only_relayer` | only the trusted relayer can attest payments |
| `test_record_payment_rejects_duplicate_payment_id` | **duplicate payment records** rejected |
| `test_record_payment_rejects_zero_amount` | a recorded payment must be real (positive) |
| `test_fund_vault_unpaid_declaration_rejected` | **unpaid declarations** rejected |
| `test_fund_vault_cannot_reuse_payment_across_two_vaults` | binding to the correct vault |
| `test_fund_vault_cannot_spend_another_participants_deposit` | can't spend another participant's deposit |
| `test_fund_vault_cannot_double_spend_same_payment` | **retries cannot allocate twice** |
| `test_submit_death_claim_cannot_reuse_vault_funding_payment_as_bond` | a consumed payment can't be replayed as a bond |
| `test_contest_claim_cannot_spend_another_participants_deposit` | same guarantee on the contest-bond path |
| `test_set_relayer_only_owner` / `test_set_relayer_rotates_who_may_record_payments` | relayer rotation is owner-gated and takes effect |
| `test_get_payment_reflects_consumption` | payment state is observable/auditable |
| `test_mark_settlements_relayed_is_idempotent_after_partial_failure` | **Base success, failed GenLayer marking, retry** — GenLayer-side half |

**`backend/test/baseSepolia.test.js`** (new — `node --test`, no live RPC needed; run
via `npm test` in `backend/` — 6 passed):

- `deriveSettlementId` determinism and order-independence.
- `relaySettlementsToEscrow` against a fake `ObolusEscrow`, proving a retried push of
  the same batch calls `settle()` **exactly once** (the Base-side half of the "Base
  success, failed GenLayer marking, retry" scenario), while a genuinely new batch is
  still relayed normally, and an all-zero batch never touches the contract at all.

Also verified: `ObolusEscrow.sol` compiles clean with `solc` (no warnings), and
`frontend` (`vite build`) builds clean against the updated `api.js`/write call sites.

## 4. Deployment record

- **GenLayer contract** redeployed to `0x2712daCEa1b839C1b91F168756F71aDa5065497e`
  (StudioNet), superseding `0x396865B47A0311C0254dC7B12c5Ed30683235AcE` (the
  pre-payment-binding USDC contract, where `amount_usdc`/`bond_usdc` were still
  trusted caller input). Verified live via `get_config`:
  ```json
  { "owner": "0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb",
    "relayer": "0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb" }
  ```
  confirming the relayer address is set correctly — matches the backend's own signing
  key, so `record_payment` calls from this backend will be accepted.
- `backend/.env`'s `VDE_CONTRACT_ADDRESS` updated to the new address.
- **Shipped to production:**
  - `flyctl secrets set VDE_CONTRACT_ADDRESS=0x2712daCEa1b839C1b91F168756F71aDa5065497e --app obolus-api`,
    then `flyctl deploy --config fly.toml --dockerfile backend/Dockerfile --app obolus-api`
    to ship the payment-binding backend code alongside the new address. Verified live:
    `GET https://obolus-api.fly.dev/health` → `{"ok":true}`, and
    `GET https://obolus-api.fly.dev/platform/network` → returns the new contract address.
  - `vercel --prod` from `frontend/` to ship the updated write-call flow
    (deposit → confirm-payment → GenLayer write). Verified live at
    `https://obolus-app.vercel.app` (200 OK), proxying through to the new
    contract address via `/api/platform/network`.
- **`ObolusEscrow.sol` redeployed to Base Sepolia**, superseding
  `0x1f26b190819BFf558e9FeBdC319ea9D9F1Ad6AD6` (the pre-fix escrow, whose `fundVault`
  didn't return a `paymentId` and whose `settle()` didn't take a `settlementId`):
  ```bash
  DEPLOYER_PRIVATE_KEY=$GENLAYER_PRIVATE_KEY BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
  RELAYER_ADDRESS=0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb \
  node contracts/base/deploy.js
  ```
  New address: **`0x642C8f4De6302D06fC0620efE571dFd69DF94CEA`** (relayer:
  `0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb`, same key as the GenLayer relayer —
  the throwaway deploy/service key already in `.env`). `backend/.env`'s
  `OBOLUS_ESCROW_ADDRESS` updated, then shipped with
  `flyctl secrets set OBOLUS_ESCROW_ADDRESS=0x642C8f4De6302D06fC0620efE571dFd69DF94CEA --app obolus-api`
  (a secrets-only change restarts the already-deployed image, no rebuild needed since
  the new ABI shipped in the code deploy above). Verified live:
  `GET https://obolus-api.fly.dev/platform/network` → `escrowAddress:
  "0x642C8f4De6302D06fC0620efE571dFd69DF94CEA"`.
- Any vaults/claims/contests created against the superseded GenLayer contract
  (`0x396865...`) or the superseded escrow (`0x1f26b190...`) do not carry over — this
  is a clean-slate redeploy on both chains, same as prior migrations recorded in
  `REVIEW.md`.

This milestone is now fully live end to end: GenLayer contract, Base Sepolia escrow,
backend, and frontend are all on the payment-binding versions.
