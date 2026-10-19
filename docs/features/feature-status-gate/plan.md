# Plan: Feature status gate

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `apps/server/src/repository-shape/`, the `shape` gate of `pnpm verify`
**Assumptions (decided, owner can override):**
- A spec may carry its status as `**Status:** X` or `- Status: X`; the vocabulary is what the test pins, not the markup.
- The PR link lives on the index row only; the spec carries the plain `Shipped <date>`.
- A merged pull request counts when its branch name after the type prefix equals a feature folder, whatever the type; lane branches merge without a pull request and never match.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/server/src/repository-shape/feature-status.test.ts`, `docs/features/**/spec.md`, `docs/features/README.md` | lead |
| G2 | `.claude/HARNESS.md`, `.agents/skills/open-pr/SKILL.md`, `.agents/skills/feature/SKILL.md`, `docs/learnings/` | lead |

## Sequencing

G1 first: the red test lists the corrections. G2 after, naming the test.

## Steps

### G1

- [x] **Step 1:** the test, red against the tree: 4 vocabulary, 48 row and 35 merge-history violations.
- [x] **Step 2:** every status line and row set from the merge history; green. Review finding: six dates had been written from UTC; rewritten in America/Sao_Paulo.

### G2

- [x] **Step 3:** HARNESS §7 → Status and §12, `/open-pr` pre-flight and Merge step, `feature` skill step 7, index rules, learning.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | A lane branch in progress fails the merge-history test | the test names the slug while the PR is still open | the pattern matches `Merge pull request` subjects only, which exist after the merge |
| 2 | A date written from the wrong zone | `gh` reports UTC; the index carried local dates | dates converted to America/Sao_Paulo before writing (the first pass used `date -u` and the reviewer caught six) |

**Steps with no backout:** none

## Z. Prove and ship

- [x] **Tester briefing:** tester-briefing.md written.
- [x] **Tester run:** class `tooling`: the lead ticks `test-plan.md` with the gate output; the reviewer refutes.
- [x] **Reviewer:** `Ship-ready? YES`, `Merge sensitivity: LOW`; seven findings fixed, two minors (the table-break pin, `statusViolations`) and the unit job's full-history checkout applied.
- [x] **/check-ui:** not applicable, no UI.
- [x] **/open-pr:** gates passed, learnings sweep stated, PR opened.
