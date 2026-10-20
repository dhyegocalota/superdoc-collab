# Lighter projection: the worker builds a version and a projection run from one document at a time

**Status:** Shipped 2026-10-20
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

### A version step end to end, on the heavy document (9.5 MB, 85 events, a 36.6 MB state; stack on the built server, headless browser, machine under load)

The worker is not where a step spends its time. Every step, first or later, shows the new version about 14 to 19 s after the key press, because the browser applies and renders the full 36.6 MB state in a new frame. The live editor of the same document takes 13 to 15 s to its first text run in the same walk, so a version frame costs one editor open.

| Segment | First step (viewer and cache cold) | Later step |
|---------|------------------------------------|------------|
| Route answers 202 (job started) | 0.3 s | 0.3 s |
| Worker: snapshot read, apply of the snapshot, tail replay | 10 ms, 0.71 s, 6 ms | 12 ms, 0.99 s, 3 ms |
| Worker: encode, main-story text | 0.21 s, 0.20 s | 0.24 s, 0.21 s |
| Worker round trip as the service sees it | 1.1 s | 1.5 s |
| Route answers 200 (the client polls once a second) | 2.3 s | 2.6 s |
| Room document ready on the server (apply of the 36.6 MB state) | 3.9 s (1.2 s apply) | 5.1 s (1.9 s apply) |
| Frame delivered to the browser (36.6 MB inflated, 5.2 MB deflated) | 5.8 s | 7.4 s |
| Frame ready in the browser | 15.5 s | 17.9 s |
| Browser apply and render of the version | 9.7 s | 10.5 s |

- The snapshot read is 10 ms and the tail replay is 3 to 6 ms: the log is read from the nearest snapshot, never from sequence 0, and the first request pays no extra cold read.
- The 36.6 MB state travels on the collaboration socket, already deflated to 5.2 MB in 0.1 s; the version route carries only the summary, so deflating the route and reusing the live state would not move the step.
- Earlier readings of 0.85 to 2.9 s for later steps timed the banner and the address, which change 0.3 s after the key press while the previous frame stays on screen; the new frame is the signal used above.
- The poll wastes up to 1 s per step (the `Retry-After` is whole seconds); the room apply holds the server's event loop for 1.2 to 1.9 s per frame. Neither is worth a change before the render cost moves.
- A step to the version the cache already holds answers 200 in 0.3 to 0.6 s and still takes 14 to 21 s to render.

### The browser side of a version step (foreground page, one page per context, instrumented viewer, same document)

| From the key press | Step 1 | Step 2 | Step 3 |
|--------------------|--------|--------|--------|
| Viewer frame builds its editor (after the 200 and the frame's own page load) | 2.4 s | 3.4 s | 3.0 s |
| 36.6 MB state frame received on the socket | 5.8 s | 10.1 s | 7.9 s |
| First text run in the viewer | 14.9 s | 20.1 s | 17.3 s |
| Collaboration ready reported to the timeline | 16.0 s | 21.1 s | 18.4 s |

- Socket transfer is 3.5 to 6.7 s after the viewer starts, most of it the server's room apply and encode on a loaded machine; deflate is already on and brings the frame to 5.2 MB in 0.1 s.
- `Y.applyUpdate` of the 36.6 MB state in the browser takes 0.5 to 0.6 s on its own (three runs in a bare page). The 9 to 10 s between the frame and the first text run is therefore SuperDoc building the 56,800-paragraph document and laying it out, about 8.4 s of it.
- The timeline learns the version is ready 1.1 s after the first text run.
- The earlier headless walk that saw no text run in 200 s waited for an iframe whose address held the `at` value of the page address. That value is a server time in milliseconds, not a sequence, so no frame ever matched; the frames were rendering.
- No cheap win: the socket already deflates, and reusing the live state for the latest version needs a viewer that builds from a document the live editor already laid out, which SuperDoc does not expose.

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
