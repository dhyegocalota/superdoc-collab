# Plan: Reload-safe align shortcut

**Spec:** spec.md
**Tier:** 🟢
**Seam:** the `ShortcutId.AlignRight` entry of the registry in `apps/web/src/features/shortcuts/shortcuts.ts`
**Assumptions (decided, owner can override):**
- SuperDoc does not bind the reload keys; the E2E proves it.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/shortcuts/shortcuts.ts`, `shortcuts.test.ts`, `e2e/shortcuts.spec.ts`, `docs/features/reload-safe-align-shortcut/`, `docs/features/word-like-shortcuts/spec.md` | `developer` |

## Sequencing

One group, one lane.

## Steps

### G1

- [x] **Step 1:** failing registry and hook tests, then move `AlignRight` to Mod+Alt+R. — evidence: red 1881761b, green in the implementation commit
- [x] **Step 2:** E2E: Mod+Alt+R aligns right; Mod+R and Mod+Shift+R leave alignment unchanged and are not `defaultPrevented`. — evidence: 1881761b (written, not run by the developer)
- [x] **Step 3:** update every document that states ⌘R for align right. — evidence: word-like-shortcuts spec; no other file stated it

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | Another definition already holds Mod+Alt+R | the duplicate-combination test fails | pick the key the owner names next |
| 2 | SuperDoc prevents default on Mod+R | the E2E reports `defaultPrevented` true | capture-phase listener that stops propagation only |

**Steps with no backout:** none

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] ~~**Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.~~ Cut by the owner's lean process on 2026-10-21 for this 🟢 lane; the lead ticked the boxes from the gate.
- [x] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] ~~**/check-ui:** screenshots and video recorded and uploaded (only if UI was touched).~~ Cut by the owner's lean process on 2026-10-21; no visual change.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
