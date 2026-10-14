# Financial and adjudication security remediation

This document describes the corrected cross-chain trust boundary and the exact
deployment now configured by the application.

## Current deployment

| Component | Address / service | Immutable reference |
|---|---|---|
| GenLayer adjudication contract | [`0xDc11B65794fe7070e1D1357D00d4bCFBa70F7C86`](https://explorer-studio.genlayer.com/address/0xDc11B65794fe7070e1D1357D00d4bCFBa70F7C86) | [StudioNet deploy `0xe0b6…5912`](https://explorer-studio.genlayer.com/tx/0xe0b6c1733849001fcfe712661b04612e192556b79bda911b07dcbf0e49b05912) |
| Base Sepolia escrow | [`0x7E5A3F917D5ab0Ce8CbAf11927BDe0830E58924F`](https://sepolia.basescan.org/address/0x7E5A3F917D5ab0Ce8CbAf11927BDe0830E58924F) | [Base tx `0xd6e5…00b9`](https://sepolia.basescan.org/tx/0xd6e530bca65a82b00cd6fd1fd80306ce2ceb0808013ba56594861bfb8b7800b9), block `48114676` |
| Base Sepolia USDC | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) | immutable escrow constructor argument |
| Relay API | [`obolus-api-gideon.fly.dev`](https://obolus-api-gideon.fly.dev) | two healthy Fly machines |
| Independent authorizer | `obolus-authorizer-gideon` | isolated Fly app; private `.internal:4100` signing endpoint |
| Frontend | [`obolus-app.vercel.app`](https://obolus-app.vercel.app) | Vercel production alias |

The deployer/relayer address is
`0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb`; the independent settlement
authorizer is `0x53f8FEa098d9Bc98BE890089BCB0CbE6BD45e3B8`. The Solidity constructor
rejects equal relayer and authorizer addresses. Signing keys and bearer tokens
are held only in service secret stores and are not recorded in this repository.

## Base custody invariants

- There is no owner withdrawal function. The owner cannot remove unallocated
  vault principal, claimant bonds, contester bonds, or recipient credits.
- A failed deposit can only be returned to its original payer through
  `refundFailedPayment(paymentId, deadline, signature)`. The independent
  settlement authorizer signs the exact payment, vault, payer, amount, escrow,
  chain, and expiry. The refund is one-shot and fails after any allocation has
  consumed the pool capacity.
- `settle` requires both the configured relayer transaction and a signature from
  a different `settlementAuthorizer` key. The signature commits to chain id,
  escrow address, vault, authoritative GenLayer ruling hash, every individual
  settlement id, every recipient, every amount, and an expiry.
- Each GenLayer entitlement has its own Base replay key
  `keccak256(vaultId, settlementId)`. Overlapping batches cannot replay a shared
  item even when the overall batch differs.
- Beneficiaries remain pull-based: settlement only creates claimable balances;
  the recipient calls `claim` or `claimMany`.

## Independent settlement authorizer

Production must operate the authorizer separately from the relay service and
must not expose its signing key through the backend environment. The relay calls
`SETTLEMENT_AUTHORIZER_URL` with the proposed vault, GenLayer contract,
settlement ids, Base replay ids, recipients, amounts, and required status
`FINALIZED`. The authorizer must independently:

1. read the authoritative `latest-final` GenLayer state rather than provisional
   validator state;
2. reproduce the exact finalized settlement rows that Base reports as unapplied;
3. reject a recipient, amount, vault, or settlement id mismatch;
4. verify that the ruling is terminal and eligible for the requested payments;
5. return a short-lived signature over the digest exposed by
   `settlementAuthorizationDigest` and the finalized ruling hash.

Compromise of the relay key alone therefore cannot redirect or invent an
allocation. Compromise of the authorizer is still security-critical; use a KMS
or hardware-backed key, an allow-listed relay client, audited request logs, and
independent monitoring. The Solidity constructor and rotation methods enforce
  that authorizer and relayer addresses differ. The escrow owner cannot replace
  the authorizer; only the current authorizer may rotate itself to a new key.

The repository includes a separately runnable reference implementation at
`backend/src/authorizer.js` (`npm run start:authorizer --workspace backend`). It
uses GenLayer's `latest-final` state variant, retrieves the complete settlement index
through pagination, removes only rows whose individual IDs are already applied on Base,
requires an exact ordered match of the remaining ids/recipients/amounts,
derives Base replay ids itself, asks the deployed escrow for the authoritative
digest, and signs it with `SETTLEMENT_AUTHORIZER_PRIVATE_KEY`. Deploy this entry
point as its own service with an isolated environment and KMS-backed secret;
never add that key to the relay API's environment.
The deployed relay uses Fly's private service address
`http://obolus-authorizer-gideon.internal:4100/authorize`; signing therefore does
not depend on public DNS. The authorizer's HTTP listener is bearer-token protected;
`/health` is intentionally unauthenticated for platform monitoring.

## Delivery acknowledgment and reconciliation

`mark_settlements_relayed` is restricted to the configured GenLayer relayer,
requires a transaction-shaped hash, and permanently binds each row to that hash.
It is advisory bookkeeping only. Every automatic relay reads the complete finalized
settlement index—including rows already marked relayed—and queries each individual
Base `settledIds` key. A fabricated acknowledgment therefore cannot hide an unpaid
entitlement. Existing `SettlementApplied` events recover the real delivery hash;
mixed batches acknowledge verified delivered rows and settle only the missing rows.
Base is the delivery source of truth, and per-entitlement replay protection remains
the allocation backstop.

For failed funding, the relay always finalizes `void_payment_for_refund` before
requesting a Base signature. The tombstone is stored independently of a Payment
row, so it is safe even when `record_payment` is still provisional or was never
submitted. A later `record_payment` for a tombstoned id is rejected, and an
existing unconsumed Payment is permanently marked refunded. The authorizer signs
only after `is_payment_voided(paymentId)` is true in latest-final state. Consumed
payments, network errors, and read failures are rejected.

## Evidence and consensus

All 20 accepted contest submissions receive at least one text-evidence slot in
the resolution round. Resolution capacity is 20 contest URLs plus five claim
URLs; the 21st contest is rejected before accepting a bond. The adjudicator must
return exact decision-critical fields for determination, confidence,
identity-match, provenance strength, and decisive source URLs. Comparative
consensus requires agreement across all of them. A HIGH death answer cannot
release funds unless identity is `CONFIRMED` and provenance is `STRONG`.
Archived URLs establish immutability, not authority; the prompt explicitly
requires evaluation of the original publisher embedded in the archive URL.

## Finality and deployment gates

Backend and browser flows wait for `FINALIZED` on every GenLayer write. They
accept both the SDK's string form and numeric status `7`, and also require the
leader GenVM receipt to report `SUCCESS` with a returned result; finalized
consensus over an execution error is not treated as application success. Relay
authorization independently reads latest-final expected state again.

The verified local release gate is:

- 83 GenLayer Direct Mode tests passing;
- 19 backend tests passing, including Solidity compilation, finality parsing,
  authorizer exact-match checks, overlap/replay handling, and deposit decoding;
- six executable Foundry tests covering absent owner withdrawal, independent
  authorization, recipient substitution, replay, allocated-deposit refund rejection,
  and successful beneficiary USDC withdrawal;
- a successful Vite production build;
- `git diff --check` clean;
- both Fly services healthy and the Vercel production deployment ready.

Read-only production checks on 2026-10-14 confirmed that the API and frontend both
advertise the deployment addresses above; the GenLayer platform counters were all
zero; the Base escrow had zero USDC, `paymentNonce == 0`, and the expected owner,
relayer, authorizer, and USDC addresses. The optimized Solidity runtime matched the
deployed Base bytecode after substituting the compiler's immutable-USDC locations;
both runtime hashes were
`0x0c7cf5395bb11aa32353ffdeb0c83bfecddeb74e5ff71384e0e731ea257dad02`.
StudioNet's base64-decoded `gen_getContractCode` response exactly matched
`contracts/obolus.py`; both source SHA-256 values were
`ef9b4089271c3667c93994182ff1822cc9d038389ce7a4db6367e6c60a5e57ab`.

`genvm-lint`'s source lint phase passed all three checks. Its separate SDK validation
phase could not start because the local tool installation lacks its packaged
`runners/py-genlayer` archive. This is recorded as a local validator-tool installation
failure, not represented as a contract validation pass.

GitHub Actions contains the same contract, backend, Solidity, and frontend jobs.
The most recent hosted run could not start because GitHub reports an account-level
billing lock. That external account state cannot be repaired in repository source;
the workflow itself is present and the equivalent commands pass locally.

## Transaction evidence scope

The deployment transactions above are verified and link directly to both
explorers. At the user's direction, no funded end-to-end transaction was run on
the final deployment. Accordingly, this document does not claim deposit,
attestation, adjudication, allocation, acknowledgment, or withdrawal hashes for
the final pair. The Base escrow was freshly deployed and left empty; no synthetic
or unrelated transaction references are presented as end-to-end evidence.
