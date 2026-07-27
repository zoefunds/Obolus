# Decision Record — Verifiable Decease Escrow (VDE)

## Candidates generated (12+, spanning capability areas)

1. **Verifiable Decease Escrow** — releases inherited GEN to a beneficiary only when
   validator consensus judges real-world evidence (obituaries, registries, news, an
   optional certificate/obituary screenshot) corroborates a named person's death, with a
   symmetric bonded contest window. *[web fetch + web render/screenshot + native
   value/escrow]*
2. Semantic page-diff materiality oracle for watched web pages. *[web]* — **on the
   collision list this cycle, discarded outright.**
3. Multi-source corroboration / independence-clustering news oracle. *[web]* — **on the
   collision list this cycle, discarded outright.**
4. Bonded "is this satire" classifier for content moderation payouts. *[web]* — thin,
   judgement doesn't gate anything consequential beyond a label. Discard (Gate E).
5. Cross-contract price-feed plausibility gate for other GenLayer DeFi contracts
   (judges whether a submitted off-chain price is *plausible* before an EVM-interop
   contract acts on it). *[EVM interop + web]* — real but very close to a generic oracle,
   thin trust story once you have real price oracles. Discard (Gate F, not enough of a
   distinct thesis from existing oracle work).
6. Embedding-similarity plagiarism bond for generative-art marketplaces: mints are
   staked, and a `VecDB`/`knn` + LLM judgement over stored embeddings decides whether a
   new mint is a derivative of an existing one, slashing the minter's bond into the
   original creator's escrow. *[embeddings + escrow]* — a real, serious candidate. Passes
   A–E. Discarded only because VDE has a sharper "why does this need a blockchain"
   story (irreversible, high-stakes, adversarial-by-nature) — see "strongest discarded"
   below.
7. Contract-factory for milestone bounty vaults, each judged by comparative evidence of
   deliverable completion (screenshots of shipped UI, deployed contract addresses).
   *[factories + escrow + images]* — reasonable, but structurally a rephrasing of
   "milestone vault," a pattern the brief already names as a known primitive family;
   not enough of a distinct thesis to be the pick.
8. Visual receipt/chargeback arbitration escrow: buyer and seller both stake, contract
   renders/screenshots a claimed delivery/refund page and judges who is owed the funds.
   *[images + escrow]* — solid but is essentially VDE's mechanics wearing e-commerce
   clothes; picking both would be one idea in two hats, so only one survives.
9. EVM-interop collateral release: an Intelligent Contract gates unlocking collateral
   on an external EVM lending contract based on judged proof of a real-world collateral
   event (e.g., a shipped/insured physical asset's condition report). *[EVM interop +
   images]* — real, but the "gate an external protocol's state" framing needs an
   existing EVM lending partner to be concrete; too speculative to build standalone this
   cycle. Discard (Gate D — hard to write a ≤10-line honest integration without assuming
   unbuilt partner contracts).
10. Contract-deployed sub-vaults for DAO succession: a factory that deploys one
    "who legitimately controls this DAO's ops multisig" resolver per DAO, judged from
    public governance-forum and on-chain signal evidence. *[factories + web]* — a real
    factory pattern, but the judged question ("who is the legitimate signer") is closer
    to a governance dispute than a semantic evidence question a validator can cleanly
    answer from public web sources alone. Weaker Gate C than VDE.
11. Staked "this whistleblower document is authentic" corroboration escrow: a submitter
    stakes GEN, contract fetches/screenshots corroborating public reporting, and
    validators judge authenticity before an escrowed reward pays out. *[web + images +
    escrow]* — genuinely strong, same capability family as VDE (web + image + escrow),
    discarded as a near-duplicate of VDE's mechanics rather than a separate idea; not
    counted as a distinct capability.
12. Deposit-backed reputation bond for freelance dev work, released on comparative
    LLM judgement of whether delivered code meets a spec. *[escrow]* — this is exactly
    the ShipBond-shaped pattern the reference materials already show as an existing,
    working project. Discard (Gate F — not original, duplicates known ecosystem work).
