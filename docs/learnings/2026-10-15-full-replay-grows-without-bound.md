# Replay takes about 900 ms at 10k updates and the performance budget fails once per full run
- Date: 2026-10-15
- Inspired by: poc/RESULTS.md (Performance); poc/tests/t11-performance.spec.ts::T11
- Revisited: 2026-10-16 — still true
- Revisited: 2026-10-18 — still true

## Signal
`fullReplayMs` in the T11 report climbs with the amount of history (about 900 ms at 9,619 updates) and the replay budget assertion fails on one scenario per full run, never on small documents.

## Cause
Replaying the whole update log applies every update in order, so cost is linear in total history. Nothing bounds it.

## Do
Write a compacted snapshot every 1000 updates and replay snapshot plus tail, which costs about 95 ms and is bounded by the tail. Keep a test proving snapshot plus tail yields the same state as a full replay at every sequence, and that compaction is idempotent.

## Anchor
- `poc/lib/update-log.ts` — `compact`, `materialize`, `replay`
- `poc/server/collaboration-server.ts` — `SNAPSHOT_EVERY_UPDATES`, `onStoreDocument`
- `poc/tests/node/snapshots.test.ts` — `snapshot + tail materializes exactly the same state as a full replay at every sequence`
- `poc/tests/t11-performance.spec.ts` — `SNAPSHOT_REPLAY_BUDGET_MS`
