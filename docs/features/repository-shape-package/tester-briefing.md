# Tester briefing: Repository-shape tests in their own package

Tooling change: no browser walk, no tester. The reviewer and `pnpm verify` prove it.

- `tools/repository-shape` is a workspace package; the twelve files moved with `git mv` from `apps/server/src/repository-shape`.
- `REPOSITORY_ROOT` is three levels up from `src`; `workspacePackages` also reads `tools`, so the new README is checked like the others (5 extra tests, 129 in total).
- Run: `pnpm --filter @superdoc-collab/repository-shape test:unit`, `bash scripts/verify.test.sh`, `pnpm typecheck`.
- Known gap: the hosted unit matrix in `.github/workflows/verify.yml` lists libs, web and server only, so the shape tests do not run on hosted CI. Hosted runs are off (ADR 0030); the matrix and its pin in `ci-workflow.test.ts` need an entry when they return.
