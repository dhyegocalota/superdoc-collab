# Plan: The loading line above the toolbar is for screen readers only

**Spec:** spec.md
**Tier:** 🟢
**Seam:** the status paragraph in `apps/web/src/features/editor/document-page.tsx`.
**Assumptions (decided, owner can override):**
- The line stays in the DOM so the Download button keeps its accessible description.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/editor/document-page.tsx`, `document-page.test.tsx` | `developer-ac` |

## Sequencing

One group.

## Steps

### G1

- [x] **Step 1:** red unit test, then the `sr-only` class; the file-error and superseded cases untouched. — evidence: red and green commits on `fix/loading-line`

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | an E2E waits for the loading line to be visible | a spec fails on `toBeVisible` for the loading text | the spec asserts `toBeAttached` instead |

**Steps with no backout:** none.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** screenshots of the opening page at 1280 and 375.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
