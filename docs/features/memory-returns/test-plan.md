# Test plan: Memory returns

## The failing test first

- [x] `apps/server/src/history/projection-scheduler.test.ts::a worker whose heap stays above the large document size is recycled and the next job runs on a fresh worker` — input: a probe worker replying with a heap above the constant; expected: a new worker, the next reply from another thread. Failed with `Matcher did not succeed in time` on the worker comparison — evidence: 7c4233af, green in e00f3a87.
- [x] `projection-scheduler.test.ts::a burst of requests keeps the worker and its caches until the quiet period passes` — input: four sequential heavy replies spaced under the quiet period; expected: the same worker throughout, a fresh one after the quiet period. Failed with `expected { Object (_events, _eventsCount, ...) } to be Worker{ ... } // Object.is equality` — evidence: c3528cc0, green in 8fbcf6f1.
- [x] `apps/server/src/collaboration/room-memory-release.test.ts` — input: a room above `LARGE_ROOM_STATE_BYTES` unloads, a room at the size unloads, two heavy rooms unload inside the cooldown, a heavy room unloads twice, a heavy room is loaded again when the delay ends, no collector is exposed; expected: one regular, synchronous collection after `ROOM_MEMORY_RELEASE_DELAY_MS` for the first case and none for the others (the reloaded room does not spend the cooldown). Failed with `Error: createRoomMemoryRelease is not implemented` in every case — evidence: 44a0745e, green in af411735; the delay case failed with `expected "vi.fn()" to not be called at all, but actually been called 1 times` — 8db69d04, green in 9fa2e313; the reload case failed with `expected "vi.fn()" to be called once with arguments` — 69ab49be, green in 3e60df72.
- [x] `tools/repository-shape/src/entrypoint.test.ts` — input: a 1 GiB limit and none; expected: `--expose-gc` in the server's arguments. Failed with `AssertionError: expected 'memory limit 1024 MB, heap 716 MB\n--…' to contain '--max-old-space-size=716 --expose-gc …'` and `AssertionError: expected 'memory limit none, heap node default\n' to contain '--expose-gc'` — evidence: 3e8d7225, green in b41919a5.

## Unit

- [x] `projection-scheduler.test.ts::requests already queued behind a heavy job still resolve when the worker is recycled` (pin) — three concurrent blocks requests, every reply heavy; expected: three replies, no rejection — evidence: 7c4233af.
- [x] `projection-scheduler.test.ts::recycling a worker does not spend the restart budget` — seven recycles in a row; expected: the scheduler is not degraded. Red when it landed (no recycle happened, the poll for a new worker timed out), green in e00f3a87 — evidence: 7c4233af.
- [x] `projection-scheduler.test.ts::a worker whose heap is below the large document size is kept` (pin) — heap equal to the constant; expected: the same worker — evidence: 7c4233af.
- [x] `projection-scheduler.test.ts::a request posted after the stop is posted again to the fresh worker and resolves` (pin) — the probe worker ignores everything after the stop and exits 300 ms later; a blocks request posted in that window; expected: it resolves from a fresh worker. The old worker drops it and the restart path posts it again, spending one of `MAX_REQUEST_POSTS` — evidence: c3528cc0.
- [x] `collaboration-server.test.ts::unloading a room reports its state size and then its unload to the room memory` — a real `Document` in the server's map; expected: `observe` with the encoded size, `unloaded` once, and `isReloaded` true while the room is still in the map and false after it leaves — evidence: 3e60df72.

- [x] `projection-queues.test.ts::a recycle waits for the pending import reply` and `...bootstrap reply` — a held reply, then a recycle; expected: the stop runs only after the release. Failed with `expected [ 'stop' ] to deeply equal []` — evidence: ea9fd12e, green in the next commit.
- [x] `waiting-requests.test.ts::a repost that does not count its posts never rejects as crashed` — three reposts at a limit of two; expected: three posts, no rejection. Failed with `expected "vi.fn()" to be called 3 times, but got 1 times` — evidence: ea9fd12e.
- [x] `projection-scheduler.test.ts::a second heavy period inside the recycle interval keeps the fresh worker` — evidence: ea9fd12e.
- [x] `projection-scheduler.test.ts::a bootstrap requested while the worker is being recycled is held for the fresh worker` — expected: no bootstrap posted to the dying worker, the request resolves from the fresh one. Failed with a 20000 ms timeout — evidence: ea9fd12e. The fix also moves the bootstrap repost after the spawn; it used to post to the exited worker.

## Measurement (capped repro, heavy-document.docx, server heap 2867 MB and worker heap 2048 MB as the entrypoint computes for a 4 GB container, `--expose-gc`)

Final code, commit 3e60df72. Sampler: one row per second per thread; the machine was under load (load average about 11) because a full gate ran at the same time. Evidence: scratchpad `instant-memory/run11-samples.jsonl`, `run11-server.log`.

