# Replay takes about 900 ms at 10k updates and the performance budget fails once per full run
- Date: 2026-10-15
- Inspired by: the proof of concept's results (Performance) and its T11 performance test
- Revisited: 2026-10-16 — still true
- Revisited: 2026-10-18 — still true
- Revisited: 2026-10-21 — anchors moved off the proof of concept, removed on 2026-10-17, to the code that carries the fix today

## Signal
`fullReplayMs` in the T11 report climbs with the amount of history (about 900 ms at 9,619 updates) and the replay budget assertion fails on one scenario per full run, never on small documents.

## Cause
Replaying the whole update log applies every update in order, so cost is linear in total history. Nothing bounds it.

## Do
Write a compacted snapshot every 1000 updates and replay snapshot plus tail, which costs about 95 ms and is bounded by the tail. Keep a test proving snapshot plus tail yields the same state as a full replay at every sequence, and that compaction is idempotent.

## Anchor
- `libs/history/src/update-log.ts` — `compact`, `materialize`, `replay`
- `apps/server/src/history/projection-handler.ts` — `compact` with `SNAPSHOT_EVERY_UPDATES`
- `libs/history/src/snapshots.test.ts` — `snapshot + tail materializes exactly the same state as a full replay at every sequence`
