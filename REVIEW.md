# Security review response — October 14, 2026

This is the current response to the custody, authorization, finality, refund,
evidence-fairness, indexing, replay, testing, and deployment findings. Detailed
invariants and immutable deployment references are in
[`docs/SECURITY_REMEDIATION.md`](docs/SECURITY_REMEDIATION.md).
The review remediation starts at
[`fa5a9e9`](https://github.com/zoefunds/Obolus/commit/fa5a9e9c55dce069969ec46e8cb95dd9b71fcebb),
with a live branch comparison at
[`fa5a9e9...main`](https://github.com/zoefunds/Obolus/compare/fa5a9e9c55dce069969ec46e8cb95dd9b71fcebb...main).

## Completed corrections

- Removed the Base escrow owner-withdrawal path. Active principal, bonds, and
  claimable balances have no administrative withdrawal route.
- Split relay and settlement authorization into different keys and services.
  Base settlement requires the relayer transaction plus an independent,
  short-lived signature over the exact finalized ruling and allocation.
- Added one replay key per GenLayer entitlement, preventing overlap such as
  `[1,2]` followed by `[2,3]`, regardless of batch composition.
- Restricted GenLayer delivery acknowledgment to the relayer and permanently
  bound each row to the successful Base transaction hash. Base events and
  `settledIds` remain the reconciliation source of truth.
- Removed the 64-row discovery failure. Complete and pending settlements are
  available through bounded pagination.
- Gave all 20 accepted contests at least one evidence slot. Validator consensus
  now compares determination, confidence, identity match, provenance strength,
  and decisive source URLs. A death release requires HIGH confidence,
  CONFIRMED identity, and STRONG provenance.
- Made every backend and browser GenLayer write wait for authoritative finality
  and require successful GenVM execution. Numeric StudioNet status `7` is
  normalized to `FINALIZED`; finalized execution errors are rejected.
- Added failed-payment refunds restricted to the original Base payer and an
  independent authorization. A finalized GenLayer tombstone is written first,
  including when no Payment row exists, preventing a pending or later payment
  attestation from reviving refunded value.

## Verification

- `python3 -m pytest -q tests/direct`: 84 passed.
- `npm test --prefix backend`: 19 passed, including Solidity compilation.
- `forge test -vv`: 7 passed, including refund and beneficiary token transfers.
- `npm run build --prefix frontend`: production build passed.
- API, independent authorizer, and frontend production deployments are live.
- A funded public-chain E2E completed on vault 3 / claim 1: the payer deposited
  0.10 test USDC, StudioNet finalized a consensus-backed `CONFIRMED` ruling,
  the independent authorizer approved the exact entitlement, and the beneficiary
  withdrew the full 0.10 USDC. The public transaction links and balance deltas
  are recorded in [`docs/SECURITY_REMEDIATION.md`](docs/SECURITY_REMEDIATION.md).
- The failed-payment recovery path was exercised against the deployed contracts:
  the finalized GenLayer tombstone and independent authorization returned the
  unconsumed deposit only to its original payer.
- Final deployment addresses and transaction links are recorded in
  [`docs/SECURITY_REMEDIATION.md`](docs/SECURITY_REMEDIATION.md).

GitHub-hosted jobs remain subject to the repository owner's account-level billing
lock; equivalent workflow commands pass locally. This is the only outstanding
external infrastructure limitation and is not a source-code or deployment failure.
