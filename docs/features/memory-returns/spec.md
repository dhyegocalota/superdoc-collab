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
| Worker recycle | A projection reply carries the worker's total heap after the job. Above `LARGE_DOCUMENT_HEAP_BYTES` the scheduler stops the worker, lets the queue it already holds finish, spawns a fresh one, and logs one line with the heap. A recycle does not count against the restart budget. |
| Main reclaim | The server starts with `--expose-gc`. When a room unloads and the main heap is above `LARGE_DOCUMENT_HEAP_BYTES`, the server runs a synchronous, major, last-resort collection and logs the resident memory before and after. Without `--expose-gc` nothing runs. |
| Measurement | The capped local repro records resident memory and heap of both threads before the open, at the peak, 5 s and 60 s after the last disconnect. The numbers live in the test plan. |

## Non-goals

- A relay room that never materializes the `Y.Doc` ([docs/next.md](../../next.md)).
- Tuning V8 flags beyond `--expose-gc`.

## Design

- The worker adds `heapTotalBytes` (`process.memoryUsage().heapTotal`, the isolate's own) to every answered reply. The scheduler checks it in `settle` and calls `recycle`.
- `recycle` posts the existing `Stop` request: the worker's serial queue finishes what it already holds, replies, and exits. The scheduler's `exit` handler respawns and re-posts what is still tracked, the same path a crash takes, minus the budget record.
- `createRoomMemoryRelease` (new, `apps/server/src/collaboration/room-memory-release.ts`) takes the collection function and the clock of the memory read as parameters, and `afterUnloadDocument` calls it once.
- The entrypoint adds `--expose-gc` next to `--max-old-space-size`; with no limit it also passes `--expose-gc`.

## Failure modes

| What | Signal | Back out |
|------|--------|----------|
| Recycle loop on a document whose projection always leaves the heap high | one log line per job, projection still correct, restarts not counted | raise the constant |
| A collection stalls the event loop | the log line prints before and after; collection runs only above the threshold | raise the constant |
| `--expose-gc` missing | no log line, memory stays as before | none needed |
