# Plan: Version view after a delete

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `apps/server/src/history/versions-service.ts`, `libs/history/src/version-state.ts`, `apps/web/src/features/versions/`

## Steps

- [ ] **Step 1:** reproduce with a throwaway E2E (`e2e/_version-after-delete.spec.ts`), instrument the boundaries, write the cause in `spec.md` with the evidence.
- [ ] **Step 2 (red):** unit test at the failing layer plus the E2E `the version of an edit shows the paragraph after it was deleted later`; commit red alone with the failure text.
- [ ] **Step 3 (green):** the fix at the cause.
- [ ] **Step 4:** learning if diagnosis took more than fifteen minutes; rules fact if a system fact changed; tester briefing.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 3 | A version fix changes how pruned versions resolve | `pruned-version-resolves-to-its-minute` tests fail | keep the minute rule and resolve the sequence inside the minute |
