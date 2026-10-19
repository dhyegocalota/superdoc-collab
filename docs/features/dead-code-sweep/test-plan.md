# Test plan: Dead code sweep

Behaviour-preserving refactor: the unit suites, `pnpm typecheck`, one full E2E run and the mutation checks are the proof (HARNESS §5). No browser walk.

- [x] `vitest run` in `libs/types` — expected: 64 passed in 9 files (evidence: report.md Counts)
- [x] `vitest run` in `libs/history` — expected: 362 passed in 23 files (evidence: report.md Counts)
- [x] `vitest run` in `apps/server` — expected: 898 passed, 2 skipped (evidence: report.md Counts)
- [x] `vitest run` in `apps/web` — expected: 1069 passed in 132 files (evidence: report.md Counts)
- [x] `vitest run` in `tools/repository-shape` — expected: 129 passed in 11 files (evidence: report.md Counts)
- [x] `pnpm typecheck` — expected: clean for libs, apps, tools and e2e (evidence: no output)
- [x] `tsc --noEmit --noUnusedLocals --noUnusedParameters` per package and `e2e` — expected: no output (evidence: last run before the E2E)
- [x] Mutation 1 to 10 in test-pruning/report.md Second pass — expected: the named survivor goes red each time (evidence: nine of ten red; mutation 9 stayed green and its test was restored)
- [ ] `pnpm test:e2e`, one run, port 3100 free — expected: every spec green (evidence: 125 passed, 2 skipped, 3 failed. Open: the two summary-mobile specs fail on the View version label of the version-view-after-delete lane, not on a deletion here; exit-confirmation timed out under load and passed alone. See report.md Proof)
- [x] `pnpm verify --plan` — expected: class product (evidence: class: product)
- [x] `git status` after the mutations — expected: no product file modified (evidence: clean tree before every commit)
