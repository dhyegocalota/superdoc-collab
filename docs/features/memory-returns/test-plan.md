# Test plan: Memory returns

## The failing test first

- [x] `apps/server/src/history/projection-scheduler.test.ts::a worker whose heap stays above the large document size is recycled and the next job runs on a fresh worker` — input: a probe worker replying with a heap above the constant; expected: a new worker, the next reply from another thread. Failed with `Matcher did not succeed in time` on the worker comparison — evidence: 7c4233af, green in e00f3a87.
- [x] `apps/server/src/collaboration/room-memory-release.test.ts` — input: unload with the heap above and below the constant; expected: the injected collection runs once with `{ type: 'major', execution: 'sync', flavor: 'last-resort' }`, and not at all below. Failed with `createRoomMemoryRelease is not implemented` — evidence: fc90d18b, green in 8abcbbe6.
- [x] `tools/repository-shape/src/entrypoint.test.ts` — input: a 1 GiB limit and none; expected: `--expose-gc` in the server's arguments. Failed on the missing flag — evidence: the red commit before b41919a5.
- [x] `room-memory-release.test.ts::...after the unload returns` — input: unload with a heavy heap; expected: no collection before the next macrotask. Failed with `expected "vi.fn()" to not be called at all, but actually been called 1 times` — evidence: red commit before 67f3a4ac.

## Unit

- [x] `projection-scheduler.test.ts::requests already queued behind a heavy job still resolve when the worker is recycled` (pin) — three blocks requests, every reply heavy; expected: three replies, no rejection — evidence: 7c4233af.
- [x] `projection-scheduler.test.ts::recycling a worker does not spend the restart budget` (pin until the recycle landed, then proof) — seven recycles in a row; expected: the scheduler is not degraded — evidence: e00f3a87.
- [x] `projection-scheduler.test.ts::a worker whose heap is below the large document size is kept` (pin) — heap equal to the constant; expected: the same worker — evidence: 7c4233af.
- [x] `collaboration-server.test.ts::unloading a room releases the memory of the process through the injected function` — the unload hook calls the injected function once — evidence: 8abcbbe6.

## Measurement (capped repro, heavy-document.docx, server heap 2867 MB and worker heap 2048 MB as the entrypoint computes for a 4 GB container, `--expose-gc`)

Resident memory is the whole process (main thread and workers). Sampler: one row per second per thread. Evidence: commit 67f3a4ac, scratchpad `instant-memory/run3-samples.jsonl`.

| Moment | Process rss (MB) | Main heapUsed (MB) | Worker heapUsed (MB) | Worker heapTotal (MB) |
|--------|------------------|--------------------|----------------------|-----------------------|
| Before open | 566 | 79 | 78 | 181 |
| Peak | 3115 | 688 | 79 (sampler blocked during the job) | 937 (reported in the reply that triggered the recycle) |
| 5 s after the last disconnect | 383 | 70 | 37 | 167 (fresh worker) |
| 60 s after | 384 | 71 | 37 | 167 |

- [x] The server log shows one `Recycled the projection worker after a heavy job` line and one `Released the memory of a heavy room` line — evidence: scratchpad `instant-memory/run3-server.log`.
- Run with the collection inside the unload hook instead of after it (not committed): rss stayed 1061 MB and main heapUsed 680 MB at 5 s and 60 s, because the hook's frame still held the room. See the learning.
- macOS compresses idle pages, so the rss logged around the collection (438 to 398 MB) understates what Linux holds; the heapUsed drop (688 to 70 MB) is the number that carries to Railway.

## Coverage honesty

- Railway's chart is not reproduced locally; the capped repro measures the process.
