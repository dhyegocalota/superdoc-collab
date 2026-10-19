# Refinement: server readability (lane C1)

**Status:** Shipped 2026-10-17
**Tier:** 🟡 medium. No new behaviour, no schema change and nothing the user sees. It still touches the projection scheduler, the projection worker and server startup, so every control-flow change is pinned by a test before it moves.
**Owner approval:** approved 2026-10-17 (refinement proposal)
**ADRs:** none new. [0001](../../adr/0001-event-sourcing-over-yjs.md) keeps the addendum lane D writes for the deleted edit windows.
**Not changing:** HTTP routes, status codes, response bodies, `Retry-After` values, SQLite schemas, the worker message protocol on the wire, `apps/web`, `poc/`, and the test seams listed in 5.9.

## Problem

A first-time reader of `apps/server` meets a 76-line `startServer` that opens three databases, builds fifteen services and defines shutdown. The server entry and the app import each other. The projection worker and scheduler handle one request kind across non-adjacent lines. Eighteen route handlers repeat the same two-line prelude. Three caches hand-roll the same LRU, and two classes hand-roll the same sliding window. Names such as `InsightsWorker` (not a thread), `log` (not a logger) and `degraded` (a boolean without `is`) send the reader the wrong way.

Source: `scratchpad/audit-readability.md` sections 1 to 5, server and libs items, and `scratchpad/refinement-proposal.md` lane C1.

## Goals

The approved scope, each item re-checked against the code on 2026-10-17:

- **Top 10:** items 1, 2, 4, 6 and 7 (server half). Item 8 is already done by lane D.
- **Names (section 1):** 1.1, 1.3, 1.4, 1.5, 1.7 to 1.13 and 1.18. 1.2 is absorbed by `SlidingWindow`, 1.21 by 5.3, and 1.22 went away with lane D.
- **Long functions (section 2):** 2.1 and 2.4 to 2.10.
- **Conditionals (section 3):** 3.2, 3.3, 3.6 to 3.11 and 3.16.
- **Duplication (section 4):** 4.1 to 4.19. For 4.17 to 4.19 the helpers are exported from `libs/` now and adopted on the server and in `libs/history`. The web call sites stay for lane C2.
- **Over-engineering (section 5):** 5.3, 5.4, 5.6 and 5.11. 5.1 and 5.2 are gone with lane D.

## Non-goals

- Web items, including the web half of top-10 item 7 (`RETRY_AFTER_HEADER = 'X-Retry-After'` in `auth-failure.ts`). They belong to lane C2.
- 5.9, kept as a note: `TimelinePipelineCache.builds`, the `maxEntries` options, `ProjectionScheduler.currentWorker`, `KeyedCooldown.size()` and `VersionRooms.size()` exist for tests. They stay where they are and keep their names.
- Formatting and the `deploy/` rename, done by lane B. Test pruning, done by lane D.

## Items dropped after verification

| Item | Why it is dropped |
|------|-------------------|
| 2.14 environment one-liners | Lane B's Prettier pass, with a print width of 140, puts one property per line. Nothing is left to do. |
| 5.10 `unassignedFirstSequences` out of the pipeline | The calculation needs `BlockChangeKind.Removed`, which only the resolved `DocumentEditEvent`s carry. `TimelineEvent` has no kind. Moving it would mean caching a second event list or widening a `libs/history` type, which costs more than the reader gains. 2.8 still moves the orchestration out of the route, and 3.6 names the condition. |

## Items corrected after verification