13. Parametric weather/climate-event micro-insurance pool, paying out on judged
    corroboration of a claimed local weather event from multiple public weather-station
    and news sources. *[web + escrow, native value]* — a real, serious candidate,
    genuinely spans "insurance pools with parametric payout." Passes A–E. Discarded
    because its judgement question ("did this weather event happen here") is closer to
    a numeric feed a deterministic parser could increasingly answer as weather APIs
    mature, weakening Gate C relative to VDE's irreducibly identity/context-heavy
    judgement.

## Self-audit (per the addendum)

1. **Distinct capabilities actually represented:** web fetch/get (#1,2,3,4,5,7,9,11,13),
   native value/escrow (#1,6,7,8,10 as factory-value,11,12,13), images/screenshots
   (#1,7,8,9,11), embeddings/VecDB (#6), EVM interop (#5,9), contract factories (#7,9,10).
   That is **five distinct capability areas actually represented** (web, value/escrow,
   images, embeddings, EVM interop, factories — six counting factories separately),
   well above the required three, and **two candidates (#1 and #13, also #6) genuinely
   involve native value/escrow** as a load-bearing mechanic, not bookkeeping.
2. **Most similar pair:** #1 (VDE) and #8 (visual arbitration escrow) are the closest —
   both are "two-sided bonded claim, contest window, one nondet resolution round,
   image + text evidence, symmetric slashing." They are genuinely one mechanism wearing
   two hats. I kept #1 because the trust story is sharper: e-commerce disputes already
   have chargeback rails and centralized arbitration that mostly work; inheritance has
   no comparable trustworthy automated primitive today, and the stakes (a decision that
   cannot be undone once funds move) are categorically higher.
3. **Strongest candidate if web access did not exist:** #6, the embedding-similarity
   plagiarism bond — it is the only candidate whose core judgement (semantic similarity
   between a new mint and prior work) does not fundamentally depend on live web
   evidence, leaning instead on `VecDB`/`knn` over on-chain-stored embeddings plus LLM
   judgement. I did not choose it because VDE's "money changes hands based on a claim
   about the physical world" framing is the cleaner answer to "why does this need
   GenLayer at all," and because a plagiarism bond's failure mode (a wrongly-flagged
   derivative work) is recoverable in a way a wrongly-released inheritance is not —
   irreversibility is exactly the property that makes trustless judgement valuable.
4. **Strongest discarded candidate:** #6 (embedding plagiarism bond), for the reasons
   above — it is a complete, defensible primitive I would be comfortable building if
   asked to demonstrate the embeddings capability specifically.

## Gate-by-gate justification for the pick (VDE)

- **Gate A (counterfactual):** Remove GenLayer and this becomes either a plain
  inactivity timer (can't distinguish "dead" from "traveling, hospitalized, keys lost")
  or a single trusted executor who decides — exactly the single point of
  coercion/bribery/error that real probate disputes turn on.
- **Gate B (trust problem):** At least three mutually distrusting parties: the
  beneficiary (wants release), the grantor/subject themself if still alive (wants to
  prevent wrongful release), and any other claimant or contester who may have
  self-interested reasons to submit biased evidence in either direction.
- **Gate C (judgement):** "Does this specific named person's public evidence trail
  establish their death, net of any contest evidence" is irreducibly semantic — name
  disambiguation, date consistency, weighing an obituary against a live "proof of life"
  counter-submission. No deterministic parser or numeric feed resolves this.
- **Gate D (reusable primitive):** A consumer estate-planning or DAO-succession
  contract integrates in well under 10 lines — see `examples/estate_planner_example.py`.
- **Gate E (consequential):** Gates an irreversible native-token payout, and can equally
  gate a role/permission handoff (e.g., DAO successor admin rights) via the same
  verdict.
- **Gate F (originality):** Not on this cycle's collision list (page-change materiality;
  multi-source independence-clustering oracles) and distinct from existing ecosystem
  bonded-milestone work (ShipBond-shaped) in both its judgement question and its
  symmetric-bond/contest-window mechanics.
