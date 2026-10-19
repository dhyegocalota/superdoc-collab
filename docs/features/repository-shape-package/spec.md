# Repository-shape tests in their own package

**Status:** Approved
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (owner: "essa pasta de teste apps/server/src/repository-shape parece no lugar errado")
**ADRs:** [0030](../../adr/0030-the-local-gate-runs-what-the-diff-can-break.md) (the shape gate stays the fourth gate of `pnpm verify`)
**Not changing:** what the tests pin; the gate order; the server package's own tests

## Problem

`apps/server/src/repository-shape/` holds tests about the repository (README blocks, compose files, workflows, feature statuses, scenarios, agent surfaces), not about the server. They ship in the server's source tree and run under its vitest config only because that was convenient.

## Change

- New workspace package `tools/repository-shape` (`@superdoc-collab/repository-shape`): `package.json` with `test:unit` (`vitest run`) and `typecheck` (`tsc --noEmit`), a `tsconfig.json` extending the root base like `apps/server`, a `vitest.config.ts`, a `README.md` stating purpose only, and `src/` with the twelve moved files (`git mv`, history preserved). `repository-files.ts` resolves `REPOSITORY_ROOT` from the new location.
- `pnpm-workspace.yaml` adds `tools/*`, so `pnpm -r test:unit` and `pnpm -r typecheck` pick it up without a change to the root scripts or the CI workflows.
- `scripts/verify.sh` `gate_shape` filters the new package; `scripts/verify-gates.tsv` replaces the `apps/server/src/repository-shape/*` row with `tools/repository-shape/*  product  typecheck` and adds `tools/*/package.json  product  all`; `scripts/verify.test.sh` follows if it pins the filter.
- The root-entry list in `delivery-docs.test.ts` gains `tools`. `AGENTS.md` layout block and the README-run-block sentence, `.claude/HARNESS.md`, `docs/architecture.md` tests table, `docs/features/deploy/spec.md` first line and any other prose naming the old path are updated (ADRs and learnings keep history).
- Prettier and the heavy-command lock need nothing.

## Test list

- `pnpm --filter @superdoc-collab/repository-shape test:unit` passes with the same count as before the move; `pnpm --filter @superdoc-collab/server test:unit` no longer runs them.
- `bash scripts/verify.test.sh` passes; `pnpm verify --plan` on a docs-only diff still lists the shape gate.
- `pnpm typecheck` clean.
