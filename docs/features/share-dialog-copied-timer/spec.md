# Share dialog copied timer

**Status:** Shipped 2026-10-17
**Tier:** 🟢
**Owner approval:** approved 2026-10-17
**Not changing:** `share-dialog.tsx`, the notice period, any other test

## Problem

`share-dialog.test.tsx` "copying again keeps Link copied for a full period from the second copy" failed once in a full local gate under heavy load with `Unable to find an element with the text: Link copied`, and passes alone. `vi.useFakeTimers({ shouldAdvanceTime: true })` also moves the fake clock with real elapsed time, so 1.5 s of real lag between the second copy and the assertion expires the notice.

## Change

- The test opens the dialog on real timers, then fakes only `setTimeout` and `clearTimeout` and copies with `fireEvent.click` inside `act`. The clock moves only when the test advances it.
- Learning: [shouldAdvanceTime lets real lag move the fake clock](../../learnings/2026-10-17-should-advance-time-lets-real-lag-move-the-fake-clock.md).

## Test list

- The test itself: second copy restarts the full period; gone a full period after the second copy.
- Lag proof: 2.5 s of real lag after the second copy fails the original every time and never fails the fix.
- Ten runs in a row of the file, then the whole web unit suite.