| Moment | Process rss (MB) | Main heapUsed (MB) | Worker heapUsed (MB) | Worker heapTotal (MB) |
|--------|------------------|--------------------|----------------------|-----------------------|
| Before open | 553 | 75 | 79 | 181 |
| Peak | 3074 | 900 | 855 | 1007 (reported in the reply that triggered the recycle) |
| 5 s after the last disconnect | 1306 | 69 | 78 (fresh worker) | 181 |
| 60 s after | 1301 | 72 | 78 | 181 |
| 90 s after | 1303 | 73 | 78 | 181 |

- Pause of the collection for the heavy room: 31 ms, one regular pass; heapUsed 714 MB before and 73 MB after (log line `Released the memory of a heavy room`, evidence `run11-server.log`).
- The resident memory in this run stayed at 1.3 GB although the heaps are small, where an earlier run on a quiet machine fell from 3115 MB to 383 MB (commit 67f3a4ac, `run3-samples.jsonl`). macOS reclaims and compresses pages lazily under load, so rss on this machine is not the number to trust. The heapUsed drop is.
- The collection runs one second after the unload, not in the unload hook and not one macrotask later. A collection one macrotask after the unload freed 0 bytes in the regular and last-resort flavors (heapUsed 705645944 before, 693641912 after), and two passes freed 0 bytes (719822872 to 708752872). On the capped repro the creator hand-off unloads the heavy room for under a second and loads it again, so those collections hit a live room. The room-loaded-again check fixed that, not the flavor or the number of passes.
- Not committed: a collection inside the hook left rss at 1061 MB and main heapUsed at 680 MB for a minute. See the learning.

## Three open-close cycles (capped repro, heavy-document.docx, one page, 8 s open, 12 s closed)

The recorder saw resident memory climb across four heavy opens and a release line that freed 12 MB. The capped repro shows no retention: every room that was collected returned the main heap to 69 to 80 MB, and no collection was missed in a cycle without the cooldown.

| Moment | Main heapUsed (MB) | Process rss (MB) |
|--------|--------------------|------------------|
| Before the first open | 70 | 434 |
| Cycle 1 closed, 20 s after | 69 | 187 to 231 |
| Cycle 2 closed (inside the cooldown) | 681 until the cooldown ended | 738 to 1119 |
| After the deferred collection | 74 | 758, then 273 once the operating system trimmed |
| Cycle 3 closed, 60 s later | 70 to 100 (ordinary sawtooth) | 250 to 290 |

- Cause of the climb the recorder saw: a heavy unload inside the one-minute cooldown was skipped, so its room stayed garbage until some later collection, and rss on macOS trims lazily. The registry, the scan cache and the received-bytes counters hold nothing after a commit or an unload: `bootstrap-state` deletes the scan document at commit, and the room memory forgets the bytes of an unloaded room (`room-memory-release.test.ts`, the forgotten-bytes pin). The skipped unload now collects when the cooldown ends (red 001c5b01, green b0a10e6f).
- Evidence: scratchpad `instant-memory/cyc1-samples.jsonl` (before the fix, the second cycle stayed at 663 MB until the third cycle) and `cyc2-samples.jsonl` (after).

## Failure modes exercised

- [x] A recycle makes the next time-travel step replay cold: a recycle happens only after `PROJECTION_WORKER_QUIET_MS` of idleness and the burst test keeps the worker across consecutive requests. The first version request after a quiet period replays cold, as it did before the worker kept a cache.

## Coverage honesty

- Railway's chart is not reproduced locally; the capped repro measures the process.
- The quiet period of 30 s is not exercised against a real replay cache; the probe worker stands in for the worker and the repro shows one recycle per heavy session.
- rss on the measuring machine is dominated by the operating system's page handling under load; see the note under the table.
## Tester walk, 2026-10-19 (scripted, scenario stack with `--expose-gc`)
- The server log of the stack showed, after every close of the last tab of a heavy document, one `Released the memory of a heavy room, resident bytes before and after:` line. Rows: 2,204,794,880 to 1,530,281,984; 2,224,783,360 to 1,562,165,248; 1,289,158,656 to 255,754,240 (the third after `Recycled the projection worker after a heavy job, heap bytes: 976453632`); later runs 1,525,465,088 to 404,160,512; 1,527,349,248 to 656,048,128; 1,056,817,152 to 396,754,944; 1,422,688,256 to 533,856,256. Log files: `.pr-media/instant-open/walk/mystack*.log`.
- The 1.4 MB sample brief also triggered `Recycled the projection worker after a heavy job` (heap bytes 449,675,264 to 487,817,216 in 4 of about 9 opens): the 256 MB threshold counts heapTotal of a moderately sized document, so each such open pays a worker restart.
- The scenario stack script was killed from outside six times (SIGTERM to the fake model and the server, exit 0, no product code involved); the walk used an equivalent launcher that logs the exit signal.
