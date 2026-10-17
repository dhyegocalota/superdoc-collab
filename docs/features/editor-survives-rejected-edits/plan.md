# Plan: The editor survives a rejected edit

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `onException` in `apps/web/src/features/editor/superdoc-editor.tsx`.
**Assumptions (decided, owner can override):**
- Our own copy is shown, not SuperDoc's message, so the phrasing lives in `editor-copy.ts`.
- The status clears on pointer down, not on a timer.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/editor/superdoc-exceptions.ts`, `superdoc-exceptions.test.ts`, `superdoc-editor.tsx`, `editor-copy.ts`, `e2e/collaboration.spec.ts` | lead, inline |

## Sequencing

One group.

## Steps

### G1

- [x] **Step 1:** red unit test and stub (`isRecoverableException is not implemented`).
- [x] **Step 2:** classifier, status line, copy; unit green.
- [x] **Step 3:** E2E regression in `collaboration.spec.ts` (red on main: the fatal message shows; green now).

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | a truly fatal failure arrives with `edit-rejected` and is hidden | the E2E suite's other specs would show an editor that stops syncing with no message | the code list is one enum member; widen `isRecoverableException` only with a reproduction |
| 3 | the E2E is timing-sensitive on CI | the rejected-edit status never appears because Bruno's delete lands before Ana's first keystroke | the typing starts before Bruno clicks and runs for 5 s at 120 ms per key |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** screenshots of the status line and the recovery.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
