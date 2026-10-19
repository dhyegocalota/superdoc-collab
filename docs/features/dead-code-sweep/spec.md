# Dead code sweep

**Status:** Building
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner's request, translated: "as the final step of everything: review and delete unused code")
**Not changing:** behaviour; public API routes; anything a test or an E2E still exercises on purpose

## Problem

Seventeen features landed on one branch today, several of them moving or replacing code. Exports, files, copy constants, dependencies, CSS tokens and test helpers that nothing uses any more are still in the tree.

## Change

- Run an unused-export and unused-file analysis across the workspace (`knip` through `pnpm dlx knip` with a committed `knip.json` only if it needs configuration; otherwise `tsc --noUnusedLocals --noUnusedParameters` on each package plus `rg` for every exported symbol) and delete what is unused: exports, whole files, copy constants, `libs/types` constants, CSS custom properties and Tailwind extensions no class or test references, unused dependencies in each `package.json` (then `pnpm install` to update the lockfile), test helpers and fixtures with no caller, E2E helpers with no caller.
- A second pruning pass of tests in the areas the first pass skipped for ownership (listed in `docs/features/test-pruning/report.md`), with the same five categories and the same report format appended to that report.
- Every deletion is one line in `docs/features/dead-code-sweep/report.md`: `path::symbol | why it is dead (no importer / no caller / superseded by X)`. Anything kept on purpose though unused (a public API, a planned seam) is listed under "kept" with the reason.
- `pnpm typecheck`, every unit package and `pnpm test:e2e` (one run, all specs) stay green; `pnpm verify --plan` shows class product.

## Test list

- The report's counts match the diff (`git diff --stat`).
- Unit suites per package and the E2E suite green after the sweep.
