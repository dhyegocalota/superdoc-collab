# Tester briefing: refinement, server readability (lane C1)

Branch `chore/refinement-readability-server`, based on `d63679c` (the structure lane). 28 commits, one per plan step that commits. Nothing under `apps/web` or `poc/` changed.

## How to run

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test:unit
pnpm --filter @superdoc-collab/server build && ls apps/server/dist/projection-worker.js
```

Single suites: `cd apps/server && npx vitest run <path>`, `cd libs/history && npx vitest run src/timeline`, `cd libs/types && npx vitest run`.

The developer did not run `pnpm test:e2e`; the lead reserved it for CI.

Totals at `53497ef`:

| Package | Tests |
|---------|-------|
| libs/types | 16 passed |
| libs/history | 83 passed |
| apps/web | 218 passed |
| apps/server | 419 passed, 2 skipped |

## What changed, per commit

| Commit | Kind | What |
|--------|------|------|
| `1220627` | refactor | `NOT_FOUND_MESSAGE` lives in `http/app.ts`; `ServerServices = AppServices & { hocuspocus; throttle }`; the LLM defaults live in `config/environment.ts`; `VersionEndpoint` is imported from `versions-service`; `describeError` moved to `logging/describe-error.ts`. `VersionRooms` now logs a destroy failure through `describeError` (one line instead of possibly several). |
| `1365e1a` | refactor | Renames: `InsightsWorker` → `InsightsJobRunner` (file moved with `git mv`), `worker`/`insightsWorker` → `jobRunner`, scheduler `alive`/`degraded`/`rerun`/`rebuilding`/`reimported` → `isAlive`/`isDegraded`/`documentsNeedingRerun`/`rebuildingDocuments`/`reimportedDocuments`, server `log` → `updateLog` (library calls read `{ log: updateLog }`), `topicStampOf` → `topicsUpdatedAtFor`, `needle` → `searchText`, `pipelineKey` → `pipelineCacheKey` with named parts, `named` → `blocksWithText`, `resolve` → `readNonEmptySelection`, `capRun` → `capEdit`, `authorsNamed` → `mentionedAuthors`, the `choice` alias dropped in topics and summaries and renamed `languageModel` in selection, SDK names → `superdocClient` family. |
| `af4929c` | test, red | `constants.test.ts`, `text.test.ts`, `stack.test.ts`, plus appended tests in `runs.test.ts` and `bands.test.ts`, with throwing stubs. |
| `b249b1c` | refactor | `secondsRoundedUp`, `NON_NEGATIVE_INTEGER_PATTERN`, `presentOrNull` (new `libs/types/src/text.ts`), `runVolume`, exported `cellVolume`, `byVolumeDescending`; adopted in `bands.ts`, `environment.ts`, the selection and topics services, the versions, history and timeline query parsers. |
| `d2874d3` | test, red | `http/retry-later.test.ts` with a stub that answers the bare body. |
| `1ec8170` | refactor | `retryLater` at all eight sites; `RETRY_AFTER_SECONDS` moved to `libs/types/src/http.ts`. |
| `4d8c921` | test, red | `documents/require-document-role.test.ts` with a throwing stub. |
| `1f855d9` | refactor | `authorizedDocumentId` in 17 handlers; `GET /:documentId` keeps `requireDocumentRole`. |
| `b1547e8` | test, red | `limits/lru-map.test.ts` with a throwing stub. |
| `5a48589` | refactor | `LruMap` in `TimelinePipelineCache`, `VersionsService` and `VersionRooms`. |
| `1a263a9` | test, red | `document-cooldown` moved to `limits/keyed-cooldown` and renamed `KeyedCooldown`; the keys test; `history/versions-service.test.ts`; stubs for `keys`, `keysOfDocument`, `marksAround`. `VERSION_MARKS_AROUND` moved to `versions-service.ts` here so the test compiles. |
| `707376f` | refactor | Version failures use a `KeyedCooldown`; `forget` uses `keysOfDocument`; `cachedLookup`; the marks route uses `marksAround`. |
| `0f9357d` | test, red | `limits/sliding-window.test.ts` with a throwing stub. |
| `9991a81` | refactor | `SlidingWindow` in the job runner call budget and the scheduler restart budget. |
| `2360112` | test, red | `limits/with-timeout.test.ts` with a throwing stub that observes the work. |
| `b77d818` | refactor | `withTimeout` in the worker import, the worker stop and `VersionRooms.stop`. |
| `b274006` | test, pin | Two middleware-order pins in `app.test.ts`, green before the change. |
| `5f6b9ef` | refactor | `PROTECTED_PATHS` loop; whole-query parsing (`queryOf` and `parseSelection` deleted); events route with one return and a `.default(EVENTS_PAGE_SIZE)`. |
| `8a124f7` | refactor | `isUnassigned` and `toTimelineEvent`; `authorsOf` reused for author bands; `hasUsableSentence`; `lastSequenceOf`; `TopicsService` takes `readPipeline` and `onTimelineRead(documentId)`; `upgradeVersion` is `async` with `await … .catch(() => Refused)`. |
| `954ca16` | refactor | `escape-xml.ts` and `prompt-budget.ts` split out of `prompts.ts`; `promptEditsOf` and exported `authorLabel` shared by selection and summaries. |
| `50aa400` | test, red | `history/projection-handler.test.ts` with a throwing stub. |
| `a1fbe71` | refactor | `createProjectionHandler`; the worker keeps wiring, stores, SuperDoc client, import, queues. `AnsweredRequest`/`AnsweredReply` in `projection-messages.ts`. |
| `dc037f2` | test, pin + red | Three scheduler pins (green before) and `history/waiting-requests.test.ts` (red, throwing stub). |
| `1099750` | refactor | `WaitingRequests` and `requestKeyOf`; `settleImport`, `projectReimported`, `settleProject`; `ProjectionDoneReply.kind` narrowed to Project, Import or Forget. |
| `98fcf23` | test, pin | Shutdown order pin and the extended listen-failure pin in `server.test.ts`, green before. |
| `196cb14` | refactor | `openDatabases`, `closeDatabases`, `createServices`, `resumeProjections`, `closeCollaboration`, `stopServer`. |
| `fb10f8c` | test, pin + red | Fan-out test (red on `[1, 1, 1]`) and the route-order pin (green). |
| `53497ef` | refactor | `createCollaborationRuntime` takes `insights`; `runtime.forget` ends with the three insights forgets; the delete route no longer calls them. |

## Red before, green after

| Test | Red at | Red reason observed | Green at |
|------|--------|---------------------|----------|
| `constants.test.ts` both tests | `af4929c` | `secondsRoundedUp is not implemented: 0`; the stub pattern `/(?!)/` gives `expected [ false, false, … ] to deeply equal [ true, true, … ]` | `b249b1c` |
| `text.test.ts` | `af4929c` | `presentOrNull is not implemented: Ana` | `b249b1c` |
| `runs.test.ts` runVolume | `af4929c` | `runVolume is not implemented: ab` | `b249b1c` |
| `stack.test.ts` | `af4929c` | `TypeError: cellVolume is not a function` | `b249b1c` |
| `bands.test.ts` byVolumeDescending | `af4929c` | `byVolumeDescending is not implemented: b a` | `b249b1c` |
| `retry-later.test.ts` both | `d2874d3` | `expected [ 200, null, { error: 'later' } ] to deeply equal [ 503, '7', … ]` and the 202 twin | `1ec8170` |
| `require-document-role.test.ts` three | `4d8c921` | `expected 'Error' to be 'd1'` / `'DocumentRoleTooLowError'` / `'DocumentNotFoundError'` | `1f855d9` |
| `lru-map.test.ts` five | `b1547e8` | `LruMap.set is not implemented: a` (four), `LruMap.get is not implemented: x` | `5a48589` |
| `keyed-cooldown.test.ts` keys | `1a263a9` | `KeyedCooldown.keys is not implemented` | `707376f` |
| `versions-service.test.ts` three | `1a263a9` | `keysOfDocument is not implemented: d1`, `marksAround is not implemented: 155` and `: 0` | `707376f` |
| `sliding-window.test.ts` | `0f9357d` | `SlidingWindow.record is not implemented` | `9991a81` |
| `with-timeout.test.ts` four | `2360112` | `withTimeout is not implemented: 1000`, no unhandled rejection | `b77d818` |
| `projection-handler.test.ts` five | `50aa400` | `createProjectionHandler is not implemented: <kind> …` (four) and `expected Error … to be an instance of MissingVersionMarkError` | `a1fbe71` |
| `waiting-requests.test.ts` four | `dc037f2` | `requestKeyOf is not implemented: version`, `WaitingRequests.add is not implemented: …` | `1099750` |
| `documents-routes.test.ts` fan-out | `fb10f8c` | `expected [ 1, 1, 1 ] to deeply equal [ +0, +0, +0 ]` | `53497ef` |

Pins, green both before and after their refactor: the two `app.test.ts` middleware tests (`b274006`), the three scheduler tests (`dc037f2`), the two `server.test.ts` shutdown tests (`98fcf23`), and "deleting a document forgets it once through the runtime, then removes the file" (`fb10f8c`).

## Rename reference counts after the lane

`rg -w <name> apps/server/src libs/history/src --type ts`:

| Name | References | Files |
|------|-----------|-------|
| `InsightsJobRunner` | 28 | 8 |
| `jobRunner` | 168 | 11 |
| `isAlive` | 4 | 1 |
| `isDegraded` | 18 | 4 |
| `documentsNeedingRerun` | 7 | 2 |
| `rebuildingDocuments` | 7 | 1 |
| `reimportedDocuments` | 5 | 1 |
| `updateLog` | 49 | 16 |
| `topicsUpdatedAtFor` | 2 | 1 |
| `searchText` | 5 | 2 |
| `pipelineCacheKey` | 2 | 1 |
| `blocksWithText` | 4 | 1 |
| `readNonEmptySelection` | 3 | 1 |
| `capEdit` | 2 | 1 |
| `mentionedAuthors` | 8 | 3 |
| `superdocClient` | 6 | 1 |
| `connectSuperdocClient` | 2 | 1 |
| `connectedSuperdocClient` | 2 | 1 |
| `KeyedCooldown` | 14 | 6 |

Imports of `insights-job-runner`: 10. Imports of `keyed-cooldown`: 5. `authorizedDocumentId({` call sites outside tests: 17 plus the definition. `retryLater({` call sites: 8 plus the definition.

The plan's sweep prints nothing for `?? `, `from '../server'` in `http/`, the deleted names, `describeError` in `projection-messages.ts`, `context.get('user')` and `from '../insights` in `config/`. `requireDocumentRole` appears only in `require-document-role.ts` and `documents-routes.ts`.

## Judgment calls

- **Red commits carry stubs.** The lead required each red test to fail on its own test, not on a missing module, with typecheck green. Each red commit adds a stub of the new symbol that throws `… is not implemented`, so `test-plan.md`'s "Failed to resolve import ./x" lines read "not implemented" instead. Exceptions: `retryLater`'s stub answers `context.json(body)` so the assertion itself fails; the pattern stub is `/(?!)/`; the `withTimeout` stub observes `work` to avoid an unhandled rejection.
- **`cellVolume` had no stub.** It already existed unexported, so at `af4929c` `pnpm typecheck` reports TS2459 in `stack.test.ts`. Every other commit typechecks.
- **Test text adjusted to compile.** `stack.test.ts` builds the cell with `authorKeys: []`. The keyed-cooldown keys test builds `const clock = clockAt(0)` because the file has `clockAt`, not `clock`. `waiting-requests.test.ts` types its reply as `BlocksReply` because `as const` made `blocks` readonly.
- **Lane D files touched minimally.** `insights-routes.test.ts`, `topics-service.test.ts`, `selection-summaries-service.test.ts` and `summaries-service.test.ts` changed only for the renamed identifiers, import paths and `RETRY_AFTER_SECONDS`'s new home. Test names that say "worker" in prose stayed.
- **`libs/history/src/{edit-windows,single-flight}.ts` still exist** in this worktree. The plan assumed lane D had deleted them. They were left untouched.
- **Task 16 moved only `runtime`** below `insights` in `createServices`. `shareLinks` kept its place.
- **Task 11 reads the pipeline lazily.** `onTimelineRead` reads the pipeline only after its status guards. The route used to read it every time, but that second read was always a cache hit with the same key, so nothing observable changed.

## Hypotheses to attack

1. **Retry-After values are unchanged at all eight sites.** Topics refresh 429 and selection 429 send `ceil(remaining / 1000)` through `secondsRoundedUp`. Selection busy 503 sends `ceil(jobRunner.retryAfterMs() / 1000)`. Selection unavailable 503, both versions 202 bodies, the versions 503 from `peek` and the `/text` 503 send `1`. The raw upgrade 503 still sends `30`. Attack: diff each `retryLater` call against `d63679c`.
2. **LRU order and the byte budget.** `get` refreshes recency, `peek` does not. `VersionRooms.cancelIdle`, `scheduleIdle` and `destroy` use `peek`, so the Hocuspocus `connected` and `afterUnloadDocument` hooks never refresh a room. Eviction is oldest first. The version byte budget never evicts the last entry. Each evicted room is destroyed, which clears its idle timer and calls `hocuspocus.destroy()`. Attack: three rooms at a limit of 2, reconnect to the oldest, open a third.
3. **`VersionsService.store` on an already cached key** now moves it to the newest end, where `Map.set` kept its place. `start` runs only for keys that are neither cached nor loading, so this should be unreachable. Attack: look for a path that stores a key twice.
4. **Scheduler request routing.** A Blocks reply's key ignores its `sequence` (the cursor), a Version key includes it, and a failure routes by `requestKind` and touches only that key. `rejectAll` gives each key its own error. `repost` rejects past `MAX_REQUEST_POSTS` with `ProjectionRequestCrashedError`. A Project reply never carries an import error, because `handleProject` hard-codes `importError: null`, so `settleProject` skipping that branch changes nothing.
5. **Shutdown order:** version rooms, Hocuspocus, throttle, scheduler, job runner idle, sockets, connections, HTTP server, then the three databases. On a listen failure, `closeCollaboration` then `closeDatabases`, then the error is rethrown.
6. **Startup:** both directories are checked before any database opens. `resumeProjections` runs right after `createServices`, before `listen`, with the two loops in their old order.
7. **The forget fan-out:** room connections closed, update log, bootstrap memo, pipeline cache, versions, version rooms awaited, scheduler awaited, then topics, summaries and selection cooldowns, then the route removes the file. Attack: `DELETE` a document while a cooldown is running and confirm the cooldown is gone and the file removed.
8. **Middleware order:** a foreign form post with no session gets 403, not 401, on every protected path. `/api/documents` now runs `csrf` and `signedIn` per matching pattern, so both may run twice for one request, as before.
9. **Whole-query parsing:** Hono's `query()` keeps the first value of a repeated key (`results[name] ??= value` in `hono/dist/utils/url.js`), and zod strips unknown keys. `GET …/events` with no `limit` returns at most 50 events. `limit=0` and `limit=` answer 400.
10. **The production worker loads.** `dist/projection-worker.js` bundles `projection-handler`. The build at `a1fbe71` printed `ESM dist/projection-worker.js 5.98 KB`.

## Known gaps

- **E2E not run.** `pnpm test:e2e` was left to CI, as the lead asked. Task 17 Step 1 stays unticked for that reason.
- **A timing test flakes under load.** `timeline-routes.test.ts` "ten thousand events build one pipeline per cursor and answer within the local latency budget" failed twice in full-suite runs (781 ms and 228 ms against a 150 ms budget) and passed in isolation and on every rerun. The baseline at `d63679c` also had one unidentified failure on its first full run and was green on the rerun.
- **The clock is read twice.** `SlidingWindow` reads it once in `record` and again in `count`, and the job runner reads it again in `retryAfterMs`. The plan accepted this.
- **Not covered by a test:** the microtask timing of the awaited upgrade, and object key order in `bandIdentities` for integer-like author keys. The plan already lists both under coverage honesty.

## Merge of main

`6c6ab31` merges `origin/main` at `3352f2a`, which brings PR #10, lane D and PR #12. Seven files conflicted:

- **`server.ts`:** my `startServer` split keeps PR #12's `projectionWorkerFile` parameter, which `createServices` now passes to `ProjectionScheduler`.
- **`projection-scheduler.ts`:** main's `createWorker({ databaseDirectory, projectionWorkerFile })` sits alongside my `isAlive` rename.
- **`insights-job-runner.ts`:** PR #10's `// NB ADR 0011` note moved with the LLM constants to `config/environment.ts`.
- **`server.test.ts`:** my two shutdown pins now pass `prebuiltProjectionWorkerFile()`, like every other `startServer` call.
- **`documents-routes.test.ts`:** main's `forgetPipeline` spy is kept, together with my `services.updateLog` rename.
- **`insights-routes.test.ts` and `selection-summaries-service.test.ts`:** lane D's deletions are kept, and the imports point at `InsightsJobRunner`.

Main's own test edits used old names in two places. `topics-service.test.ts` used `insights.worker` and `projection-scheduler.test.ts` used `scheduler.degraded`. Both were renamed.

Totals after the merge:

| Package | Tests |
|---------|-------|
| libs/types | 10 passed |
| libs/history | 77 passed |
| apps/server | 390 passed, 2 skipped |

`785e6bd` merges `origin/main` again at `5311fc8`, which only changed web telemetry files. It had no conflicts, and the totals above are unchanged.
