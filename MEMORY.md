# Operations reference

This file contains only current operational facts. Historical milestone
addresses and obsolete interfaces were removed to avoid accidental reuse.

## Production surfaces

- Frontend: <https://obolus-app.vercel.app>
- Relay API: <https://obolus-api-gideon.fly.dev>
- GenLayer StudioNet: `0xDc11B65794fe7070e1D1357D00d4bCFBa70F7C86`
- Base Sepolia escrow: `0x7E5A3F917D5ab0Ce8CbAf11927BDe0830E58924F`
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
- Settlement replay protection is per entitlement, not per batch.
- A failed-deposit refund requires a finalized GenLayer tombstone before the
  authorizer signs Base calldata.
- Beneficiaries withdraw with the Base pull-payment `claim` path.
- Signing keys and bearer tokens belong in platform secret stores, never source.

## Deployment procedure

1. Run the local contract, backend/Solidity, and frontend build gates.
2. Deploy `contracts/obolus.py`; `scripts/deploy.mjs` updates local `.env`.
3. Deploy `contracts/base/ObolusEscrow.sol` with distinct relay and authorizer
   addresses; the deploy script records address and block in local `.env`.
4. Update both Fly apps to the exact same GenLayer and Base addresses.
5. Deploy the API and authorizer images, then verify health checks.
6. Deploy the frontend and verify `/platform/network` through the production
   rewrite.
7. Update README and the security remediation record with real explorer links.

The final Base deployment is intentionally empty. No funded end-to-end test was
performed after the user requested that testing stop.
