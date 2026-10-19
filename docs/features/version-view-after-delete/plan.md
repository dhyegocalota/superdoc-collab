# Plan: Version view after a delete

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `apps/server/src/history/versions-service.ts`, `libs/history/src/version-state.ts`, `apps/web/src/features/versions/`

## Steps

- [x] **Step 1:** reproduce with a throwaway E2E (`e2e/_version-after-delete.spec.ts`), instrument the boundaries, write the cause in `spec.md` with the evidence. Evidence: spec.md → Root cause, commit d3520ead.
- [x] **Step 2 (red):** unit test at the failing layer plus the E2E `the version of an edit shows the paragraph after it was deleted later`; commit red alone with the failure text. Evidence: d3520ead, `version-state.test.ts::the version of a bin that ends before a later delete in the same minute shows the edit`. The E2E in that commit waited for any bin start and put all edits in one bin; the green commit repairs it and a mutation run (mark window back to a minute) confirmed it red.
- [x] **Step 3 (green):** the fix at the cause. Evidence: the green commit; `VERSION_MARK_MS` is the narrowest bin.
- [x] **Step 4:** learning if diagnosis took more than fifteen minutes; rules fact if a system fact changed; tester briefing. Evidence: docs/learnings/2026-10-19-a-version-mark-per-minute-lets-a-later-delete-blank-an-earlier-bin.md, .claude/rules/history.md, tester-briefing.md.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 3 | A version fix changes how pruned versions resolve | `pruned-version-resolves-to-its-minute` tests fail | keep the minute rule and resolve the sequence inside the minute |
