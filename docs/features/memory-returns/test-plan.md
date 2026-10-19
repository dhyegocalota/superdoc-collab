# Test plan: Memory returns

## The failing test first

- [ ] `apps/server/src/history/projection-scheduler.test.ts::recycles the worker after a heavy reply` — input: a job whose reply reports a heap above the constant; expected: a new worker, the old one exited.
- [ ] `apps/server/src/collaboration/room-memory-release.test.ts` — input: unload with the heap above and below the constant; expected: the injected collection runs once, and not at all.
- [ ] `tools/repository-shape/src/entrypoint.test.ts` — input: a 1 GiB limit and none; expected: `--expose-gc` in the server's arguments.

## Unit

- [ ] In-flight requests queued behind the heavy job finish on the old worker or are re-posted to the new one, with no rejection.
- [ ] The next job runs on a fresh worker.
- [ ] A recycle does not count against the restart budget.

## Measurement (capped repro, 4 GB container options)

| Moment | Main rss | Main heapUsed | Worker rss | Worker heapUsed |
|--------|----------|---------------|------------|-----------------|
| Before open | | | | |
| Peak | | | | |
| 5 s after the last disconnect | | | | |
| 60 s after | | | | |

## Coverage honesty

- Railway's chart is not reproduced locally; the capped repro measures the process.
