# Shrinking the snapshot interval barely moves open-room latency
- Date: 2026-10-16
- Inspired by: docs/adr/0003-time-travel-with-native-yjs-snapshots.md; the proof of concept's results
- Revisited: 2026-10-16 — still true
- Revisited: 2026-10-21 — anchors moved off the proof of concept, removed on 2026-10-17, to the code that carries the fix today

## Signal
Dropping the heavy snapshot interval from 1000 to 100 updates cuts open-room p50 only from 83 ms to 53 ms while storage grows from 21 MB to 222 MB. The worst case stays near 110 ms.

## Cause
The load cost is CPU decoding of the Yjs state, not database access: about 13 ms for the SQLite read against about 98 ms for the Yjs decode. Storage tuning cannot remove decode time, and each heavy snapshot also blocks the event loop for 140 to 185 ms.

## Do
Measure read against decode before touching storage. Keep heavy snapshots rare (every 1000 updates, latest only) and generate them off the event loop in a worker. Serve timeline reads from a SQLite read model so the Yjs document is decoded only to open a cold room or serve a time-travel version.

## Anchor
- `docs/adr/0003-time-travel-with-native-yjs-snapshots.md` — benchmark table and decision
- `docs/adr/0007-read-model-in-sqlite.md` — context
- `libs/history/src/update-log.ts` — `compact`, `materialize`
