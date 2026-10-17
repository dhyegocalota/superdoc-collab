# Test plan: Refinement, server readability (lane C1)

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (a commit hash, log path, counts or command output).

All server commands run as `pnpm --filter @superdoc-history/server exec vitest run <path>`. Library commands use `--filter @superdoc-history/types` and `--filter @superdoc-history/history`.

## The failing test first

Helper tests are committed red, in a commit of their own, before the helper exists. Prove it with `git log --oneline main..` and by checking out each `test(...)` commit.

- [ ] `libs/types/src/constants.test.ts` and `text.test.ts`, plus `libs/history/src/timeline/{runs,bands,stack}.test.ts` (Task 3). Red on: `secondsRoundedUp`, `NON_NEGATIVE_INTEGER_PATTERN`, `presentOrNull`, `runVolume`, `byVolumeDescending` and `cellVolume` not exported.
- [ ] `apps/server/src/http/retry-later.test.ts` (Task 4). Red on: "Failed to resolve import ./retry-later".
- [ ] `apps/server/src/documents/require-document-role.test.ts` (Task 5). Red on: `authorizedDocumentId` is not exported.
- [ ] `apps/server/src/limits/lru-map.test.ts` (Task 6). Red on: "Failed to resolve import ./lru-map".
- [ ] `apps/server/src/limits/keyed-cooldown.test.ts` "keys lists every key…" and `apps/server/src/history/versions-service.test.ts` (Task 7). Red on: `keys`, `keysOfDocument` and `marksAround` missing.
- [ ] `apps/server/src/limits/sliding-window.test.ts` (Task 8). Red on: "Failed to resolve import ./sliding-window".
- [ ] `apps/server/src/limits/with-timeout.test.ts` (Task 9). Red on: "Failed to resolve import ./with-timeout".
- [ ] `apps/server/src/history/projection-handler.test.ts` (Task 13). Red on: "Failed to resolve import ./projection-handler".
- [ ] `apps/server/src/history/waiting-requests.test.ts` (Task 14). Red on: "Failed to resolve import ./waiting-requests".
- [ ] `documents-routes.test.ts` "forgetting a document clears its insights cooldowns after the projection forgets it" (Task 16). Red on: cooldown sizes `[1, 1, 1]` instead of `[0, 0, 0]`.
- [ ] Confirmed every red test failed for the reason above and not for a typo or a fixture error. Evidence is the failing line from each run.

## Pinning tests

Pinning tests fix today's behaviour before a move. Each is green on the commit before its refactor and green after, and is committed on its own before the refactor.

- [ ] `app.test.ts` "a foreign form post without a session is refused as forgery before authentication". Input: a multipart `POST /api/documents` with `origin: https://evil.example` and no cookie. Expected: `403`, before and after Task 10.
- [ ] `app.test.ts` "a same-origin read without a session is unauthorized on every protected path". Input: `GET` on `/api/documents`, `/api/documents/anything` and `/api/share-links/anything/accept` with no cookie. Expected: `[401, 401, 401]`, or the statuses observed before the change, recorded in the test. Same before and after Task 10.
- [ ] `projection-scheduler.test.ts` "a blocks reply resolves its waiter whatever cursor it carries". Input: `blocks(d)`, then a settled `{ kind: blocks, sequence: 7, blocks: [] }`. Expected: resolves with `sequence: 7`, before and after Task 14.
- [ ] `projection-scheduler.test.ts` "a version failure rejects only the waiter of that sequence". Input: `version(d, 1)` and `version(d, 2)`, then a failure for sequence 1 and a reply for sequence 2. Expected: the first rejects with `boom`, and the second resolves with `sequence: 2`.
- [ ] `projection-scheduler.test.ts` "a rebuild imports after forgetting, projects after importing, and ends after projecting". Input: `rebuild`, then Forget, Import and Project replies. Expected, in order:
  1. the last post is Import with `filePath: 'plan.docx'`
  2. then the last post is Project
  3. `isRebuilding` is `true` until the Project reply
  4. then `isRebuilding` is `false`
