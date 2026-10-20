# Memory returns: a heavy document gives its memory back at once

**Status:** Building
**Tier:** 🔴
**Owner approval:** approved 2026-10-19 ("quero implementar tudo isso incluindo a memoria voltando de imediato")
**ADRs:** [0044](../../adr/0044-version-builds-are-budgeted-per-user-and-capped-in-the-projection-queue.md), [0047](../../adr/0047-the-server-never-materializes-an-update-it-only-logs-and-heap-follows-the-container.md)
**Not changing:** the update log, the projection's output, the room mode rules, the heap sizing percentages.

## Problem

After the owner opened and closed `heavy-document.docx` (9.5 MB, 56,800 paragraphs), the Railway chart kept 3.34 GB in use. The room's `Y.Doc` is about 690 MB of heap in the main thread and the projection worker holds its own copy. The references are dropped on the last disconnect and at the end of projection, but V8 keeps the pages it grew and the worker keeps its heap.

## Goals

| Goal | Rule |
|------|------|
| Worker recycle | No reply waits for a measurement. Once the worker has been quiet for `PROJECTION_WORKER_QUIET_MS` and is idle, the scheduler asks it to measure: it reads the heap it retains, its used bytes after a full collection when the heap total is above `LARGE_DOCUMENT_HEAP_BYTES`, and answers. The total alone says nothing about the document. Above `LARGE_DOCUMENT_HEAP_BYTES` retained, once the worker has been idle for `PROJECTION_WORKER_QUIET_MS` (nothing in flight, no waiting request, no pending bootstrap, import or forget), the scheduler stops the worker, lets the queue it already holds finish, spawns a fresh one and logs one line with the heap. A burst of version requests keeps the worker and its replay cache. A recycle waits for the serial, import and bootstrap queues, happens at most once per `PROJECTION_WORKER_RECYCLE_INTERVAL_MS`, holds bootstrap requests until the fresh worker is up, does not count against the restart budget and does not count the reposts of waiting requests against `MAX_REQUEST_POSTS`. |
| Main reclaim | The server starts with `--expose-gc`. When a room whose state exceeds `LARGE_ROOM_STATE_BYTES` unloads, the server runs one synchronous, major, regular collection after the unload hook returns, at most once a minute, and logs the resident memory before and after and the pause. Rooms below the size never collect, whatever the process heap. Without `--expose-gc` nothing runs. |
| Measurement | The capped local repro records resident memory and heap of both threads before the open, at the peak, 5 s and 60 s after the last disconnect. The numbers live in the test plan. |

## Non-goals

- A relay room that never materializes the `Y.Doc` ([docs/next.md](../../next.md)).
- Tuning V8 flags beyond `--expose-gc`.

## Design

- A measure request, queued behind the serial work, makes the worker answer with `retainedHeapBytes`. `createRetainedHeapReader` reads `process.memoryUsage()`; above the threshold in total heap it first runs a collection exposed to the worker through `v8.setFlagsFromString` and `vm.runInNewContext`. The scheduler arms a quiet timer on every heavy reply and clears it on every light one. When the timer fires and the scheduler is idle it recycles; otherwise the next reply arms it again.
- The recycle posts the existing `Stop` request: the worker's serial queue finishes what it already holds, replies, and exits. The scheduler's `exit` handler respawns and re-posts what is still tracked, the same path a crash takes, minus the budget record.
- `createRoomMemoryRelease` (new, `apps/server/src/collaboration/room-memory-release.ts`) takes the collection function, the memory reader, the cooldown and the clock. `onLoadDocument` and `onChange` report the bytes a room loaded and received, so the room is sized from their sum with no encode at unload, `afterUnloadDocument` reports the unload, and the collection waits `ROOM_MEMORY_RELEASE_DELAY_MS`, skips a room that is loaded again, and spends the cooldown only on a collection that ran.
- The entrypoint adds `--expose-gc` next to `--max-old-space-size`; with no limit it also passes `--expose-gc`.

## Failure modes

| What | Signal | Back out |
|------|--------|----------|
| Recycle loop on a document whose projection always leaves the heap high | one log line per job, projection still correct, restarts not counted | raise the constant |
| A collection stalls the event loop | the log line prints the pause; only a heavy room's unload collects, once a minute | raise `LARGE_ROOM_STATE_BYTES` |
| Time travel right after a recycle | the first version request after a quiet period replays cold, as it did before the worker cache existed; a burst keeps the worker | raise `PROJECTION_WORKER_QUIET_MS` |
| `--expose-gc` missing | no log line, memory stays as before | none needed |

## Measured: what the worker retains

| Document | Retained after collection (MB) | Heap total at the reply (MB) |
|----------|-------------------------------|------------------------------|
| The 1.4 MB brief, nine opens, three runs | 36 to 101 | 166 to 191 (transient peaks of 410 and 482 sampled between replies) |
| heavy-document.docx | 52 | 594 before the next collection, 39 once the worker was idle |

The first design read the heap total at the reply and recycled the worker after about four of nine opens of the brief. The threshold of 256 MB now applies to the retained heap, which is at most 101 MB for the brief and leaves a margin of 2.5 times. The idle-only rule, the quiet period and the 5-minute interval are unchanged. In the merged build the heavy document's retained heap in the worker is already below the threshold, so the recycle is the safety net for a worker whose caches really hold a heavy document.
