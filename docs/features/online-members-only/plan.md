# Plan: Only online members in the top bar

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `apps/web/src/features/editor/members.tsx`

## Steps

- [x] **Step 1:** red tests in `members.test.tsx`: offline hidden, overflow ignores offline, row group named by the online count. — evidence: 3f910f0b
- [x] **Step 2:** `Members` keeps members that are online or the current user, drops the offline reason, labels the row with `onlineMembersLabel`. — evidence: c0220c95
- [x] **Step 3:** E2E: Bruno's avatar appears in Ana's row and is gone after his tab closes. — evidence: test 'a member shows in the top bar while in the document and leaves it when the tab closes' (see test-plan.md for the run)
- [ ] **Step 4:** `editor-header.test.tsx` and `e2e/final-visuals.spec.ts` still assert an offline avatar in the row; outside this lane's paths, left for the lead. `offlineMemberReason` and the offline branch of `memberLabel` stay because both files import them.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | The current user vanishes from the row before the members answer marks them online | `members.test.tsx` current-user cases | keep the `online or current user` filter |

**Steps with no backout:** none.
