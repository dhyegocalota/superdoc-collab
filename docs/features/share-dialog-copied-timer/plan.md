# Plan: Share dialog copied timer

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `apps/web/src/features/editor/share-dialog.test.tsx`

## Steps

- [x] **Step 1:** reproduce deterministically: real lag after the second copy fails the original (2.5 s lag: 5 of 5 red).
- [x] **Step 2:** rewrite the test on a clock that only the test moves (test 'copying again keeps Link copied for a full period from the second copy').
- [ ] **Step 3:** ten runs of the file (10 of 10 green), the web unit suite (431 passed), `pnpm verify` by the lead.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | A faked `setTimeout` hangs `userEvent` or `findBy` (Testing Library drains with `setTimeout(0)` unless it sees Jest) | the test times out at 5 s | keep user events and `findBy` on real timers; fake only after the dialog is ready |

**Steps with no backout:** none.
