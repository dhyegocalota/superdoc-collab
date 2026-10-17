# `shouldAdvanceTime` lets real lag move the fake clock, so a timer test passes alone and fails under load

- Date: 2026-10-17
- Inspired by: a full local gate where `share-dialog.test.tsx` "copying again keeps Link copied for a full period from the second copy" failed once with `Unable to find an element with the text: Link copied` and passed alone
- Revisited: 2026-10-17

## Signal
A component test that advances a fake clock by hand passes alone and fails once in a full run on a loaded machine, asserting an element that a timer should still be keeping.

## Cause
`vi.useFakeTimers({ shouldAdvanceTime: true })` installs a real interval that adds 20 ms to the fake clock per tick. Any real pause between two manual advances (a slow `await`, a busy worker) moves the clock too, so 1.5 s of lag expires a 3 s timer the test believed it controlled. Testing Library is why the option is tempting: it drains with `setTimeout(0)` unless it sees Jest fake timers, so `userEvent` and `findBy` hang on a faked `setTimeout`.

## Do
Open and load on real timers, then `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` right before the timed part, drive it with `await act(async () => fireEvent.click(…))` (no `userEvent`, no `findBy` while faked) and move the clock only with `act(() => vi.advanceTimersByTime(…))`. Prove a timer test with injected real lag: a captured real `setTimeout` of 2.5 s must fail the old shape every time and never the new one (1.6 s is borderline, the interval ticks at about 21 ms of real time per 20 ms of fake).

## Anchor
`apps/web/src/features/editor/share-dialog.test.tsx` ("copying again keeps Link copied for a full period from the second copy"), `docs/features/share-dialog-copied-timer/`