- [ ] `server.test.ts` "stop closes collaboration in order, then the three databases". Input: `running.stop()`. Expected, by first-call order: `versionRooms.stop`, `hocuspocus.destroy`, `throttle.stop`, `scheduler.stop`, `jobRunner.idle`, then `Database.prototype.close`, called exactly 3 times.
- [ ] `server.test.ts` "startServer rejects instead of hanging when the port is taken", extended. Input: a port that is already bound. Expected: rejects with `code: 'EADDRINUSE'`. `ProjectionScheduler.prototype.stop` is called once, `Database.prototype.close` 3 times, and the scheduler stops before the first database closes.
- [ ] `documents-routes.test.ts` "deleting a document forgets it once through the runtime, then removes the file". Input: `DELETE /api/documents/:id` as owner. Expected: `runtime.forget` is called once, before `storage.remove`, before and after Task 16.

## Unit

- [ ] `constants.test.ts` `secondsRoundedUp`. Input: `[0, 1, 1000, 1001]`. Expected: `[0, 1, 1, 2]`.
- [ ] `constants.test.ts` pattern. Input: `['0', '42', '-1', '1.5', '', ' 1']`. Expected: `[true, true, false, false, false, false]`.
- [ ] `text.test.ts`. Input: `'Ana'`, `''` and `undefined`. Expected: `['Ana', null, null]`.
- [ ] `runs.test.ts` `runVolume`. Input: `{ inserted: 'ab', deleted: 'c' }`. Expected: `3`.
- [ ] `stack.test.ts` `cellVolume`. Input: `undefined` and `{ inserted: 2, deleted: 3 }`. Expected: `[0, 5]`.
- [ ] `bands.test.ts` `byVolumeDescending`. Input: contributors a (volume 2), b (6) and c (2). Expected order: `['b', 'a', 'c']`. A tie keeps its input order.
- [ ] `retry-later.test.ts`. Input: `{ error: 'later' }`, 503, 7 s. Expected: status `503`, header `Retry-After: 7`, body `{ error: 'later' }`.
- [ ] `retry-later.test.ts`. Input: `{ sequence: 4 }`, 202, 1 s. Expected: status `202`, header `Retry-After: 1`, body `{ sequence: 4 }`.
- [ ] `require-document-role.test.ts`. Input: role Editor, path `/d1`. Expected: body `d1`, and `findRole` called with `{ documentId: 'd1', userId: 'u1' }`.
- [ ] Edge: role Reader with minimum Editor. Expected: `DocumentRoleTooLowError`.
- [ ] Edge: no role. Expected: `DocumentNotFoundError`.
- [ ] `lru-map.test.ts` recency. Input: set a and b, get a, set c, at a limit of 2. Expected: evicted `[{ b, 2 }]`, keys `['a', 'c']`.
- [ ] `lru-map.test.ts` overwrite. Input: set a and b, then set a to 9. Expected: evicted `[]`, keys `['b', 'a']`, values `[2, 9]`.
- [ ] `lru-map.test.ts` peek. Input: set a and b, peek a, set c. Expected: evicted `[{ a, 1 }]`, so peek did not refresh a.
- [ ] Edge: `lru-map.test.ts` value budget. Input: a=4, b=4, then c=11, with sum > 10 and size > 1. Expected: evicted `[a, b]` oldest first, and keys `['c']`. The last entry is never evicted.
- [ ] Edge: `lru-map.test.ts` missing key. Expected: `[null, null, false, 0]`.
- [ ] `keyed-cooldown.test.ts` keys. Input: start `a/1`, `a/2` and `b/1`, then forget `a/2`. Expected: `['a/1', 'b/1']`. Every existing cooldown test is green, renamed only.
- [ ] `versions-service.test.ts` `keysOfDocument`. Input: `['d1/1', 'd10/1', 'd1/20']` for `d1`. Expected: `['d1/1', 'd1/20']`. The `d10` prefix trap is excluded.
- [ ] `versions-service.test.ts` `marksAround`. Input: 30 marks at sequences 10 to 300, with sequence 155. Expected: marks at indexes 4 to 24, centred on index 14 (sequence 150).
- [ ] Edge: `marksAround` with sequence 0, before the first mark. Expected: the first 11 marks.
- [ ] `sliding-window.test.ts`. Input: records at t=0 and t=500 with a 1000 ms window. Expected:

  | At | `[count, oldest]` |
  |----|-------------------|
  | 999 | `[2, 0]` |
  | 1000 | `[1, 500]` |
  | 1500 | `[0, null]` |
