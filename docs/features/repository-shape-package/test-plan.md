# Test plan: Repository-shape tests in their own package

Tooling change: the lead ticks it with the gate output (HARNESS §5).

- [x] `pnpm --filter @superdoc-collab/repository-shape test:unit` — expected: all twelve files' tests pass, same as before plus the new README's checks — evidence: before 11 files, 124 tests in the server; after 11 files, 129 tests (the 5 extra are the per-README checks of the new package's README)
- [x] `vitest list --filesOnly` in `apps/server` — expected: no `repository-shape` file — evidence: 0 matches
- [x] `bash scripts/verify.test.sh` — expected: no FAIL — evidence: 0 failures, including the new `tools/repository-shape/package.json` row (all gates)
- [x] `pnpm typecheck` — expected: clean — evidence: the new package typechecked, exit 0
- [x] `pnpm verify --plan` on the branch diff — expected: the shape tests are run — evidence: `packages` lists `@superdoc-collab/repository-shape`, so the unit gate runs them and the shape gate is folded into it; a `tools/repository-shape/src/x.test.ts` diff plans `doctor format secrets typecheck audit shape` (pinned in `verify.test.sh`)
