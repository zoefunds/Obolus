# Financial and adjudication security remediation

This document describes the corrected cross-chain trust boundary and the exact
deployment now configured by the application.

The remediation series begins at
[`fa5a9e9`](https://github.com/zoefunds/Obolus/commit/fa5a9e9c55dce069969ec46e8cb95dd9b71fcebb).
The continuously current branch comparison is
[`fa5a9e9...main`](https://github.com/zoefunds/Obolus/compare/fa5a9e9c55dce069969ec46e8cb95dd9b71fcebb...main);
an immutable comparison to the final documentation commit is provided in the release
handoff.

## Current deployment

| Component | Address / service | Immutable reference |
|---|---|---|
| GenLayer adjudication contract | [`0xd7D13F11E636A57333075e1b4e9BCD276b57a44C`](https://explorer-studio.genlayer.com/address/0xd7D13F11E636A57333075e1b4e9BCD276b57a44C) | [StudioNet deploy `0xfaf5…237d`](https://explorer-studio.genlayer.com/tx/0xfaf568cc050b49ec1827be5ad31c99e940bfcb0a0080cc1267c251aeba9c237d) |
| Base Sepolia escrow | [`0xBb2a81ffD5a236715f24272f32947501F33D3BF0`](https://sepolia.basescan.org/address/0xBb2a81ffD5a236715f24272f32947501F33D3BF0) | [Base tx `0x99b6…d9a3`](https://sepolia.basescan.org/tx/0x99b67153eb4869cc519ca68301a5b3904d8e248ca141f8fbc60f92f5000bd9a3), block `48124812` |
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
  item even when the overall batch differs. A nested pre-allocation uniqueness
  check also rejects the same identifier twice inside one signed batch.
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
reads the finalized vault status and beneficiary/grantor, verifies the proposed
total against Base's deposited-minus-allocated pool, derives Base replay ids itself,
asks the deployed escrow for the authoritative
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

The public refund route adds two gates before that irreversible tombstone. First,
`GET /vaults/:id/refund-intent` returns a domain-separated EIP-191 message binding
chain id, escrow, vault, deposit transaction, and payment id; the POST route recovers
the signer and requires the actual Base payer. Second, the isolated authorizer performs
a read-only preflight against the Base deposit and finalized GenLayer payment history.
Only then does the relay write the tombstone and request the executable signature. A
preflight rejection writes nothing. If the final signing request is interrupted after
the tombstone, retrying skips the already-finalized write and obtains fresh calldata.

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
Decision-critical source URLs are additionally intersected with the exact set fetched
successfully during that validator execution; merely submitting an unavailable URL can
never support identity or provenance. GenVM permits one claimant and one challenger
image. The contract rejects a second challenger image before consuming its bond instead
of silently dropping it; later challengers retain all archived text/page evidence slots.

## Finality and deployment gates

Backend and browser flows wait for `FINALIZED` on every GenLayer write. They
accept both the SDK's string form and numeric status `7`, and also require the
leader GenVM receipt to report `SUCCESS` with a returned result; finalized
consensus over an execution error is not treated as application success. Relay
authorization independently reads latest-final expected state again.

The verified local release gate is:

- 86 GenLayer Direct Mode tests passing;
- 28 backend tests passing, including Solidity compilation, refund ownership and
  ordering, retry recovery, finality parsing,
  authorizer exact-match checks, overlap/replay handling, bounded Base event
  reconciliation, and deposit decoding;
- eight executable Foundry tests covering absent owner withdrawal, independent
  authorization, recipient substitution, replay, allocated-deposit refund rejection,
  same-batch duplicate identifiers, successful one-shot failed-deposit refund, and
  beneficiary USDC withdrawal;
- a successful Vite production build;
- `git diff --check` clean;
- both Fly services healthy and the Vercel production deployment ready.

The adversarial cases requested by review map to executable coverage as follows:

| Review scenario | Executable evidence |
|---|---|
| Owner cannot remove active principal or recipient credit | Foundry `testOwnerHasNoWithdrawalSurface`; backend source-surface assertion |
| Relayer cannot invent or redirect an allocation | Foundry `testRelayerCannotSettleWithoutIndependentAuthorization` and `testRecipientSubstitutionInvalidatesAuthorization`; backend authorizer exact-snapshot tests |
| Duplicate and partially overlapping settlement batches | Foundry same-batch and overlap tests; backend retry and partial-overlap reconciliation tests |
| False delivery acknowledgment cannot hide an entitlement | Direct Mode false-acknowledgment and complete-index tests; backend reads Base `settledIds` independently |
| More than 64 settlements remain discoverable | Direct Mode complete-index test beyond 64 rows |
| All 20 accepted contests are evaluated | Direct Mode 20-contest acceptance/consideration/refund test |
| Conflicting death identity and proof-of-life evidence | Direct Mode conflict test yields conservative `INCONCLUSIVE` |
| Failed or provisional GenLayer execution cannot settle | backend finalized-execution and pre-Base authorization tests |
| Another wallet cannot invalidate a deposit | backend signed-intent route test plus deployed-route rejection before mutation |
| Preflight failure and post-tombstone interruption | backend ordering and retry tests prove no premature mutation and one-write recovery |
| Beneficiary can receive actual USDC | executable Foundry withdrawal test and the funded public-chain flow below |

Read-only production checks on 2026-10-14 confirmed that the API and frontend both
advertise the deployment addresses above and that the escrow has the expected owner,
relayer, authorizer, and USDC addresses. Before the funded E2E, the GenLayer platform
counters and Base escrow balance were zero. The optimized Solidity runtime matched the
deployed Base bytecode after substituting the compiler's immutable-USDC locations;
the current masked runtime hash is
`0x4e7d49ba72f3612f2d99cd1027a2aceb15c01c327b39474a6ea1c2346bd323aa`.
StudioNet's base64-decoded `gen_getContractCode` response exactly matched
`contracts/obolus.py`; both source SHA-256 values were
`0x712f688f33d4b134291c6f0ed1a8be1032e8f3b7ab79873e89e71e815894dcf9`.

`genvm-lint`'s source lint phase passed all three checks. Its separate SDK validation
phase could not start because the local tool installation lacks its packaged
`runners/py-genlayer` archive. This is recorded as a local validator-tool installation
failure, not represented as a contract validation pass.

GitHub Actions contains the same contract, backend, Solidity, and frontend jobs.
The [run for verified remediation commit `2f4c481`](https://github.com/zoefunds/Obolus/actions/runs/38659018242)
could not start any job because GitHub reports an account-level billing lock. That
external account state cannot be repaired in repository source; the workflow itself
is present and the equivalent commands pass locally.

## Current corrected-deployment funded E2E

Vault 1 / claim 1 uses six distinct roles: grantor
`0xf65b31DF915942ecAc75350cCf978379Fa516c24`, claimant
`0x9235a032EeCBB5b86B8c071625555751B3aa0a50`, contester
`0x39d0F949B569015A5ecA01922403c05bC6E63078`, beneficiary
`0x5837AAf714B265caa09AF03019436119B931FCb1`, the deployed relayer, and the
separate authorizer listed above. The escrow received 100,000 principal units plus
10,000-unit claimant and contester bonds. The finalized contest deadline is Unix
`1792022142` (2026-10-15 00:55:42 WAT); resolution occurred only after that
chain-enforced time.

| Completed stage | Final public reference | Verified result |
|---|---|---|
| Create vault 1 | [StudioNet `0xdec6…b4d8`](https://explorer-studio.genlayer.com/tx/0xdec6fad8c45b9964a7a860c2be957372c07f442f88bf49e3cc738453b284b4d8) | distinct grantor and beneficiary; current corrected contract |
| Deposit principal | [Base `0x26f1…54bb`](https://sepolia.basescan.org/tx/0x26f1c837d9e1e1a5ebefa8e6f96b5ea8164d635277362f2848acb8089b1554bb) | grantor 100,000→0 units; escrow received 100,000 units |
| Attest principal | [StudioNet `0x80b0…af88`](https://explorer-studio.genlayer.com/tx/0x80b0da48be615e21073505d82e1ae03bc0ad1760e6cf54f4996247d7495caf88) | payment bound to the public Base deposit |
| Fund vault | [StudioNet `0xef4d…cc6b`](https://explorer-studio.genlayer.com/tx/0xef4dd66274d6c7ea58cf408f85bd8df2e80ae103910e4f8be0fe01470408cc6b) | finalized vault principal 100,000 units |
| Deposit claimant bond | [Base `0xb9c7…d57f`](https://sepolia.basescan.org/tx/0xb9c7f8c06f7e7543085cf966217ee03b61a74078d2da274fd88e8b437294d57f) | claimant 10,000→0 units; escrow total 110,000 units |
| Attest claimant bond | [StudioNet `0x6065…dc0a`](https://explorer-studio.genlayer.com/tx/0x6065bb9c88b05eb75331ab07f92be2c3d9f5acd4e4976fa9a8fdba67e049dc0a) | claimant payment finalized |
| Submit bonded claim | [StudioNet `0x14cf…e5b2`](https://explorer-studio.genlayer.com/tx/0x14cf0f81047372291787c75b36329de249c1a8e238ed8468df8d03f637b9e5b2) | archived Carter Center evidence; contest window opened |
| Deposit contester bond | [Base `0xd549…2cdd`](https://sepolia.basescan.org/tx/0xd5499b0ae310d4ed391bfdb12a3e9cd3e15fd7778da55f97364904d728c72cdd) | contester 10,000→0 units; escrow total 120,000 units |
| Attest contester bond | [StudioNet `0x8610…578f`](https://explorer-studio.genlayer.com/tx/0x8610fe37f203868217219d13b3b11b95d86f20bc0c0ee05c5e4a52dbbea5578f) | contester payment finalized |
| Submit contest | [StudioNet `0x54df…4f26`](https://explorer-studio.genlayer.com/tx/0x54df0d4ed227998cbaf0c13a2e31aebf48afd3f126af59da97fd89df56054f26) | claim finalized as `CONTESTED`; one accepted bonded contest |
| Resolve contested claim | [StudioNet `0xb5bf…f1e3`](https://explorer-studio.genlayer.com/tx/0xb5bf9ce66626fb987bc7bfc25f3d12cd52d51dcd9d419243e47e437dd3acf1e3) | finalized GenVM success; `DECEASED`, `HIGH`, `CONFIRMED`; contest evidence explicitly considered |
| Authorize and allocate | [Base `0x58e7…cfe6`](https://sepolia.basescan.org/tx/0x58e76ca977bd39d6d8749d7496a0d225b6a819728bf9210f29ac0e3b04a3cfe6) | independent authorizer approved three exact entitlements; 120,000 deposited / 120,000 allocated |
| Replay reconciliation | no second Base transaction | repeated relay returned `txHash: null`; all three individual replay ids remained applied |
| Beneficiary withdrawal | [Base `0x6503…5143`](https://sepolia.basescan.org/tx/0x65036a00d79e68acb3e4ff589b7d3f19d747dc302e20486f893e1bf5d1a35143) | beneficiary 0→110,000 units (principal plus forfeited contester bond) |
| Claimant withdrawal | [Base `0x7a66…1783`](https://sepolia.basescan.org/tx/0x7a66e2c2229f89ac872fa458c004559951aa33ecb6d830c137ad24facce61783) | claimant 0→10,000 units (returned claimant bond) |

Final reads prove the escrow token balance and all recipient credits are zero, the
contester remains at zero, the GenLayer vault balance is zero, all three settlement
rows carry the exact Base allocation hash, and the Base pool is fully allocated.
The first post-settlement retry exposed the public RPC's 200-block `eth_getLogs`
limit after allocation had already succeeded. No value was duplicated or stranded:
the relay's individual replay keys preserved the allocation, bounded event scanning
recovered its transaction, acknowledgment was retried, and both withdrawals completed.
This is a live demonstration of recoverability after an interrupted cross-chain step.
All eight StudioNet references above were re-read with the official client as
`FINALIZED` with successful GenVM execution. All five Base setup approval/deposit
receipts and the allocation plus two withdrawals have EVM status `1` and target
either the documented USDC or corrected escrow address.

## Historical funded public-chain end-to-end evidence

On 2026-10-14, vault 3 and claim 1 completed the full lifecycle using the preceding
deployment pair. These references remain valid historical evidence but do not prove the
new addresses above. The subject was James Earl Carter Jr. (Jimmy Carter, born 1924),
and the adjudication fetched the archived official Carter Center death announcement.
The one-hour contest window closed before resolution; no contest was submitted.

| Stage | Final public reference | Verified result |
|---|---|---|
| Create vault 3 | [StudioNet `0x6aa5…8cbf`](https://explorer-studio.genlayer.com/tx/0x6aa5bd8776702bf08e16e34d512a3a62a12abde1c83b08ab9738dd5f8ff38cbf) | distinct grantor and beneficiary; 3,600-second contest window |
| Deposit 0.10 USDC | [Base `0x10f5…05ac`](https://sepolia.basescan.org/tx/0x10f5fb786c6858710e4affe5ff82047dd911b81f0a3fa24a44b5befd9b3405ac) | payment `0xb0cb0029c3b4a3dacd384c5cec6d1fd213e88ff7f47cc11f1b9bbf418a543034`; payer 5.85→5.75 USDC; escrow 0→0.10 USDC |
| Attest payment | [StudioNet `0x5d2e…30f2`](https://explorer-studio.genlayer.com/tx/0x5d2e7d88c7962900702aac16909bfcf1ddb7f73d85ff26df1fe79aedc26030f2) | relayer bound the Base payment id, vault, payer, and 100,000-unit amount |
| Fund vault | [StudioNet `0x7577…c455`](https://explorer-studio.genlayer.com/tx/0x75773d66b55153f1c9d44c9c4a40f951ff1cae4acdc06c4d36cb576b6ebcc455) | finalized ledger balance became 100,000 units; payment consumed once |
| Submit claim | [StudioNet `0xc567…a28a`](https://explorer-studio.genlayer.com/tx/0xc567b892ee0b56b0b647d745e38ba2ae66e9707e1db5aee5e9585388e2ada28a) | claim 1 opened with the archived primary-source evidence |
| Resolve claim | [StudioNet `0xf2fd…d338`](https://explorer-studio.genlayer.com/tx/0xf2fd52fbd6ba8fe6b01d07f029156cb7cfc9107b7e4f968f319bb19eb21bd338) | finalized GenVM success; `DECEASED`, `HIGH`, claim `CONFIRMED`; vault `PAYOUT_READY` |
| Authorize and allocate | [Base `0x9860…027d`](https://sepolia.basescan.org/tx/0x986008b421a9f331160814533c3de204f666d88660916dea11ea6e638032027d) | independent authorizer signed the exact finalized entitlement; recipient credit became 100,000 units; GenLayer acknowledgment records this Base hash |
| Beneficiary withdrawal | [Base `0x358a…3549`](https://sepolia.basescan.org/tx/0x358a99edfacd21c6a89b65782b4206b65ee7c93fd96e9c3e313bd21691843549) | beneficiary 0→0.10 USDC; escrow 0.10→0 USDC; remaining claimable balance 0 |

Final cross-chain reads confirmed vault 3 has zero GenLayer ledger balance and one
relayed 100,000-unit settlement, Base reports 100,000 deposited / 100,000 allocated,
the beneficiary owns 100,000 USDC base units, and the escrow holds zero. These are
transactions from the preceding deployment and are retained as historical evidence,
not synthetic or unrelated links.

The recovery path was also exercised during setup after an incorrect vault identifier
prevented GenLayer funding: Base transaction
[`0x1520…e805`](https://sepolia.basescan.org/tx/0x1520b8408e8b91f18ea2025421a6fe652e2c5260e7541ddd5f3d1a05e53ae805)
returned the unconsumed 100,000-unit deposit to its original payer only after the
finalized GenLayer refund tombstone and independent authorization. That run exposed
and led to correction of the authorizer's Fly private-network listener: it now binds
IPv6 (`::`), matching `.internal` service discovery.