- [ ] `with-timeout.test.ts`: resolved work. Expected: `'done'` and zero pending timers.
- [ ] Edge: `with-timeout.test.ts`, rejected work. Expected: rejects with `boom`.
- [ ] Edge: `with-timeout.test.ts`, hanging work with `onTimeout` returning `'late'`. Expected: `'late'` after 1000 ms.
- [ ] Edge: `with-timeout.test.ts`, hanging work with `onTimeout` throwing `ImportTimeoutError(1000)`. Expected: rejects with "The import took longer than 1000 ms."
- [ ] `projection-handler.test.ts` Project on an empty log. Expected: `{ kind: project, documentId: d1, cursor: null, importError: null }`.
- [ ] `projection-handler.test.ts` Import, with `importRevisions` resolving `'boom'`. Expected: `{ kind: import, cursor: null, importError: 'boom' }`. `importRevisions` gets the request object, and `readModel.cursor` is called before `importRevisions`.
- [ ] `projection-handler.test.ts` Forget. Expected: `replays.forget` before `readModel.forget`, and the reply cursor is `null`.
- [ ] Edge: `projection-handler.test.ts` Blocks of an unprojected document. Expected: `{ kind: blocks, sequence: 0, blocks: [] }`.
- [ ] Edge: `projection-handler.test.ts` Version without a mark. Expected: rejects with `MissingVersionMarkError`.
- [ ] `waiting-requests.test.ts` keys. Expected: `['version:d1@3', 'blocks:d1', 'blocks:d1']`. A blocks cursor of 7 or null gives the same key.
- [ ] `waiting-requests.test.ts` join. Input: two `add`s of the same blocks request. Expected: `[true, false]`, and one reply resolves both waiters with the same reply.
- [ ] Edge: `waiting-requests.test.ts` repost past the limit. Input: two reposts with `maxPosts: 2`. Expected: one post, then rejection with `ProjectionRequestCrashedError`.
- [ ] Edge: `waiting-requests.test.ts` `rejectAll`. Expected: two keys receive two distinct error instances.
- [ ] `documents-routes.test.ts` fan-out. Input: three cooldowns started, then `runtime.forget(d)`. Expected: sizes `[0, 0, 0]`, and first-call order `scheduler.forget`, then topics, summaries and selection `forget`.
- [ ] Every pre-existing server, history and types unit test is green with only renamed identifiers and import paths changed. Expected: `git diff main.. -- '*.test.ts'` shows no changed assertion apart from the identifier renames listed in `spec.md`.
- [ ] `pnpm typecheck`. Expected: exit 0.
- [ ] `pnpm test:unit`. Expected: exit 0, and test counts per package recorded. The server count is the post-lane-D count plus the new tests.

## E2E (Playwright specs)

- [ ] `pnpm test:e2e`. Expected: all specs green: `auth`, `collaboration`, `documents`, `selection-summary`, `time-travel`, `timeline` and `topics-on-open`. Record the log path.
- [ ] `e2e/documents.spec.ts` deletion walk. Expected: a deleted document disappears from the list and its URL shows the unavailable notice. This exercises the Task 16 fan-out end to end.
- [ ] `e2e/time-travel.spec.ts`. Expected: scrubbing loads versions, so the projection worker split (Task 13), the scheduler routing (Task 14) and the `LruMap` version cache (Task 6) work in the built stack.
- [ ] `e2e/selection-summary.spec.ts` and `e2e/topics-on-open.spec.ts`. Expected: summaries and topics appear against the fake OpenRouter, so the job runner rename, `SlidingWindow` and the prompts split work.

