# Plan: Sign-out leaves the page before it clears the session

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `use-sign-out.ts`.
**Assumptions (decided, owner can override):**
- Reordering is enough; `RedirectIfSession` already handles a signed-out arrival with a cached user.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/auth/use-sign-out.ts`, `sign-out-flow.test.tsx`, `docs/features/sign-out-redirect-race/`, `docs/features/README.md` row, a Revisited line | `developer-sm` |

## Sequencing

One step.

## Steps

### G1

- [x] **Step 1:** red test that the cached session still holds the user when the hook navigates; reorder `use-sign-out.ts`. — evidence: red e79cf460, green 8ebb82ed

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | the page shows the old user for a frame after sign-out | the account menu flashes before the form | none seen: the route changes before the cache does; revert the reorder |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [x] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence. — evidence: f840fc4e
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
