# STORYBOARD.md — Obolus (95s master, Structure C: Claim → Verification)

Legend: real asset = from the 4 attached screenshots / repo. Remotion-gen = built with
code/motion, no external asset. Pexo = generated cinematic footage.

---

### Scene 1 — Cold open: the wrong question
- **Purpose:** hook via contradiction, no product name yet
- **Start–End:** 0:00–0:05 (5s)
- **Voiceover:** "Ninety days of silence. Is that a death — or a vacation?"
- **On-screen copy:** "SILENCE ≠ DEATH"
- **Visual:** A countdown ticking on a dark screen (Remotion-gen, monospace, our theme
  colors) — mimics an inactivity-timer dead-man's-switch, deliberately generic/cold.
- **Real asset required:** none
- **Remotion animation:** KineticText + numeric countdown ticking down, harsh cut to black at 0:05
- **Pexo asset:** none
- **Transition in:** hard cut (film open)
- **Transition out:** flash cut to black
- **Sound cue:** single low tick per second, cuts on the flash
- **Proof shown:** none (framing only)
- **Viewer takeaway:** existing mechanisms answer the wrong question

### Scene 2 — The two broken mechanisms
- **Purpose:** establish stakes and existing failure modes
- **Start–End:** 0:05–0:13 (8s)
- **Voiceover:** "Digital inheritance today runs on a timer, or on one person's word. Neither one can tell 'he died' apart from 'he's on a boat.'"
- **On-screen copy:** "A TIMER CAN'T TELL THE DIFFERENCE" / "NEITHER CAN ONE PERSON'S WORD"
- **Visual:** Split composition — left: the same countdown from Scene 1, now labeled
  "INACTIVITY TIMER"; right: a single silhouette icon labeled "TRUSTED EXECUTOR" with a
  checkmark stamped down unilaterally. Both rendered in muted red/grey, not brand colors
  (these are the problem, not the product).
- **Real asset required:** none
- **Remotion animation:** ArchitectureFlow-style split-screen build, KineticText labels
- **Pexo asset:** none (kept in-Remotion per brief guidance — this is a clean contradiction, not cinematic filler)
- **Transition in:** continue from flash
- **Transition out:** both halves collapse toward center, fading to black
- **Sound cue:** tension pad begins, low
- **Proof shown:** none
- **Viewer takeaway:** the two dominant approaches share the same flaw — no independent verification

