# RECORDING_PLAN.md — Obolus

## Current decision
Per explicit user choice, this build uses the 4 supplied screenshots (Dashboard, Vault #2
detail, New Vault form, Admin panel) reconstructed faithfully in Remotion, rather than a
live screen recording. No recording session is planned for this pass.

## If a live recording is done for a future revision
Standards to follow (per the general brief, applicable to this specific app):

1. **Account/data setup**
   - Use a demo wallet address distinct from any personal address (do not reuse
     `0x7401...58Eb` if it has any real association — confirm with the user first).
   - Seed clean demonstration data: one vault in `ACTIVE`, one in `CLAIM_PENDING` with a
     believable countdown, matching the real screenshots already in hand for continuity.
   - Remove/replace the "Vault #1 — Jane Doe / CANCELLED" entry unless it's needed —
     keep only the states the storyboard actually uses.

2. **Capture settings**
   - Record at 60fps, browser window sized to a clean 1920×1080 or higher, no dev tools
     open, no unrelated tabs visible.
   - Disable OS/browser notification popups before recording.
   - Move the cursor deliberately: pause ~0.5s before each click, no idle jitter.

3. **Sequences to capture separately** (so Remotion can re-time/crop each independently):
   - Wallet connect + StudioNet network auto-switch prompt (mentioned in README, never
     shown in the current screenshots — high-value addition if captured).
   - Filling the New Vault form field-by-field.
   - Submitting a death claim (`Submit Counter-Evidence` / claim submission flow) —
     currently only the pending-state result is available as a screenshot, not the
     submission action itself.
   - If a claim is ever actually resolved in a live/test environment: the resolution
     screen showing CONFIRMED/REFUTED/INCONCLUSIVE. This is the single most valuable
     missing asset — capturing a real resolution (even on a testnet with synthetic
     evidence) would let a future cut replace Scene 8's designed-system diagram with an
     actual proof shot. Until then, do not fabricate this.

4. **Sensitive data**
   - Confirm no real private keys, seed phrases, or personal identifying information
     appear in any recorded frame before handing footage off for editing.
