# Tester briefing: Feature status gate

Class `tooling`: no tester; the reviewer refutes the lead's ticks.

## What changed

- `apps/server/src/repository-shape/feature-status.test.ts` — the three checks of the spec.
- 40 `docs/features/**/spec.md` status lines and `docs/features/README.md` — set from the merge history.
- `.claude/HARNESS.md`, `.agents/skills/open-pr/SKILL.md`, `.agents/skills/feature/SKILL.md`, `docs/learnings/` — the process that keeps them equal.

## How to run

```bash
pnpm --filter @superdoc-collab/server exec vitest run src/repository-shape/feature-status
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `feature-status.test.ts` (3 tests) | 35 merged features unshipped, 48 row disagreements, 4 statuses outside the vocabulary | every line and row rewritten from `gh pr list --state merged` |

## Hypotheses to attack

1. Hypothesis: every `Shipped` date is the local date of the merge. Break it by: comparing a row with `gh pr view <n> --json mergedAt`.
2. Hypothesis: no open lane trips the third test. Break it by: running the test in a lane worktree.

## Known gaps

- Direct pushes to `main` (no PR) leave no merge subject; their specs are checked by the first two tests only.
