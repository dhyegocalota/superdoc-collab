# Plan: Readability in the libraries

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `libs/history/src`, `libs/types/src` and seven blank-string call sites.
**Assumptions (decided, owner can override):**
- `isBlank` trims, so the two raw compares in `filter-box.tsx` and `keyboard.ts` stay as they are.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/history/src/**`, `libs/types/src/**` except `constants.ts`, the five call sites named in the spec | `developer-ss` |

## Sequencing

One developer, steps in order. Step 2 comes before its call sites.

## Steps

- [ ] **Step 1:** remove the `else` and the non-null assertion in `binStartContaining`; the runs and bins tests pin it.
- [ ] **Step 2:** `isBlank` test first, then `isBlank`, then the five call sites.
- [ ] **Step 3:** un-export `runMatchesTerm` and `PASSWORD_MIN_LENGTH` after a repository-wide grep.
- [ ] **Step 4:** examine the two `transitionsOf` helpers; they differ, so nothing is shared and the spec says why.
- [ ] **Step 5:** sweep the libraries for the conventions; fix the clear cases and list the rest in the spec.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | A bin lookup returns the wrong bin | runs and bins unit tests fail | revert the commit |
| 2 | A blank check changes meaning | the touched web and server unit tests fail | revert the commit |
| 3 | Another package imports the name | `pnpm typecheck` fails | revert the commit |
| 5 | A rewrite changes behaviour | the touched unit files fail | revert that commit |

**Steps with no backout:** none

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **/open-pr:** `pnpm verify` green, learnings sweep stated, PR opened.
