# A worker_threads exception with no 'error' listener exits the whole server

- Date: 2026-10-16
- Inspired by: slice 2 Task 7 review (reproduced on Node 24 with the projection worker); `apps/server/src/history/projection-scheduler.ts`
- Revisited: 2026-10-16 — fixed with per-request isolation and a restart budget

## Signal
The server process dies with status 1 the moment a projection throws (bad update, busy SQLite, file open failure); `'exit'` restarts never fire because the main thread is already gone.

## Cause
`Worker` emits `'error'` on the main thread for uncaught worker exceptions; without a listener Node rethrows it there. An unbounded restart on `'exit'` then turns any deterministic failure into a respawn loop.

## Do
Attach `worker.on('error')` at every spawn, catch per request inside the worker and reply with a failure message, cap restarts per window and degrade instead of looping.

## Anchor
`apps/server/src/history/projection-scheduler.ts`, `projection-worker.ts`, `projection-scheduler.test.ts`
