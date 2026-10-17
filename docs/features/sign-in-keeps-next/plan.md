# Plan: Sign-in keeps the next path

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `RedirectIfSession` in `apps/web/src/features/auth/`.
**Assumptions (decided, owner can override):**
- The redirect target comes from the same `safeNextPath` the submit uses, so the two can never disagree.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/auth/redirect-if-session.tsx`, `apps/web/src/features/auth/redirect-if-session.test.tsx`, `e2e/auth.spec.ts` | lead, inline |

## Sequencing

One group.

## Steps

### G1

- [x] **Step 1:** red unit tests (`next` honoured; foreign origin ignored) and the red E2E (share link → sign-in → shared document).
- [x] **Step 2:** `RedirectIfSession` navigates to `safeNextPath(next)`; tests green.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | a redirect loop between sign-in and a `next` that itself requires sign-in | the E2E times out on `/sign-in` | `safeNextPath` never returns `/sign-in`; the existing `visiting documents signed out…` E2E pins the plain case |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** screenshots of the share link → sign-in → document walk.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
