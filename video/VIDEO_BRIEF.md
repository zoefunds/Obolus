# VIDEO_BRIEF.md — Obolus

## One-sentence product definition
Obolus is a GenLayer-native inheritance escrow that releases locked funds to a beneficiary
only when independent validator consensus, reasoning over live-fetched real-world evidence,
agrees a named subject has died — not on a timer, and not on one person's word.

## Target viewer
GenLayer hackathon judges and technical evaluators: people who know what an oracle problem
is, are skeptical of "AI decides" framing, and will punish any claim that isn't backed by
what's actually in the contract.

## Primary video objective
Prove — not just claim — that Obolus replaces two broken inheritance mechanisms
(inactivity timers, trusted executors) with evidence + contest window + validator
consensus, and that this is a genuinely necessary use of GenLayer's non-deterministic,
web-reading Intelligent Contracts (not blockchain theater bolted onto a normal escrow).

## Central message
"A death claim is not a fact until independent judgment, working from real evidence, is
willing to bet on it."

## Intended emotion
Quiet technical confidence. Not crypto hype, not tragedy. The tone of a system that takes
an uncomfortable subject (death, inheritance) seriously by building real rigor around it.

## Current product stage
Working MVP, live on GenLayer StudioNet (a testnet), not mainnet, not audited.

## Implemented capabilities (real, verifiable in repo/live app)
- Contract deployed and live: `0x82a1e87F2Abc790B950fD645E6D7A5aC27F43f91` on GenLayer StudioNet.
- Full vault lifecycle on-chain: create/fund vault, submit death claim + bond, contest
  claim + bond, resolve_claim, pull-based withdraw.
- `resolve_claim` genuinely calls `gl.nondet.web.render`/`get` to fetch submitted evidence
  URLs live, optionally passes images to the model, and uses `gl.eq_principle.prompt_comparative`
  — GenLayer's actual validator-consensus primitive — requiring validators to agree exactly
  on verdict category + confidence band.
  Reference: `contracts/verifiable_decease_escrow.py` lines ~926–1016.
- Three-way verdict (CONFIRMED / REFUTED / INCONCLUSIVE) with confidence bands
  (LOW/MEDIUM/HIGH), only HIGH ever changes terminal state — this is a real contract
  invariant, not UI copy.
- Bond routing per outcome (claimant/contester bond return or forfeiture) is implemented
  in contract code (lines ~1083–1139).
- Frontend writes are signed by the user's own connected wallet (`genlayerBrowser.js`),
  not a server-held key — confirmed in README.
- 58+4 passing pytest direct-mode contract tests.
- Admin surface (pause/unpause, minimum bonds) is real, owner-gated on-chain, and
  explicitly **cannot** block `resolve_claim` or `withdraw` even while paused — visible
  in the Admin screenshot copy itself.
- Dashboard, Vault detail (claim timeline with countdown), New Vault form, and Admin panel
  are real, working screens (see attached screenshots).

## Simulated / not-yet-real capabilities
- No claim in this video's evidence set has actually resolved CONFIRMED/REFUTED yet
  (dashboard shows CONFIRMED: 0, REFUTED: 0 in the current data) — the resolution
  mechanism is real and tested, but we do not have a live on-screen "money moved" moment
  to record. The video must show the **claim pending / contest window** state, which IS
  real and captured, and describe resolution mechanics using the contract code + README
  as evidence, not an invented on-screen payout animation.
- No screenshot of a validator-consensus disagreement or an actual resolved verdict
  screen exists — do not fabricate one.

## Future / roadmap capabilities (say "designed for," never "already does")
- Nothing beyond what's in README's "Known limitations" should be framed as roadmap;
  avoid inventing a roadmap not stated by the project.

## Principal call to action
Visit the live app (obolus-app.vercel.app) and read the contract
(`verifiable_decease_escrow.py`) / GenLayer (genlayer.com).

## Final video duration
Master: 105 seconds. Teaser: 25 seconds (vertical, social).

## Output aspect ratios
- 1920×1080 16:9 (master, hackathon submission)
- 1080×1920 9:16 (social/teaser)
- 1080×1080 1:1 (secondary social)
All at 30fps, final export in 4K (3840×2160) for the 16:9 master per user request —
composition authored at 1080p logical units, rendered at 4K scale.

## Brand direction
Pulled directly from `frontend/tailwind.config.js` / `frontend/DESIGN.md` tokens — dark
surface (#0A0B0D background, #111317 surface), warm gold primary (#f2ca50 / #d4af37),
cool cyan secondary (#7bd0ff), green tertiary (#58e7aa) reserved for confirmed/success
states, Inter for UI text, JetBrains Mono for addresses/code/technical labels. No purple
gradients, no neon, no glassmorphism — the real app is spare, dark, almost bureaucratic
in tone (deliberately: this is a legal/financial instrument, not a game).

## Evidence available
- 4 real screenshots: Dashboard (vault list, as-grantor/as-beneficiary split), Vault #2
  detail (CLAIM_PENDING state, contest window countdown, participants, actions), New
  Vault creation form, Admin panel (platform stats, pause controls, minimum bonds).
- Full README.md (problem framing, lifecycle, roles, evidence model, architecture).
- Full contract source (`contracts/verifiable_decease_escrow.py`, 1270 lines).
- MEMORY.md (deployment history / bugs found — background context only, not for the film).

## Evidence missing
- No screen recording of the live app (approved: build from screenshots instead).
- No recording/screenshot of an actual resolved claim (CONFIRMED or REFUTED state).
- No recording of the wallet-connect / GenLayer StudioNet network-switch flow.

## Claims that must not be made
- Must not claim any claim has ever actually resolved CONFIRMED or paid out — the visible
  stats show 0 confirmed, 0 refuted; only the mechanism is proven, not a track record.
- Must not describe StudioNet as mainnet or imply audited production security.
- Must not imply the platform owner can access or move vault funds — contract explicitly
  forbids this even while paused.
- Must not claim off-chain company backing/insurance/guarantee of any kind.

## Assumptions made (no user input available)
- Voiceover: single neutral, confident voice via Higgsfield MCP `create_voice`.
- No live screen recording will be produced; UI motion will be built as faithful Remotion
  reconstructions of the 4 screenshots plus code-derived architecture diagrams.
- Master aspect ratio for the hackathon submission is 16:9; 9:16/1:1 are secondary.