### Scene 3 — Product reveal
- **Purpose:** name lands as the answer
- **Start–End:** 0:13–0:18 (5s)
- **Voiceover:** "Obolus asks for proof instead."
- **On-screen copy:** "OBOLUS" (logo mark + wordmark, gold #f2ca50)
- **Visual:** Wordmark assembles from the collapsed halves of Scene 2 (motion continuity), settles centered, one clean hold.
- **Real asset required:** Obolus coin/mark icon (recreate from `frontend/public/favicon.svg`)
- **Remotion animation:** spring-based logo settle, no spin/particles, 1.5s hold
- **Pexo asset:** none
- **Transition in:** match-continuation from Scene 2 collapse
- **Transition out:** logo shrinks to corner badge, browser frame fades in behind it
- **Sound cue:** single confident low chime, tension pad resolves to a calmer tone
- **Proof shown:** none
- **Viewer takeaway:** remember the name and that it means "proof-first"

### Scene 4 — Vault creation (the terms)
- **Purpose:** show the user's first real action inside the product
- **Start–End:** 0:18–0:31 (13s)
- **Voiceover:** "A grantor locks GEN in a vault — names who receives it, and whose death has to be proven to release it."
- **On-screen copy:** "NAME WHO. NAME WHOSE DEATH."
- **Visual:** BrowserFrame containing a faithful reconstruction of the New Vault screenshot:
  Beneficiary Address, Subject Name, Birth Year, Known Aliases, Contest Window (30 days),
  GEN to Escrow. Cursor fills fields in sequence, deliberate pacing, brief pause before
  each field lands.
- **Real asset required:** New Vault form screenshot (reconstructed faithfully, real labels/placeholders)
- **Remotion animation:** BrowserFrame + Cursor + form-fill sequence, FocusZoom on
  "Contest Window" and "GEN to Escrow" fields specifically
- **Pexo asset:** none
- **Transition in:** browser frame pushes in from corner badge
- **Transition out:** push-in zoom on the filled form, fades to next screen
- **Sound cue:** soft keystroke/tap ticks per field, no SFX per pixel
- **Proof shown:** the actual field set and copy from the real app
- **Viewer takeaway:** creating a vault is explicit and structured, not a blind lockup

### Scene 5 — A claim is submitted
- **Purpose:** introduce the trigger event (Structure C step 1)
- **Start–End:** 0:31–0:40 (9s)
- **Voiceover:** "Anyone can submit a death claim — evidence, and a bond as skin in the game."
- **On-screen copy:** "A CLAIM. A BOND. A WINDOW OPENS."
- **Visual:** Vault detail screen (real screenshot content, Vault #2 — Jaden Jason)
  assembles: status badge CLAIM_PENDING appears, timeline shows "Claim Submitted" checked.
- **Real asset required:** Vault #2 detail screenshot (reconstructed)
- **Remotion animation:** EvidenceCard reveal for the claim, StateMachine tick from
  ACTIVE → CLAIM_PENDING with a labeled transition arrow
  ("submit_death_claim")
- **Pexo asset:** none
- **Transition in:** wipe from Scene 4 via shared BrowserFrame element
- **Transition out:** timeline continues, camera pans down to "Contest Window"
- **Sound cue:** state-transition chime (distinct from logo chime, reused later)
- **Proof shown:** real vault state naming (CLAIM_PENDING is an actual contract status)
- **Viewer takeaway:** claims are open to anyone, and cost something to file

### Scene 6 — The contest window
- **Purpose:** show the dispute mechanism is real and live
- **Start–End:** 0:40–0:48 (8s)
- **Voiceover:** "Vault assets freeze. Anyone with counter-evidence has a real window to speak before judgment runs."
- **On-screen copy:** "23H 55M 41S TO CONTEST"
- **Visual:** Close-up crop on the countdown ("Contest Window — Ends in 23H 55M 41S") and
  the "Submit Counter-Evidence" action button from the real screenshot.
- **Real asset required:** Vault #2 detail screenshot, cropped region
- **Remotion animation:** FocusZoom on the countdown + ClickPulse hint on the counter-evidence button (not clicked — just highlighted, since we have no recording of this action)
- **Pexo asset:** none
- **Transition in:** continue pan from Scene 5
- **Transition out:** countdown digits freeze and rotate into a diagram frame
- **Sound cue:** ticking countdown continues under voiceover, fades into mechanism scene's ambient tone
- **Proof shown:** real countdown value and button copy from the actual app
- **Viewer takeaway:** the contest window isn't cosmetic — it's a genuine adjudication period before money can move

### Scene 7 — The mechanism: how judgment actually happens
- **Purpose:** technical credibility — Structure C steps 3–6
- **Start–End:** 0:48–1:06 (18s)
- **Voiceover:** "When the window closes, GenLayer's validators each fetch every submitted
  URL — live, as text — read any attached image, and independently reason toward a
  verdict. They don't vote on vibes. They have to agree exactly: same category, same
  confidence band. Confidence is never a number — it's low, medium, or high — and only
  high confidence ever moves a single unit of value."
- **On-screen copy:** "FETCHED LIVE." / "JUDGED INDEPENDENTLY." / "MUST AGREE EXACTLY."
- **Visual:** ArchitectureFlow diagram, revealed causally left to right: [Evidence URLs] →
  [gl.nondet.web.render/get: live fetch] → [N validator nodes, each reasoning
  independently, shown as parallel branches] → [gl.eq_principle.prompt_comparative:
  consensus check] → [Verdict]. Labels use plain language first, contract function names
  as small supporting monospace labels underneath.
- **Real asset required:** none (diagram is code-derived, labels sourced from
  `contracts/verifiable_decease_escrow.py` lines 803-1016)
- **Remotion animation:** ArchitectureFlow with staged reveal timed to voiceover clauses;
  StateMachine strip below showing SUBMITTED → EVIDENCE FETCHED → VALIDATED → RESOLVED
- **Pexo asset:** none — this is the single most important credibility scene; it must be
  built from real contract logic, not generic cinematic filler
- **Transition in:** diagram frame continues from Scene 6's rotated countdown
- **Transition out:** the diagram's "Verdict" node splits into three labeled paths
- **Sound cue:** distinct rising tone per validator branch appearing, consensus chime when branches converge
- **Proof shown:** direct citation of the real contract mechanism (gl.nondet, gl.eq_principle)
- **Viewer takeaway:** this is a mechanically real verification process, not "AI decides" hand-waving

### Scene 8 — The three outcomes
- **Purpose:** show discipline of the verdict system, including the honest "nothing happens" path
- **Start–End:** 1:06–1:16 (10s)
- **Voiceover:** "Confirmed moves the vault to the beneficiary. Refuted slashes the
  claimant's bond back into it. Inconclusive returns every bond and changes nothing —
  abstention is the default, not a failure."
- **On-screen copy:** "CONFIRMED" / "REFUTED" / "INCONCLUSIVE — NOTHING MOVES"
- **Visual:** Three labeled state cards side by side (tertiary green / error red / neutral
  grey per theme), each with a one-line fund-routing summary matching the README table exactly.
- **Real asset required:** none (values sourced directly from README §4 table)
- **Remotion animation:** MetricReveal-style three-card stagger, INCONCLUSIVE card
  visually calmer/held longer to make the point it's not a failure state
- **Pexo asset:** none
- **Transition in:** verdict split from Scene 7
- **Transition out:** cards recede, camera pulls back to reveal the Admin panel
- **Sound cue:** three distinct short confirmation tones, one per card
- **Proof shown:** exact bond-routing rules as implemented in contract (L1083-1139)
- **Viewer takeaway:** every outcome, including "nothing happens," is accounted for

### Scene 9 — Trust boundary: what the platform owner cannot do
- **Purpose:** credibility/evidence section — proves it's not a backdoor system
- **Start–End:** 1:16–1:26 (10s)
- **Voiceover:** "The platform owner can pause new activity. They cannot touch a vault, block a resolution, or stop a withdrawal — even paused."
- **On-screen copy:** "OWNER CANNOT MOVE FUNDS."
- **Visual:** Real Admin panel screenshot reconstruction — pull focus to the exact line:
  "Never blocks resolve_claim or withdraw — funds already at stake stay resolvable and withdrawable."
- **Real asset required:** Admin panel screenshot (reconstructed, real copy verbatim)
- **Remotion animation:** FocusZoom on that sentence, EvidenceCard-style highlight box
- **Pexo asset:** none
- **Transition in:** pull-back continuation from Scene 8
- **Transition out:** panel recedes into a small wallet-sign diagram
- **Sound cue:** calm, resolving tone
- **Proof shown:** verbatim real UI copy, backed by contract's owner-only guard
- **Viewer takeaway:** even the platform operator is constrained by the contract, not by promise

### Scene 10 — Ecosystem positioning
- **Purpose:** explain the GenLayer relationship precisely, without logo name-dropping
- **Start–End:** 1:26–1:35 (9s)
- **Voiceover:** "This only works on a chain whose contracts can read the open web and
  reach judgment under consensus. That's GenLayer — and today, that's exactly what's
  running, live, on its StudioNet."
- **On-screen copy:** "BUILT ON GENLAYER. LIVE ON STUDIONET."
- **Visual:** Pull back from the Admin panel diagram into a single frame showing: contract
  address (monospace), "GenLayer StudioNet" label, small GenLayer wordmark attribution
  (not a hero logo moment — a factual attribution, sized modestly).
- **Real asset required:** none (contract address from README, real)
- **Remotion animation:** simple pull-back camera move, EvidenceCard showing the deployed
  contract address
- **Pexo asset:** none
- **Transition in:** continuation pull-back from Scene 9
- **Transition out:** frame darkens, wordmark from Scene 3 reappears small, top-left
- **Sound cue:** ambient tone settles toward the closing chime
- **Proof shown:** real, live contract address and network name — qualified explicitly as a testnet
- **Viewer takeaway:** the GenLayer dependency is load-bearing, not decorative — and it's genuinely running today, not promised for later

### Scene 11 — Closing statement
- **Purpose:** memorable belief statement + end card
- **Start–End:** 1:35–1:45 (10s)
- **Voiceover:** "A death is a fact, not a feeling. Obolus doesn't move money until the evidence is willing to say so."
- **On-screen copy:** "PROOF, NOT A PROMISE."
- **Visual:** Full wordmark returns centered, followed by end card: "OBOLUS — an
  evidence-verified inheritance escrow on GenLayer" / "obolus-app.vercel.app" /
  "Contract: 0x1095...f0b94 — GenLayer StudioNet" / small GenLayer attribution mark.
- **Real asset required:** none
- **Remotion animation:** EndCard component, wordmark spring-settle (same motion language as Scene 3, for continuity), text fades in staggered, held for 3s
- **Pexo asset:** none
- **Transition in:** continuation from Scene 10's darkened frame
- **Transition out:** fade to black (film close)
- **Sound cue:** final resolving chime, music fades out under it
- **Proof shown:** live URL + real contract address, repeated for retention
- **Viewer takeaway:** the film's single belief statement, plus exactly how to verify it themselves

---

**Total master runtime: 105 seconds**, 30fps, 1920×1080 (rendered to 4K), landscape.
Scene count intentionally limited to 11 — each scene carries exactly one idea per the
motion-language rule against multi-idea shots.

