# Plan: Readability in the web app

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `apps/web/src` outside the excluded files named in the spec.
**Assumptions (decided, owner can override):**
- The `sendFromFrame` in `time-travel.test.tsx` sends viewer messages with another shape, so it is not a duplicate of the print-frame one and stays.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/**` except the exclusion list in the spec | `developer-sm` |

## Sequencing

One developer, steps in order, one commit per step.

## Steps

- [ ] **Step 1:** `FormMessage` branches on the error; the form tests pin it.
- [ ] **Step 2:** shared `stubMatchMedia` and print-frame helpers in `apps/web/src/testing`.
- [ ] **Step 3:** split `Streamgraph`; `streamgraph.test.tsx` pins it.
- [ ] **Step 4:** split `useTimeTravel`; `time-travel.test.tsx` pins it.
- [ ] **Step 5:** sweep the versions and documents features.
- [ ] **Step 6:** un-export dead exports in `apps/web/src`.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | A validation message disappears | form unit tests fail | revert the commit |
| 2 | A test double answers differently | theme, panel position, print view or download menu tests fail | revert the commit |
| 3 | The chart DOM changes | streamgraph unit tests or the time-travel E2E fail | revert the commit |
| 4 | Time travel resolves a different version | time-travel unit tests fail | revert the commit |
| 5 | A rewrite changes behaviour | the touched unit files fail | revert that commit |
| 6 | Another file imports the name | `pnpm typecheck` fails | revert the commit |

**Steps with no backout:** none

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **/open-pr:** `pnpm verify` green, learnings sweep stated, PR opened.
