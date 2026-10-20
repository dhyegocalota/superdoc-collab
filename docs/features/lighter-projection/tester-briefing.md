# Tester briefing: Lighter projection

## What changed

- `libs/history/src/version-state.ts`: `versionAt` replaces `GcFreeReplays`; it is `materialize` at the sequence.
- `libs/history/src/projection.ts`, `edit-events.ts`: one document per projection run; `projectEditEvents` advances the document it is given.
- `apps/server/src/history/projection-handler.ts`, `projection-worker.ts`: no replay store.

## Red today, green after

| Test | Red failure | Commit |
|------|-------------|--------|
| `version-state.test.ts` (seven tests) | `Error: versionAt is not implemented` | cbb2f7e8 |
| `projection.test.ts::materializes the document once however many batches the run takes` | `expected "latestSnapshot" to be called 1 times, but got 8 times` | 1b459f97 |

## Hypotheses for the tester

- A version equals a full replay at every logged sequence, including after a delete in the tail.
- A projection resumed from a cursor, with and without a stored preview, commits the same events and previews as before.
- Time travel on a heavy document answers each step in about a second.

## Gaps

- The heavy-log numbers come from a standalone process, not the capped server stack.
- A projection run with more than one batch was measured only through unit tests, not on the heavy log (24 updates).
