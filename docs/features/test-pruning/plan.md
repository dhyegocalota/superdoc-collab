# Plan: Test pruning

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `*.test.ts`, `*.test.tsx` and `*.spec.ts` under `libs/types`, `apps/server`, `apps/web` and `e2e`

## Steps

- [x] **Step 1:** record the counts of each package before any deletion. — evidence: report.md Counts
- [x] **Step 2:** `libs/types`: delete the restated literals and the type-level tests. — evidence: 98ff51bd
- [x] **Step 3:** `apps/server`: delete the restated, echoed and duplicated tests. — evidence: 9ec286f7
- [x] **Step 4:** `apps/web`: delete the restated literals, markup pins, mock echoes and duplicates; make the contrast tests read `globals.css`. — evidence: bb5960ed
- [x] **Step 5:** `e2e`: review each spec in scope for a duplicate of another spec. — evidence: none found, no change
- [x] **Step 6:** mutation checks for every category 5 deletion. — evidence: report.md Mutation checks, six of six red
- [x] **Step 7:** `pnpm typecheck` once, then the report. — evidence: clean on libs, apps and e2e
- [ ] **Step 8 (second pass):** the paths another lane owned, listed in report.md Skipped for ownership.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 to 4 | a deleted test was the only guard of a relation | the report names what still covers each deletion; the mutation checks prove the category 5 ones | `git revert` of the package commit |
| 4 | an import left unused after a deletion | `tsc --noUnusedLocals` on the touched files | remove the import |

**Steps with no backout:** none.
