# Lighter projection: the worker builds a version and a projection run from one document at a time

**Status:** Building
**Tier:** 🔴
**Owner approval:** approved 2026-10-20 ("não dá pra diminuir o consumo de memória no servidor?")
**ADRs:** [0043](../../adr/0043-a-known-version-sequence-resolves-exactly-and-marks-anchor-the-timeline.md), [0044](../../adr/0044-version-builds-are-budgeted-per-user-and-capped-in-the-projection-queue.md), [0047](../../adr/0047-the-server-never-materializes-an-update-it-only-logs-and-heap-follows-the-container.md)
**Not changing:** the update log, the projection's output, the version payload the client receives, the recycle rules of [memory-returns](../memory-returns/spec.md).

## Problem

On the heavy document (9.5 MB, 56,800 paragraphs) the projection worker needs about 1.5 GB of heap and keeps 627 MB after a version step. Two causes, both measured on the log of a real heavy open:

- `GcFreeReplays.versionAt` kept a gc-free `Y.Doc` of the whole log between requests (627 MB) and built every version as a second copy of it with `Y.createDocFromSnapshot`.
- A bootstrap projection materialized the document three times in a row (bootstrap mark, preview, baseline), encoded the baseline and applied it to a fourth document inside `projectEditEvents`.

## Goals

| Goal | Rule |
|------|------|
| A version keeps nothing | `versionAt` is the log merged up to the sequence, applied to one document the reply encodes and drops. No cache, no snapshot copy, nothing to forget. |
| One document per projection run | `projectPending` materializes the document once, at the bootstrap or at the cursor, and every batch applies its updates to that same document. The preview and the bootstrap mark come from it. |
| No slower | A version step and the bootstrap projection are measured before and after. |

## Non-goals

- Dropping the projection document between batches. A run holds one document either way, so the peak is the same, and re-materializing costs about 1.2 s per batch on the heavy log.
- Changing the worker recycle, which stays the safety net.

## Design

- `versionAt` in `libs/history/src/version-state.ts` calls `materialize` (latest snapshot at or before the sequence, plus the merged tail). `GcFreeReplays`, `REPLAY_CACHE_SIZE` and the handler's `forget` of replays are gone. The gc-free replay existed so a Yjs snapshot of the projection document could be restored; a version built from the log up to its sequence needs no snapshot, and equals a full replay at every sequence (`version-state.test.ts`).
- `projectEditEvents` takes the document to advance instead of an encoded baseline. `projectPending` passes the one document through `continueProjection`; a run that finds nothing pending still materializes nothing.

## Measured (the log of a real heavy open, 24 updates, a 36.6 MB snapshot; standalone process, Node 24)

| | Before | After |
|--|--------|-------|
| Smallest heap cap that completes bootstrap projection plus three version steps | between 1.4 and 1.6 GB | between 0.7 and 0.8 GB |
| Heap retained by the worker after a version step, after a full collection | 627 MB | 15 MB |
| Bootstrap projection | 7.7 s | 4.1 s |
| Version step (cold, warm, warm) | 3.9 s, 2.8 s, 2.2 s | 1.1 s, 1.1 s, 1.1 s |

### Where the first version step goes (heavy document, real stack, machine loaded)

Walk of two cold steps through `?at=<sequence>` with timings logged in the worker, the scheduler and the browser socket (instrumentation removed afterwards):

| Stage | Cold step 1 | Cold step 2 |
|-------|-------------|-------------|
| Worker materialize from the snapshot plus tail | 1.8 s | 0.9 s |
| Worker state encode (36.6 MB) and main-text read | 0.4 s | 0.4 s |
| Scheduler round trip, worker to main | 2.3 s | 1.4 s |
| First socket frame after navigation | 1.6 s | 1.3 s |
| Last 36 MB socket frame after navigation | 3.7 s | 3.2 s |
| Viewer renders a text run | not within 200 s in the headless walk | not within 200 s |

The server side of a first step is 1.4 to 2.3 s and does not read from sequence 0: the snapshot is found and only the tail is merged. The transfer ends 3 to 4 s after the page opens. The 10 to 16 s the tester saw is therefore the viewer applying and laying out a 36 MB, 56,800-paragraph state in the browser, which the headless walk could not finish in 200 s. This is the transfer and render of the state, not the materialization, so no server fix follows. Not captured: the main thread's apply of the state into the version room (its log line never printed).

## Failure modes

| What | Signal | Back out |
|------|--------|----------|
| A version differs from a full replay | `version-state.test.ts` equality tests fail | revert the commit; `GcFreeReplays` returns |
| A resumed run drops events | `projection.test.ts` batch tests fail | revert the commit; nothing is persisted differently |

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Can the server use less memory? | Replay cache of one document; build a version without a cache | "não dá pra diminuir o consumo de memória no servidor?" Recommendation taken: no cache, measured faster | 2026-10-20 |

## Test strategy summary

Unit: `version-state.test.ts` (equality with a full replay, no read past the sequence), `projection.test.ts` (one materialization per run). E2E: `time-travel.spec.ts`, `room-admission.spec.ts`.
