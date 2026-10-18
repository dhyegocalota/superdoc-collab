# One user thrashes the commit-scan cache and the log is rescanned from zero on every open
- Date: 2026-10-17
- Inspired by: room-admission second security round and the third and fourth review rounds; `1519955`, `27d057f`, `758992b`
- Revisited: 2026-10-17 — still true
- Revisited: 2026-10-18 — still true

## Signal
The server slows down while a single account opens many documents that are not yet committed, or while one waiting page polls. Memory climbs with the number of documents opened, and every open of an evicted document reads the log from sequence 0.

## Cause
Scan progress for an uncommitted room is cached per document. Without a bound the cache grows with every document a user touches. With a bound alone, one user can evict everyone else's entries. A per-user limit on the open route does not help when the socket authentication, the agent room locator and the export tool scan through other paths. A budget that counts opens, not documents, charges a polling waiting page for every poll and locks out its owner.

## Do
Hold the progress in an `LruMap` of `BOOTSTRAP_SCAN_CACHE_ENTRIES`. Give each user an `OpenBudget` that counts distinct documents per rolling minute, and route every path that can scan through the one resolver that consults it before any scan (`runtime.roomModeFor`). A room already known committed is never limited. Test the polling case (409 every time, never 429) and each path separately.

## Anchor
- `apps/server/src/collaboration/bootstrap-state.ts`, `room-modes.ts`, `apps/server/src/limits/open-budget.ts`
- `bootstrap-state.test.ts`: `the scan progress of the 33rd uncommitted document evicts the first`; `open-budget.test.ts`; `documents-routes.test.ts`: `a waiting editor polling the same uncommitted document is answered 409 every time, never 429`
- commits `1519955`, `2a2fb66`, `27d057f`, `0c17c22`, `758992b`, `e67f439`
