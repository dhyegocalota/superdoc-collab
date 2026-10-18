# An E2E that waits for the Lost banner after a server stop times out or fails intermittently

- Date: 2026-10-17
- Inspired by: the tester's restart walk for `docs/features/connection-state/` (`lost (3 ms)` on one of three runs); the restart spec failed at `4f02874` with `Expected: "lost"`, `Received: "reconnecting"`
- Revisited: 2026-10-17 — still true; the spec and ADR 0032 now call Lost optional

## Signal
Stopping the server under an open editor shows the Reconnecting banner at once. The Lost banner is visible for a few milliseconds on some runs and never on others, so an assertion that waits for it fails or passes by chance.

## Cause
The provider reports `lost` and `reconnecting` in the same tick, so React renders Reconnecting before Lost can paint. Lost stays in the state machine and its unit tests, but nothing in a browser can observe it reliably.

## Do
Assert Reconnecting, then Recovered, then no banner. Allow Lost before them and forbid it only after Recovered. Test the Lost state in the unit tests of the merge table, never in an E2E or a walk.

## Anchor
`e2e/connection-state.spec.ts` (restart proof), `apps/web/src/features/editor/use-connection-state.test.ts`, commits `671aa86`, `4a6a80d`, `c3d63a7`, ADR 0032
