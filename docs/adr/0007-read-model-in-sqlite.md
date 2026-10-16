# 0007. Serve reads from a SQLite read model

- Status: Proposed (to confirm at spec review)
- Date: 2026-10-16
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [0001](0001-event-sourcing-over-yjs.md), [0003](0003-time-travel-with-native-yjs-snapshots.md)

## Context

The benchmark in [0003](0003-time-travel-with-native-yjs-snapshots.md) shows CPU decoding of the Yjs document dominates (98 ms of a roughly 100 ms load; the SQLite read takes 13 ms). Serving the timeline, filters and summaries by decoding Yjs per request would pay that cost every time.

## Decision

CQRS-style read model in SQLite, fed by a worker from the update log:

- `edit_events`
- `activity_buckets` (author x minute x topic)
- `block_versions`

The timeline, filters, summaries and "text of block at time T" are plain indexed SELECTs. The Yjs document is decoded only to open a cold room or to serve a time-travel version.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Project from the log on every request | No second store | Pays CPU decode each time | Decode is the bottleneck |
| Cache projections in memory only | Simple | Lost on restart; unbounded growth | Needs rebuild on cold start |

## Consequences

- A worker must keep the read model in step with the log; the read model is rebuildable from the log.
- Reads are eventually consistent with the log by the worker's lag.
- One more SQLite file ([0004](0004-stack.md)).

## Evidence

- Decode vs read breakdown in 0003; projection costs 0.13-0.17 ms per update ([POC results](../../poc/RESULTS.md)).

## Revisit when

- Spec review rejects the added component.
- Worker lag becomes visible in the UI.
