# ASSET_MANIFEST.md — Obolus

| Asset | Classification | Used in scene(s) | Notes |
|---|---|---|---|
| Dashboard screenshot (vaults/claims/confirmed/escrowed stats, as-grantor/as-beneficiary lists) | supplied screenshot | reference only, informs Scene 5/8 stat styling | Real numbers: Vaults 2, Claims 1, Confirmed 0, Escrowed 10000 GEN |
| Vault #2 detail screenshot (Jaden Jason, CLAIM_PENDING, countdown, participants, actions) | supplied screenshot | Scene 5, Scene 6 | Primary hero UI asset — reconstruct faithfully in Remotion, exact copy |
| New Vault creation form screenshot | supplied screenshot | Scene 4 | Exact field labels/placeholders/helper text must be preserved |
| Admin panel screenshot (platform stats, pause controls, minimum bonds) | supplied screenshot | Scene 9 | Exact copy of the "Never blocks resolve_claim or withdraw" sentence is load-bearing |
| Obolus favicon/logo mark | existing repository asset | Scene 3, Scene 11 | `frontend/public/favicon.svg` |
| Brand color tokens | existing repository asset | all UI scenes | `frontend/tailwind.config.js` — see VIDEO_BRIEF Brand direction |
| Inter (UI font) | existing repository asset (Google Font) | all text | Need to bundle font file for Remotion (not system-dependent at render time) |
| JetBrains Mono (code/address font) | existing repository asset (Google Font) | addresses, contract labels | Same bundling requirement |
| Contract source (`contracts/verifiable_decease_escrow.py`) | existing repository asset | Scene 7 diagram labels | Source of truth for gl.nondet / gl.eq_principle function names |
| README.md | existing repository asset | narration/copy accuracy check across all scenes | — |
| Architecture flow diagram (evidence → fetch → validators → consensus → verdict) | Remotion-generated visual | Scene 7 | Built as ArchitectureFlow component, not an external image |
| State machine strip (SUBMITTED → EVIDENCE FETCHED → VALIDATED → RESOLVED) | Remotion-generated visual | Scene 5, Scene 7 | Reused component across scenes for visual consistency |
| Three-outcome cards (CONFIRMED/REFUTED/INCONCLUSIVE) | Remotion-generated visual | Scene 8 | Colors: tertiary green / error red / neutral grey per theme tokens |
| Countdown/timer graphic (generic, Scene 1) | Remotion-generated visual | Scene 1 | Deliberately styled OUTSIDE brand colors (muted red/grey) since it represents the problem, not the product |
| Wordmark/logo assembly animation | Remotion-generated visual | Scene 3, Scene 11 | Same spring-settle motion reused for continuity |
| End card | Remotion-generated visual | Scene 11 | URL, contract address, GenLayer attribution |
| Tick/keystroke SFX | sound effect | Scene 4 | Soft, per-field, not per-pixel — **not yet generated** |
| State-transition chime | sound effect | Scene 5, Scene 8 | **not yet generated** |
| Consensus/convergence chime | sound effect | Scene 7 | **not yet generated** |
| Logo reveal chime | sound effect | Scene 3, Scene 11 | **not yet generated** |
| Background music bed (tension → lift → confidence → resolution arc) | **missing — no tool available** | full film | `generate_audio`'s model catalog in this workspace only exposes speech models (`seed_audio`, `text2speech_v2`); no standalone music-generation model is available outside the game-generation pipeline. No music track exists. |
| Voiceover (VOICEOVER_SCRIPT.md, voice: Marcus, male preset) | **blocked — generation attempted, failed** | full film | `create_voice`/`generate_audio` call returned "Out of credits in the selected workspace." Script and voice selection are final and ready; `Film.tsx` has an `AUDIO_ENABLED` flag (currently `false`) — generate `public/audio/voiceover.mp3`, flip the flag, and re-render once credits are available. The render in this pass has no narration track. |
| Voiceover (single neutral confident voice) | voiceover | full film | Higgsfield MCP `create_voice` / `generate_audio`, per VOICEOVER_SCRIPT.md |
| GenLayer wordmark/attribution mark | missing | Scene 10, Scene 11 | Not present in this repo — need either a text-only attribution ("Built on GenLayer") or the user to supply the official mark; **do not fabricate a logo**. Default to text-only attribution unless supplied. |
| Real screen recording of the live app | missing (explicitly deferred per user decision) | n/a | Approved to proceed without it — all UI scenes are faithful Remotion reconstructions of the 4 supplied screenshots instead |
| Screenshot/recording of an actual resolved claim (CONFIRMED/REFUTED) | missing — does not exist because no claim has resolved yet | n/a | Per PRODUCT_TRUTH_MAP: never fabricate this. Scene 8 shows the three possible outcomes as a designed system, not a completed case |
| Pexo-generated cinematic footage | not used in master film | n/a | Per plan, this film relies entirely on real screenshots + code-derived diagrams + typography; no generic cinematic Pexo shots are needed and none should be added merely for polish (see PEXO_PROMPTS.md for the one optional exception considered) |
