# Plan: Dead code sweep

**Spec:** spec.md
**Tier:** 🟡
**Seam:** unused exports, files, copy, Tailwind colours, dependencies and helpers across `libs`, `apps`, `e2e`; the tests of the areas the first pruning pass skipped

## Steps

- [x] **Step 1:** record the unit counts of every package before any change. — evidence: report.md Counts
- [x] **Step 2:** run knip (default and `--production`) and `tsc --noUnusedLocals --noUnusedParameters` per package and for `e2e`; verify each lead with `rg`. — evidence: report.md, every deleted line
- [x] **Step 3:** remove the dependencies nothing imports and update the lockfile. — evidence: b483cb7c
- [x] **Step 4:** `apps/server`: stop exporting what no other file imports. — evidence: 073c8834
- [x] **Step 5:** `apps/web`: delete the unused UI primitives, copy, query key and Tailwind colours. — evidence: 554668eb
- [x] **Step 6:** `e2e`: stop exporting helpers no spec imports. — evidence: f52bb845
- [x] **Step 7:** second test-pruning pass over the skipped areas, with mutation checks. — evidence: bb9447f5, e2298003, 4bd6ae81, test-pruning/report.md Second pass
- [x] **Step 8:** `pnpm typecheck`, every unit package and the whole E2E suite once. — evidence: report.md Proof (the E2E run has two failures owned by another lane)

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 3 | A dependency is loaded by name at run time | the server or the Docker image fails to start; `pnpm typecheck` stays green | revert b483cb7c and `pnpm install` |
| 4, 6 | A string or dynamic import reaches the symbol | typecheck or the spec fails to resolve it | restore the `export` |
| 5 | A class or custom property is built from a template string | a missing colour in the E2E dark theme spec or a unit test | restore the line in `globals.css` |
| 7 | A deleted test was the only guard of a behaviour | a mutation check stays green | restore the test; done once for Santiago |

**Steps with no backout:** none.