| Item | Audit said | Code says | Plan does |
|------|------------|-----------|-----------|
| 3.9 | Listener removal is duplicated in both branches, so use `try/finally` | The `Unavailable` branch deliberately keeps the `error` listener while `socket.end` flushes. `finally` would remove it. | `async` + `await authorize(...).catch(() => VersionAdmission.Refused)`. The flat guards stay the same, and the rejected path is identical to today's. |
| 1.12 | Drop every `const choice = this.languageModel` | In `SelectionSummariesService.request` the narrowed value is read inside the `job` closure. TypeScript does not carry a property narrowing into a closure. | Drop the alias in `TopicsService.compute` and `SummariesService.summarize`. Rename it to `languageModel` in `request`. |
| 4.5 | Five Retry-After responses | There are eight: four in `insights-routes.ts`, and four in `versions-routes.ts`, two of which are `202` bodies. | `retryLater` takes any body, not only errors. |
| 4.4 | 18 handlers adopt the prelude | `GET /:documentId` needs the role that `requireDocumentRole` returns. | 17 handlers adopt `authorizedDocumentId`. `GET /:documentId` keeps calling `requireDocumentRole`. |
| 1.5 | `log` → `updateLog` everywhere | `libs/history` functions take a named `log` parameter (`materialize`, `compact`, `projectPending`). | Rename the server field, locals and parameters. Library signatures keep `log`, so call sites read `{ log: updateLog }`. |

## Design

All paths are as they will be after lanes B and D.

### Data flow

Nothing changes for a request. These are the internal seams that move:

- **Startup:** `startServer` runs `openDatabases` → `createServices` → `resumeProjections` → `createApp` → `listen`. If `listen` fails, it runs `closeCollaboration` → `closeDatabases` and rethrows. Shutdown runs `stopServer`, in today's order: version rooms, Hocuspocus, throttle, scheduler, job runner idle, sockets, connections, HTTP server, databases.
- **Projection replies:** the worker answers through `createProjectionHandler`, with one function per request kind. The scheduler routes replies through `WaitingRequests`, keyed by `requestKeyOf`, plus one `settle*` method per done kind.
- **Document deletion:** the route runs `documents.remove` → `runtime.forget` → `storage.remove`. `runtime.forget` now ends with the three insights cooldown forgets, in today's order, after `scheduler.forget` resolves.

### Interfaces

New shared code:

| Name | File | Signature |
|------|------|-----------|
| `LruMap<Value>` | `apps/server/src/limits/lru-map.ts` | `new LruMap({ isOverBudget })`, `get(key): Value \| null` (refreshes recency), `peek(key): Value \| null` (does not), `set({ key, value }): LruEntry<Value>[]` (returns what it evicted), `delete(key): boolean`, `keys(): string[]`, `values(): Value[]`, `size` |
| `KeyedCooldown` | `apps/server/src/limits/keyed-cooldown.ts` | `DocumentCooldown` renamed and moved. Adds `keys(): string[]`. |
| `SlidingWindow` | `apps/server/src/limits/sliding-window.ts` | `new SlidingWindow({ windowMs, now? })`, `record()`, `count()`, `oldest(): number \| null` |
| `withTimeout` | `apps/server/src/limits/with-timeout.ts` | `withTimeout<Value>({ work, milliseconds, onTimeout: () => Value }): Promise<Value>` |
| `describeError` | `apps/server/src/logging/describe-error.ts` | moved from `projection-messages.ts` |
| `retryLater` | `apps/server/src/http/retry-later.ts` | `retryLater({ context, body, status, retryAfterSeconds }): Response` |
| `authorizedDocumentId` | `apps/server/src/documents/require-document-role.ts` | `authorizedDocumentId({ context, documents, minimumRole }): string` |
| `WaitingRequests`, `requestKeyOf` | `apps/server/src/history/waiting-requests.ts` | `add`, `resolve`, `reject`, `rejectAll`, `repost` |
| `keysOfDocument`, `marksAround` | `apps/server/src/history/versions-service.ts` | `keysOfDocument({ keys, documentId }): string[]`; `marksAround({ marks, sequence })` |
| `createProjectionHandler` | `apps/server/src/history/projection-handler.ts` | `(stores) => (request: AnsweredRequest) => Promise<AnsweredReply>` |
| `RETRY_AFTER_SECONDS` | `libs/types/src/http.ts` | moved from `versions-routes.ts` |
| `NON_NEGATIVE_INTEGER_PATTERN`, `secondsRoundedUp` | `libs/types/src/constants.ts` | `/^\d+$/`; `Math.ceil(milliseconds / SECOND_MS)` |
| `presentOrNull` | `libs/types/src/text.ts` | moved from `environment.ts` |
| `runVolume`, `cellVolume`, `byVolumeDescending` | `libs/history/src/timeline/{runs,stack,bands}.ts` | exported for lane C2 |

