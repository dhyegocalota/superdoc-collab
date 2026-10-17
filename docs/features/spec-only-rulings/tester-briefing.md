# Tester briefing: Spec-only rulings

Written by the developer after the fix. Nobody on the build side ran `test-plan.md`.

## What changed

- `libs/history/src/timeline/bins.ts` — `EDGE_BINS = 1`, `COVERING_EXTRA_BINS = 3`; `chooseBinMs` budgets three extra bins; the week fallback divides by `MAX_BINS - COVERING_EXTRA_BINS`.
- `libs/history/src/timeline/bins.test.ts` — the budget test now counts `binStartsCovering` output at three offsets, with 119 minutes added to the spans.
- `docs/adr/0014`, `0015`, `0016` — new; `0011` status line refined; `docs/adr/README.md` index.
- `AGENTS.md`, `.claude/HARNESS.md`, `.claude/hooks/warn-conventions.sh`, `.agents/roles/developer.md` — the `// NB ADR NNNN:` exception.
- Eight `NB ADR` lines in `libs/types/src/timeline.ts`, `libs/history/src/timeline/bins.ts`, `topics/topic-assignment.ts`, `edit-events.ts`, `version-marks.ts`, `apps/server/src/insights/topics-service.ts`, `insights-worker.ts`, `documents/share-links.ts`.

## How to run

`pnpm install` once, then the commands in `test-plan.md`. The red-first evidence is the first commit on `fix/spec-only-rulings`; `git stash` is not needed: check out that commit and run the history unit tests.
