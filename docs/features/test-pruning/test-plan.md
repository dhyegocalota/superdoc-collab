# Test plan: Test pruning

Test-only change: the touched files, the package counts, the mutation checks and `pnpm typecheck` are the proof (HARNESS §5). No browser walk.

- [x] `vitest run` in `libs/types` — expected: 64 passed in 9 files (evidence: 64 passed)
- [x] `vitest run` in `apps/server` — expected: 1004 passed, 2 skipped (evidence: 1004 passed, 2 skipped)
- [x] `vitest run` in `apps/web` — expected: 993 passed in 121 files (evidence: 993 passed, 121 files)
- [x] Mutation 1 to 6 in report.md — expected: the named survivor goes red each time (evidence: six of six red)
- [x] `pnpm typecheck` — expected: clean (evidence: libs, apps and e2e finished without output)
- [x] `git status` after the mutations — expected: no product file modified (evidence: only test files and docs changed)