## Prove it for real (Playwright MCP)

No UI is touched, so there is no Playwright MCP walk and no `/check-ui`. Instead the tester exercises the HTTP and process surface of a real server built from this branch:

- [ ] Build and start. Input: `pnpm --filter @superdoc-history/server build`, then `node apps/server/dist/main.js` with a scratch `DATABASE_DIR`. Expected: the log line `listening on :<port>`, and `dist/projection-worker.js` exists.
- [ ] Retry-After on a pending version. Input: `GET /api/documents/:id/versions/:sequence` right after the first edit. Expected: `202` with `Retry-After: 1`, then `200` once loaded.
- [ ] Retry-After on a topics refresh. Input: two `POST /api/documents/:id/topics/refresh` within 30 s as editor. Expected: `202`, then `429` with `Retry-After` between `1` and `30`.
- [ ] Rejected input. Input: `GET /api/documents/:id/events?limit=0`. Expected: `400` with the existing invalid-events message. `GET …/events` with no query returns at most 50 events.
- [ ] Unauthorized and forbidden. Input: `GET /api/documents/:id/timeline` without a cookie. Expected: `401`. As a stranger: `404 { error: 'Not found' }`. As a reader on `POST …/topics/refresh`: `403 { error: 'Forbidden' }`.
- [ ] Deletion. Input: `DELETE /api/documents/:id` as owner. Expected: `204`. A following `GET` answers `404`, and the document's file is gone from `DATABASE_DIR/documents`.
- [ ] Shutdown. Input: `kill -TERM <pid>`. Expected: the process exits with code 0 within 10 s and leaves no `-wal` lock that blocks a restart. A restart on the same `DATABASE_DIR` lists the remaining documents.
- [ ] Console and network clean. Expected: the server log has no `Projection worker error` and no `Insights job failed` lines during the walk.

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: version-room eviction order is unchanged. Attack: open three version rooms at a limit of 2 and reconnect to the oldest (Hocuspocus `connected`) before opening the third. Today's `Map.get` did not refresh recency, so the oldest must still be evicted, which proves `peek` is used in the hooks. Result: <refuted | held>
- [ ] Claim 2: a Project reply never carries an import error, so `settleProject` may skip the import-error branch. Attack: read `projection-handler.ts` and every `postMessage` in the worker for any Project reply built with a non-null `importError`. Result: <refuted | held>
- [ ] Claim 3: Retry-After values are byte-for-byte identical at all eight sites. Attack: diff every `retryLater` call's `retryAfterSeconds` against the pre-lane code on `main`, including the two `202` responses in `versions-routes.ts`. Result: <refuted | held>

## Coverage honesty

What is not tested and why:

- **The microtask timing of the awaited upgrade (3.9).** Today's `.then(onFulfilled, onRejected)` and the new `await … .catch` differ by one microtask. No caller can observe it, and the attach-collaboration suite covers every admission.
- **Object key order in `bandIdentities` after 4.11.** It changes only for author keys that look like integers. Better Auth ids are random alphanumeric strings, and imported authors are prefixed `imported:`, so the risk is accepted.
- **A rebuild whose `build()` throws, which now leaves its stale pipeline marked recently used.** There is no failing build in the code base to trigger it, and at worst one cache entry evicts later than before.
- **Two lookups of `Date.now()` in the restart budget.** `record` and `count` each read the clock, so a restart counted at the very edge of the window could prune one tick earlier. The 60 s window and 5-restart limit make it unobservable.
- **The web half of top-10 item 7 and every web call site of the new `libs/` helpers.** Lane C2 owns and tests them.
