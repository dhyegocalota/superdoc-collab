# Tester briefing: Only online members in the top bar

## What changed

- `apps/web/src/features/editor/members.tsx`: the row keeps members who are online or the current user, has no offline reason, and is a group named by the online count.
- `apps/web/src/features/editor/editor-copy.ts`: new `onlineMembersLabel`.
- `apps/web/src/features/editor/members.test.tsx`: offline cases removed, three new tests.
- `e2e/collaboration.spec.ts`: Bruno's avatar appears in Ana's row and goes when his tab closes.

## How to run

```bash
pnpm --filter @superdoc-collab/web exec vitest run src/features/editor/members.test.tsx
pnpm test:e2e e2e/collaboration.spec.ts
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `members.test.tsx::offline members are not in the row and online ones are` | Clara rendered | filtered out |
| `members.test.tsx::the overflow count ignores offline members` | offline members made a +N menu | count is online only |
| `members.test.tsx::the row is a group whose label names the online count` | `onlineMembersLabel` threw | label is `N online` |

## Hypotheses to attack

1. Hypothesis: Bruno's avatar leaves Ana's row within the members poll after his tab closes. Break it by: closing Bruno's tab with and without a caret in the document.
2. Hypothesis: the current user always shows. Break it by: loading the page before the members answer arrives.
3. Hypothesis: the share dialog's People with access list still shows offline members. Break it by: opening it with Bruno away.

## Known gaps

- `editor-header.test.tsx` ('members announce their presence…') and `e2e/final-visuals.spec.ts` (offline Bruno button after his tab closes, and the sign-out test) still expect an offline avatar in the row. They are outside this lane's paths.
- `offlineMemberReason` and the offline branch of `memberLabel` remain because those two files import them.
- The new group label lives in `editor-copy.ts`, not `members-copy.ts`, to stay in the lane's paths.

## Tester run 2026-10-19

- Walked as Ana and Bruno. Hypotheses 1 (navigate away with a caret and close the page), 2 (own avatar present from the first snapshot), 3 (share dialog still lists Bruno) held. Unit box left to the lead.
- Defects: none. Console errors: none.
