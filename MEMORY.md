# Operations reference

This file contains only current operational facts. Historical milestone
addresses and obsolete interfaces were removed to avoid accidental reuse.

## Production surfaces

- Frontend: <https://obolus-app.vercel.app>
- Relay API: <https://obolus-api-gideon.fly.dev>
- GenLayer StudioNet: `0xd7D13F11E636A57333075e1b4e9BCD276b57a44C`
- Base Sepolia escrow: `0xBb2a81ffD5a236715f24272f32947501F33D3BF0`
- Base Sepolia USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Relay/deployer: `0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb`
- Independent authorizer: `0x53f8FEa098d9Bc98BE890089BCB0CbE6BD45e3B8`

See [`docs/SECURITY_REMEDIATION.md`](docs/SECURITY_REMEDIATION.md) for deploy
transactions, trust boundaries, and release verification.

## Non-negotiable invariants

- GenLayer is the adjudication ledger; Base Sepolia is the only USDC custodian.
- A Base deposit is credited only from its escrow-emitted `Deposited` event.
- Every GenLayer write used by the application waits for `FINALIZED` and a
  successful GenVM return.
- The relay never signs settlement authorization. The isolated authorizer reads
  latest-final state independently and signs exact allocations only.
- The Fly authorizer listens on IPv6 (`::`) because private `.internal` service
  discovery resolves to the machine's IPv6 address.
- Settlement replay protection is per entitlement, not per batch.
- A failed-deposit refund requires a finalized GenLayer tombstone before the
  authorizer signs Base calldata.
- Before that tombstone, the API verifies an EIP-191 intent signed by the
  original Base payer and obtains an independent read-only eligibility preflight.
  A failed preflight cannot invalidate a payment; a post-tombstone interruption
  is retryable without a second mutation.
- Beneficiaries withdraw with the Base pull-payment `claim` path.
- Signing keys and bearer tokens belong in platform secret stores, never source.

## Deployment procedure

1. Run the local contract, backend/Solidity, and frontend build gates.
2. Deploy `contracts/obolus.py`; `scripts/deploy.mjs` updates local `.env`.
3. Deploy `contracts/base/ObolusEscrow.sol` with distinct relay and authorizer
   addresses; the deploy script records address and block in local `.env`.
4. Update both Fly apps to the exact same GenLayer and Base addresses.
5. Deploy the API and authorizer images, then verify health checks.
6. Deploy the frontend and verify `/api/platform/network` through the production
   rewrite.
7. Update README and the security remediation record with real explorer links.

## Historical funded E2E on the superseded deployment

Vault 3 / claim 1 completed the entire public-chain lifecycle on 2026-10-14.
The payer deposited 100,000 USDC base units, the finalized GenLayer verdict was
`DECEASED` / `HIGH` / `CONFIRMED`, Base allocated the exact entitlement, and the
distinct beneficiary withdrew all 100,000 units. The escrow has zero token balance
and zero remaining beneficiary credit; its vault pool records 100,000 deposited and
100,000 allocated. Exact immutable links are in
[`docs/SECURITY_REMEDIATION.md`](docs/SECURITY_REMEDIATION.md).

The current corrected deployment completed its six-role funded E2E on 2026-10-15.
Vault 1 / claim 1 deposited 120,000 total units, finalized `DECEASED` / `HIGH` /
`CONFIRMED`, allocated all three entitlements once, paid 110,000 units to the
beneficiary and returned the 10,000-unit claimant bond, and ended with zero escrow
balance and zero outstanding credits. Exact immutable links are in
[`docs/SECURITY_REMEDIATION.md`](docs/SECURITY_REMEDIATION.md).

The remediation history begins at
[`fa5a9e9`](https://github.com/zoefunds/Obolus/commit/fa5a9e9c55dce069969ec46e8cb95dd9b71fcebb).
The branch-relative comparison is
[`fa5a9e9...main`](https://github.com/zoefunds/Obolus/compare/fa5a9e9c55dce069969ec46e8cb95dd9b71fcebb...main);
release responses should use the immutable end-commit comparison.
