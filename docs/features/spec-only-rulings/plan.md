# Spec-only rulings Implementation Plan

> **For agentic workers:** executed natively in one session (one arithmetic fix, three ADRs, one convention), test committed red first.

**Goal:** close the two defects and the four documentation gaps found by the comment audit of 2026-10-17.

**Architecture:** no new modules. `bins.ts` gains `EDGE_BINS` and `COVERING_EXTRA_BINS`; the hook gains one exclusion; the conventions gain one exception.

**Spec:** `docs/features/spec-only-rulings/spec.md`

## File map

| Group | Paths owned |
|-------|-------------|
| G1 | `libs/history/src/timeline/bins.ts`, `bins.test.ts` |
| G2 | `docs/adr/0015-*.md`, `0016-*.md`, `0017-*.md`, `0011-*.md` (status line), `docs/adr/README.md` |
| G3 | `AGENTS.md`, `.claude/HARNESS.md`, `.claude/hooks/warn-conventions.sh`, `.agents/roles/developer.md`, the eight `NB ADR` lines |

## Steps

- [x] **Step 1:** red test: `bins.test.ts::a span of %i ms never draws more than MAX_BINS bins` fails with `expected 122 to be less than or equal to 120` for 119 minutes.
- [x] **Step 2:** `chooseBinMs` budgets `COVERING_EXTRA_BINS`; `binStartsCovering` pads `EDGE_BINS`; the week fallback divides by `MAX_BINS - COVERING_EXTRA_BINS`.
- [x] **Step 3:** ADRs 0015, 0016, 0017 from the template; index rows; ADR 0011 status line refined by 0015.
- [x] **Step 4:** conventions, invariant 9, hook exclusion, developer role; `NB ADR` lines at `MAX_BINS`, `TOPIC_RECOMPUTE_NEW_BLOCKS`, `SELECTION_SUMMARY_COOLDOWN_MS`, `keepsReadyTopics`, `matchPreviousTopics`, `ShareLinksRepository.links`, `LLM_MAX_CONCURRENT_JOBS`, `resolveAuthorIds`, `endsItsMinute`.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | a ladder expectation in `bins.test.ts` shifts to a coarser step | `chooses the finest bin that fits` fails on a listed pair | restore the `+ 1` and rethink the padding |
| 4 | the hook warns on every `NB` line, or stops warning on plain comments | running the hook on a two-line file prints zero or two warnings instead of one | revert the `grep -v` exclusion |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** `tester-briefing.md` written.
- [x] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md`: 12 of 12 boxes green, five observations folded in.
- [x] **Reviewer:** a fresh `reviewer` sub-agent returned "fix first" with ten findings; all addressed (one in code: `resolve` refuses tokens from another secret).
- [ ] **/open-pr:** typecheck and unit tests green, PR opened.
