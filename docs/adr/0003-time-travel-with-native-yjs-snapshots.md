# 0003. Implement time travel with native Yjs snapshots

- Status: Proposed (pending a spike)
- Date: 2026-10-16
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [POC results](../../poc/RESULTS.md), [0001](0001-event-sourcing-over-yjs.md), benchmark on the T11 history

## Context

The owner chose time travel (open the document as it was at an instant, read-only) over a diff overlaid on the current document. Reconstructing a version means materializing the Yjs document at a sequence.

Benchmark on the real T11 history (9,628 updates, 4.6 MB log):

| Heavy snapshot interval (updates) | 1000 | 500 | 250 | 100 |
|-----------------------------------|------|-----|-----|-----|
| Snapshots | 9 | 19 | 38 | 96 |
| Storage | 21 MB | 45 MB | 88 MB | 222 MB |
| Open-room p50 | 83 ms | 62 ms | 55 ms | 53 ms |
| Open-room worst | 117 ms | 109 ms | 114 ms | 108 ms |

Each heavy snapshot blocks the event loop for about 140-185 ms. The roughly 100 ms load splits into SQLite read 13 ms, Yjs decode 98 ms, text extraction 0.6 ms: the bottleneck is CPU decoding, not the database.

## Decision

- Heavy snapshots every 1000 updates, keeping only the latest per document; a cleanup job deletes older ones, which are regenerable from the log.
- Generate heavy snapshots in a worker thread, triggered by bytes rather than count.
- Hold one `gc: false` `Y.Doc` in memory per active document.
- Store a lightweight native Yjs snapshot (state vector + delete set, a few KB) per window.
- Reconstruct any version with `Y.createDocFromSnapshot`, behind an LRU cache of versions; cold versions are regenerated in workers.
- The viewer is a second read-only SuperDoc joining an ephemeral room served with that version's state.

Spike required before accepting: `Y.createDocFromSnapshot` over SuperDoc's `Y.Doc` structure, and the read-only join room.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Diff overlay on the current document only | Lighter | Loses how the document looked | Owner chose time travel |
| DuckDB or another store | Different query profile | Bottleneck is CPU decode, not storage | Does not address the cost |
| Denser heavy snapshots (100-250) | Slightly faster open (53-55 ms p50) | 88-222 MB storage; more event-loop stalls | Marginal gain, large cost |

## Consequences

- Storage per document stays bounded: one heavy snapshot plus KB-sized lightweight ones.
- Memory grows with active documents (one `gc: false` doc each).
- Cold versions cost a worker-side reconstruction.

## Evidence

- Benchmark table above on the T11 history; 100 ms load breakdown above.
- POC proves snapshot + tail replay equals full replay at every sequence ([RESULTS.md](../../poc/RESULTS.md)); the native-snapshot path itself is not yet proven.

## Revisit when

- The spike fails.
- Documents exceed what one in-memory doc per room allows.