Renames, with the reference count from `rg` on 2026-10-17. The developer re-counts after lanes B and D.

| From | To | References |
|------|----|-----------|
| `InsightsWorker` class, `insights-worker.ts` | `InsightsJobRunner`, `insights-job-runner.ts` | class 28 refs in 8 files; path 14 imports |
| `worker` field and parameter of the insights services, `insightsWorker` | `jobRunner` | 38 production; up to 155 test hits, filtered to the insights job runner |
| `ProjectionScheduler.alive`, `.degraded` | `isAlive`, `isDegraded` | 3 and 17 refs (4 files) |
| `rerun`, `rebuilding`, `reimported` (scheduler sets) | `documentsNeedingRerun`, `rebuildingDocuments`, `reimportedDocuments` | 8, 10, 5 refs, including the `SchedulerInternals` test type |
| `log: UpdateLog` (services field, server locals) | `updateLog` | 25 production in 9 files; 19 `services.log` in tests |
| `topicStampOf` | `topicsUpdatedAtFor` | 2 |
| `pipelineKey` | `pipelineCacheKey` | 2 |
| `needle` | `searchText` | 5 in 2 files |
| `named` (topics service local) | `blocksWithText` | 4 |
| `SelectionSummariesService.resolve` | `readNonEmptySelection` | 3 |
| `capRun`, `authorsNamed` | `capEdit`, `mentionedAuthors` | 2 and 8 refs in 3 files |
| `sdkConnection`, `connectSdk`, `connectedSdk` | `superdocClient`, `connectSuperdocClient`, `connectedSuperdocClient` | 7, 2, 2 |
| `DocumentCooldown`, `document-cooldown.ts` | `KeyedCooldown`, `limits/keyed-cooldown.ts` | 11 refs in 5 files; path 4 |

### Failure handling

Behaviour is preserved by construction, and these tests pin it:

- **Existing suites stay green unchanged.** The only exceptions are import paths and the renamed identifiers.
- **New shared helpers get their own unit test, committed red first:** `LruMap`, `SlidingWindow`, `withTimeout`, `retryLater`, `authorizedDocumentId`, `WaitingRequests`, `keysOfDocument`, `secondsRoundedUp`, `presentOrNull`, `runVolume` and `byVolumeDescending`.
- **Control-flow moves get a test that pins the old behaviour before the move:** the projection handler per kind, scheduler settling per kind, the `startServer` failure path and shutdown order, the document-forget order, and the middleware order.
- **Rollback:** every task is one commit. Reverting a task's commit, or its test commit plus its implementation commit, restores the previous state. No data is migrated.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Approve lane C1 | approve, trim, skip | approved (refinement proposal) | 2026-10-17 |
| Keep test seams (5.9) | regroup, rename, keep | keep as a note | 2026-10-17 |
| `LruMap` contains an acronym | `LruMap`, `LeastRecentlyUsedMap` | `LruMap`, the approved name. `GcFreeReplays` is the precedent. | 2026-10-17 |

## Test strategy summary

Vitest only, because nothing is visible to the user. Every task ends with `pnpm typecheck` and the affected suites green. The lane ends with `pnpm test:unit` and `pnpm test:e2e` green. New tests are listed in `test-plan.md`. There is no Playwright MCP walk because no UI is touched. One E2E smoke run proves the deployed shape still starts, collaborates and deletes.
