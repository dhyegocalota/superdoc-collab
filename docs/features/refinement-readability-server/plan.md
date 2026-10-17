# Refinement: server readability (lane C1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make `apps/server` and the touched parts of `libs/` read as one engineer's code without changing one observable behaviour.

**Architecture:** first straighten the import graph, then apply the renames in one mechanical commit. Next, introduce five small shared helpers under `apps/server/src/limits/`, `http/`, `logging/` and `documents/` and adopt them. Finally, split the four long units: the projection scheduler, the projection worker, `startServer` and the document-forget fan-out. Each split is pinned by a test before it moves.

**Tech Stack:** Node 24, TypeScript, Hono 4.13, Hocuspocus 2, better-sqlite3, zod 4.6, Vitest.

**Spec:** `spec.md` (same folder)

**Tier:** 🟡
**Seam:** module boundaries inside `apps/server/src`. Nothing crosses the HTTP, WebSocket or worker-message wire differently.
**Assumptions (decided, owner can override):**
- Paths are as they will be after lanes B and D: Prettier is applied, `deploy/` is now `repository-shape/`, and `single-flight` and `edit-windows` are deleted. Lane D also folds several `selection-summaries-service` and `topics-service` tests into `insights-routes.test.ts`, so suites are named by directory (`src/insights`), not by file.
- Line numbers are deliberately absent because lane B's formatting moves them. Every step names the symbol.
- `LruMap` keeps the approved name despite the acronym. `GcFreeReplays` is the precedent.
- A pinning test, one that is green before and after a move, is committed on its own before the move. A helper test is committed red before the helper exists. Both follow `docs/learnings/2026-10-16-commit-the-failing-test-first.md`.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/server/src/**`, `libs/history/src/timeline/{runs,bands,stack}.ts` and their tests, `libs/types/src/{constants,http,text,index}.ts` and their tests | `developer-c1` (one developer, tasks in order) |

## Sequencing

One developer runs the tasks in order. `server.ts`, `projection-scheduler.ts`, `versions-service.ts` and the route files are touched by several tasks, so parallel groups would collide on the same lines. Task 1 is first because later imports depend on it, and Task 2 renames before any helper so new code is written with the final names. Tasks 3 to 9 introduce helpers, Tasks 10 to 12 simplify conditionals, and Tasks 13 to 16 are the splits. Task 17 is the lane gate.

## Global Constraints

- No comments, no `else`, flat `if`s with early returns, no nested `if`.
- Never `?? defaultValue`. Only `undefined → null` normalisation at a boundary whose type says `T | null`.
- Enums over string literals. Constants live at the top of the file or in `libs/types`.
- Function declarations, typed. Named parameters whenever there is more than one parameter.
- No `.js` in imports, no acronyms in new identifiers (`LruMap` excepted, see Assumptions), and array methods over loops.
- Behaviour-preserving: status codes, bodies, `Retry-After` values, log message prefixes, SQLite schemas and worker messages stay the same.
- Every task ends with `pnpm typecheck`, the named suites green, and one commit. Never `git add -A`, `git add .` or `--no-verify`.
- Commit bodies end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Request routing in the scheduler.** A Blocks reply carries the read-model cursor in `sequence`, but its key must ignore it. A Version key must include the sequence. A failure reply routes by `requestKind` and touches only that key. *Pinned in Task 14 by the waiting-requests test and the two routing pins in `projection-scheduler.test.ts`.*
2. **Retry-After values.** These stay as they are:
   - topics refresh 429: `ceil(remaining / 1000)`
   - selection 429: `ceil(remaining / 1000)`
   - selection busy 503: `ceil(jobRunner.retryAfterMs() / 1000)`
   - selection unavailable 503: `1`
   - versions 202 and 503: `1`
   - raw upgrade 503: `30` (this one is not touched)

   *Pinned in Task 4 by `retry-later.test.ts`, plus the existing route suites and `testing/timeline-client.ts`.*
3. **LRU eviction order and the byte budget.** `get` refreshes recency and `peek` does not, so Hocuspocus `connected` and `afterUnloadDocument` hooks must use `peek`. The oldest entries are evicted first, and the byte budget never evicts the last entry. An evicted version room is destroyed, which clears its idle timer and calls `hocuspocus.destroy()`. *Pinned in Task 6 by `lru-map.test.ts` and the three existing eviction tests.*
4. **Shutdown order.** The order stays as it is today:
   1. version rooms
   2. Hocuspocus
   3. throttle
   4. scheduler
   5. job runner idle
   6. sockets
   7. connections
   8. HTTP server
   9. three databases

   On a listen failure, collaboration closes, then the databases, then the error is rethrown. *Pinned in Task 15 by two `server.test.ts` tests.*
5. **The document-forget fan-out.** The order stays as it is today:
   1. room connections closed
   2. update log
   3. bootstrap memo
   4. pipeline cache
   5. versions
   6. version rooms, awaited
   7. scheduler, awaited
   8. topics, summaries and selection cooldowns
   9. the file, removed by the route

   *Pinned in Task 16 by `documents-routes.test.ts`.*

---

### Task 1: Straighten the import graph

Covers 4.9, 4.14, 4.10, 5.6 and 4.7.

**Files:**
- Modify: `apps/server/src/http/app.ts`, `apps/server/src/server.ts`, `apps/server/src/config/environment.ts`, `apps/server/src/insights/insights-worker.ts`, `apps/server/src/testing/test-server.ts`, `apps/server/src/collaboration/version-rooms.ts`, `apps/server/src/collaboration/attach-collaboration.ts`, `apps/server/src/history/projection-messages.ts`, and every importer of `describeError`, `LLM_MAX_CONCURRENT_JOBS` and `LLM_MAX_CALLS_PER_HOUR`
- Create: `apps/server/src/logging/describe-error.ts`

**Interfaces:**
- Produces: `NOT_FOUND_MESSAGE` exported from `http/app.ts`. `ServerServices = AppServices & { hocuspocus: Hocuspocus; throttle: ProjectionThrottle }`. `LLM_MAX_CONCURRENT_JOBS` and `LLM_MAX_CALLS_PER_HOUR` exported from `config/environment.ts`. `describeError(error: unknown): string` from `logging/describe-error.ts`.

- [x] **Step 1: Move `NOT_FOUND_MESSAGE` into the app.** In `http/app.ts`, delete `import { NOT_FOUND_MESSAGE } from '../server';` and add `export const NOT_FOUND_MESSAGE = 'Not found';` beside `FORBIDDEN_MESSAGE`. In `server.ts`, delete the declaration and import it: `import { createApp, NOT_FOUND_MESSAGE, type AppServices, type InsightsServices } from './http/app';`. `rg -w NOT_FOUND_MESSAGE apps/server/src` shows 4 references in 2 files before the change.

- [x] **Step 2: Derive `ServerServices`.**

```ts
export type ServerServices = AppServices & { hocuspocus: Hocuspocus; throttle: ProjectionThrottle };
```

Drop the now-unused type imports from `server.ts` (`DocumentFileStorage`, `ReadModel` and the others that typecheck reports as unused).

- [x] **Step 3: Move the LLM defaults into config.** In `config/environment.ts`, replace `import { LLM_MAX_CALLS_PER_HOUR, LLM_MAX_CONCURRENT_JOBS } from '../insights/insights-worker';` with:

```ts
export const LLM_MAX_CONCURRENT_JOBS = 2;
export const LLM_MAX_CALLS_PER_HOUR = 60;
```

In `insights/insights-worker.ts`, delete both constants and `import { LLM_MAX_CALLS_PER_HOUR, LLM_MAX_CONCURRENT_JOBS } from '../config/environment';`. Repoint every other importer, including `testing/test-server.ts` and the tests. Count before: `rg -w 'LLM_MAX_CONCURRENT_JOBS|LLM_MAX_CALLS_PER_HOUR' apps/server/src` gives 44 references in 8 files.

- [x] **Step 4: Import `VersionEndpoint` from its owner.** Delete `export type { VersionEndpoint };` from `collaboration/version-rooms.ts`. In `attach-collaboration.ts`, import `type VersionEndpoint` from `'../history/versions-service'`.

- [x] **Step 5: Move `describeError`.** Create `apps/server/src/logging/describe-error.ts`:

```ts
const NEWLINE = '\n';
const SPACE = ' ';

export function describeError(error: unknown): string {
  return String(error).replaceAll(NEWLINE, SPACE);
}
```

Delete it from `history/projection-messages.ts` and repoint the 7 importers (`rg -l describeError apps/server/src`: projection-worker, projection-scheduler, versions-service, insights-worker, summaries-service, selection-summaries-service, topics-service). In `version-rooms.ts`, `destroyInBackground` switches from `${String(error)}` to `${describeError(error)}`. That is the only log-text change in the lane: a multi-line error now logs on one line, like every other server log.

- [x] **Step 6: Verify.** `rg -n "from '\.\./server'" apps/server/src/http` prints nothing. `rg -n "from '\.\./insights" apps/server/src/config` prints nothing. `pnpm typecheck` is green. `pnpm --filter @superdoc-history/server test:unit` is green.

- [x] **Step 7: Commit.** — evidence: `1220627`

```bash
git add apps/server/src
git commit -m "refactor(server): straighten the import graph"
```

### Task 2: Rename what hides its meaning

Covers 1.1, 1.3, 1.4, 1.5, 1.7 to 1.13 and 1.18. One mechanical commit.

**Files:**
- Rename: `apps/server/src/insights/insights-worker.ts` to `insights-job-runner.ts`, and `insights-worker.test.ts` to `insights-job-runner.test.ts` (with `git mv`)
- Modify: every file `rg` lists below

**Interfaces:**
- Produces:
  - `InsightsJobRunner`
  - `InsightsServices.jobRunner`
  - the `jobRunner` constructor parameter of `TopicsService`, `SummariesService` and `SelectionSummariesService`
  - `ProjectionScheduler.isDegraded`
  - `AppServices.updateLog`
  - `pipelineCacheKey`
  - `mentionedAuthors`
  - `capEdit`

  Later tasks use exactly these names.

- [x] **Step 1: `InsightsWorker` → `InsightsJobRunner`.**

```bash
git mv apps/server/src/insights/insights-worker.ts apps/server/src/insights/insights-job-runner.ts
git mv apps/server/src/insights/insights-worker.test.ts apps/server/src/insights/insights-job-runner.test.ts
```

Replace the class name (28 references in 8 files) and the import path `insights-worker` (14 imports). Rename the `worker` field of `InsightsServices`, the `worker` constructor parameter and private field in the three insights services, and the `insightsWorker` local in `server.ts` (6 references) to `jobRunner`. That is 38 production references. In tests, rename only the insights job runner. `rg -w worker apps/server/src -g '*.test.ts'` returns 155 hits, and those in the version-room, collaboration and environment tests mean the projection worker and stay. `server.test.ts` "startServer hands the configured LLM limits to the insights worker" destructures `const { jobRunner } = running.services.insights;`.

- [x] **Step 2: Scheduler booleans and sets.** In `projection-scheduler.ts`:

| From | To | References |
|------|----|-----------|
| `alive` | `isAlive` | 3 |
| `degraded` | `isDegraded` | 17 in 4 files: `timeline-service.ts`, `timeline-routes.test.ts`, `projection-scheduler.test.ts` |
| `rerun` | `documentsNeedingRerun` | 8, including `SchedulerInternals` in `projection-scheduler.test.ts` |
| `rebuilding` | `rebuildingDocuments` | 10 |
| `reimported` | `reimportedDocuments` | 5 |

Test names that use the words in prose stay.

- [x] **Step 3: `log` → `updateLog` on the server.** Rename these:
  - the `AppServices` field
  - the `server.ts` local
  - the parameters of `createCollaborationServer`, `createClientDeclarer` and `createCollaborationRuntime`
  - the module constant in `projection-worker.ts`
  - every `services.log`

  That is 25 production references in 9 files and 19 `services.log` in tests. `libs/history` parameters keep their name, so calls read `materialize({ log: updateLog, documentName, untilSequence })`, `compact({ log: updateLog, ... })`, `projectPending({ log: updateLog, readModel, documentName })` and `replays.version({ log: updateLog, ... })`.

- [x] **Step 4: Timeline service names.**
  - `topicStampOf` → `topicsUpdatedAtFor` (2 references).
  - `needle` → `searchText` (5 references: `timeline-service.ts` and `libs/history/src/timeline/runs.ts`).
  - `pipelineKey` → `pipelineCacheKey` (2 references), with its four parts named:

```ts
const PIPELINE_KEY_SEPARATOR = ':';

export function pipelineCacheKey({ services, documentId }: { services: AppServices; documentId: string }): string {
  const cursor = services.readModel.cursor(documentId);
  const clientCount = services.updateLog.clientIdentities(documentId).size;
  const declaredCount = [...services.updateLog.identitySources(documentId).values()].filter((source) => source === IdentitySource.Declared).length;
  const topicsUpdatedAt = services.insightsRepository.updatedAt(documentId);
  return [cursor, clientCount, declaredCount, topicsUpdatedAt].join(PIPELINE_KEY_SEPARATOR);
}
```

- [x] **Step 5: Insights names.**
  - `topics-service.ts`: `named` → `blocksWithText` (4 references).
  - `selection-summaries-service.ts`: private `resolve` → `readNonEmptySelection` (3 references).
  - `prompts.ts`: `capRun` → `capEdit` (2 references) and `authorsNamed` → `mentionedAuthors` (8 references in 3 files, including `prompts.test.ts`).

- [x] **Step 6: Drop the `choice` alias where narrowing allows (1.12).** In `TopicsService.compute`, use `this.languageModel.availability`, `this.languageModel.reason` and `this.languageModel.model` directly. Do the same in `SummariesService.summarize`. In `SelectionSummariesService.request`, keep a local because the `job` closure reads the narrowed model, and rename it `const languageModel = this.languageModel;`. `rg -w choice apps/server/src/insights` gives 23 before. After, the only matches are in tests.

- [x] **Step 7: SuperDoc client names (1.18).** In `projection-worker.ts`:
  - `sdkConnection` → `superdocClient` (7 references)
  - `connectSdk` → `connectSuperdocClient` (2 references)
  - `connectedSdk` → `connectedSuperdocClient` (2 references)

- [x] **Step 8: Verify.**
  - `rg -w 'InsightsWorker|insightsWorker|topicStampOf|pipelineKey|needle|capRun|authorsNamed|sdkConnection|connectSdk|connectedSdk' apps/server/src libs/history/src` prints nothing.
  - `rg 'services\.log\b' apps/server/src` prints nothing.
  - `pnpm typecheck` is green.
  - `pnpm --filter @superdoc-history/server test:unit` and `pnpm --filter @superdoc-history/history test:unit` are green.

- [x] **Step 9: Commit.** — evidence: `1365e1a`

```bash
git add apps/server/src libs/history/src/timeline/runs.ts
git commit -m "refactor(server): rename names that hide their meaning"
```

### Task 3: Shared library helpers

Covers 4.6, 4.8, 4.17, 4.18 and 4.19.

**Files:**
- Modify: `libs/types/src/constants.ts`, `libs/types/src/index.ts`, `libs/history/src/timeline/{runs,stack,bands}.ts`, `apps/server/src/config/environment.ts`, `apps/server/src/insights/{selection-summaries-service,topics-service}.ts`, `apps/server/src/history/{versions-routes,history-routes,timeline-query}.ts`
- Create: `libs/types/src/text.ts`, `libs/types/src/constants.test.ts`, `libs/types/src/text.test.ts`, `libs/history/src/timeline/stack.test.ts`
- Test: `libs/history/src/timeline/runs.test.ts`, `libs/history/src/timeline/bands.test.ts`

**Interfaces:**
- Produces: `secondsRoundedUp(milliseconds: number): number`, `NON_NEGATIVE_INTEGER_PATTERN: RegExp` and `presentOrNull(value: string | undefined): string | null` from `@superdoc-history/types`. `runVolume(run: Pick<EditRun, 'inserted' | 'deleted'>): number`, `cellVolume(cell: TimelineCell | undefined): number` and `byVolumeDescending(left: TimelineContributor, right: TimelineContributor): number` from `@superdoc-history/history/timeline`. Lane C2 adopts these on the web.

- [x] **Step 1: Write the failing tests.**

`libs/types/src/constants.test.ts`:

```ts
import { expect, test } from 'vitest';
import { NON_NEGATIVE_INTEGER_PATTERN, secondsRoundedUp } from './constants';

test('secondsRoundedUp rounds a partial second up', () => {
  expect([0, 1, 1000, 1001].map(secondsRoundedUp)).toEqual([0, 1, 1, 2]);
});

test('the non-negative integer pattern accepts digits only', () => {
  expect(['0', '42', '-1', '1.5', '', ' 1'].map((value) => NON_NEGATIVE_INTEGER_PATTERN.test(value))).toEqual([true, true, false, false, false, false]);
});
```

`libs/types/src/text.test.ts`:

```ts
import { expect, test } from 'vitest';
import { presentOrNull } from './text';

test('presentOrNull keeps text and turns an empty or missing value into null', () => {
  expect([presentOrNull('Ana'), presentOrNull(''), presentOrNull(undefined)]).toEqual(['Ana', null, null]);
});
```

Append to `libs/history/src/timeline/runs.test.ts`:

```ts
test('runVolume counts inserted and deleted characters', () => {
  expect(runVolume({ inserted: 'ab', deleted: 'c' })).toBe(3);
});
```

`libs/history/src/timeline/stack.test.ts`:

```ts
import { expect, test } from 'vitest';
import { cellVolume } from './stack';

test('cellVolume of a missing cell is zero', () => {
  expect([cellVolume(undefined), cellVolume({ inserted: 2, deleted: 3 })]).toEqual([0, 5]);
});
```

If `TimelineCell` has more fields than `inserted` and `deleted`, build the cell with the fixture helper already used in `bands.test.ts`.

Append to `libs/history/src/timeline/bands.test.ts`:

```ts
test('byVolumeDescending puts the largest contributor first and keeps ties in order', () => {
  const contributor = (authorKey: string, inserted: number) => ({ authorKey, inserted, deleted: 1, wordsInserted: 0, wordsDeleted: 0 });
  expect([contributor('a', 1), contributor('b', 5), contributor('c', 1)].sort(byVolumeDescending).map((each) => each.authorKey)).toEqual(['b', 'a', 'c']);
});
```

- [x] **Step 2: Run the tests and see them fail.** `pnpm --filter @superdoc-history/types exec vitest run` and `pnpm --filter @superdoc-history/history exec vitest run src/timeline`. They fail on missing exports such as `secondsRoundedUp is not a function` and `presentOrNull` not exported.

- [x] **Step 3: Commit the red tests.** Add only the test files listed under Files, then `git commit -m "test(types,history): pin the shared volume, seconds and presence helpers"`. — evidence: `af4929c`

- [x] **Step 4: Implement.**

In `libs/types/src/constants.ts`, after `MIN_RETRY_AFTER_MS`:

```ts
export const NON_NEGATIVE_INTEGER_PATTERN = /^\d+$/;

export function secondsRoundedUp(milliseconds: number): number {
  return Math.ceil(milliseconds / SECOND_MS);
}
```

Create `libs/types/src/text.ts`:

```ts
export function presentOrNull(value: string | undefined): string | null {
  if (!value) return null;
  return value;
}
```

Add `export * from './text';` to `libs/types/src/index.ts`.

In `runs.ts`:

```ts
export function runVolume(run: Pick<EditRun, 'inserted' | 'deleted'>): number {
  return run.inserted.length + run.deleted.length;
}
```

In `stack.ts`, export the existing `cellVolume`. In `bands.ts`:

```ts
export function byVolumeDescending(left: TimelineContributor, right: TimelineContributor): number {
  return right.inserted + right.deleted - (left.inserted + left.deleted);
}
```

Then use the helpers in `bands.ts`: in `buildBands`, `volume: runsOf({ runs: matchedRuns, bandId: band.id }).reduce((sum, run) => sum + runVolume(run), 0)`; in `contributorsByBand`, `[...byAuthor.values()].sort(byVolumeDescending)`.

- [x] **Step 5: Adopt on the server.**
  - `environment.ts`: delete the local `presentOrNull` and import it from `@superdoc-history/types`.
  - `selection-summaries-service.ts` `readNonEmptySelection`: `snapshot.runs.filter((run) => runVolume(run) > 0)`, imported from `@superdoc-history/history`, which re-exports the timeline module.
  - `selection-summaries-service.ts`, two sites, and `topics-service.ts`, one site: `Math.ceil(x / SECOND_MS)` → `secondsRoundedUp(x)`.
  - `versions-routes.ts` and `history-routes.ts`: delete the local `NON_NEGATIVE_INTEGER_PATTERN` and import it.
  - `timeline-query.ts`: delete `DIGITS_PATTERN` and use `NON_NEGATIVE_INTEGER_PATTERN`.

- [x] **Step 6: Run the tests and see them pass.** Run the two library suites from Step 2, then `pnpm typecheck`. Then `pnpm --filter @superdoc-history/server exec vitest run src/insights src/history src/config`.

- [x] **Step 7: Commit.** Add the files listed under Files, then `git commit -m "refactor(types,history,server): share the volume, seconds and presence helpers"`. — evidence: `b249b1c`

### Task 4: One Retry-After response helper

Covers 4.5.

**Files:**
- Create: `apps/server/src/http/retry-later.ts`, `apps/server/src/http/retry-later.test.ts`
- Modify: `libs/types/src/http.ts`, `apps/server/src/insights/insights-routes.ts`, `apps/server/src/history/versions-routes.ts`, `apps/server/src/testing/timeline-client.ts`

**Interfaces:**
- Produces: `retryLater({ context, body, status, retryAfterSeconds }: { context: Context; body: Record<string, string | number>; status: RetryStatus; retryAfterSeconds: number }): Response`, where `RetryStatus = HttpStatus.Accepted | HttpStatus.TooManyRequests | HttpStatus.ServiceUnavailable`. Also `RETRY_AFTER_SECONDS = 1` from `@superdoc-history/types`.

- [x] **Step 1: Write the failing test** `apps/server/src/http/retry-later.test.ts`:

```ts
import { HttpStatus, RETRY_AFTER_HEADER } from '@superdoc-history/types';
import { Hono } from 'hono';
import { expect, test } from 'vitest';
import { retryLater } from './retry-later';

test('an error body carries its status and Retry-After in whole seconds', async () => {
  const app = new Hono().get('/', (context) => retryLater({ context, body: { error: 'later' }, status: HttpStatus.ServiceUnavailable, retryAfterSeconds: 7 }));
  const response = await app.request('/');
  expect([response.status, response.headers.get(RETRY_AFTER_HEADER), await response.json()]).toEqual([HttpStatus.ServiceUnavailable, '7', { error: 'later' }]);
});

test('an accepted body keeps its shape', async () => {
  const app = new Hono().get('/', (context) => retryLater({ context, body: { sequence: 4 }, status: HttpStatus.Accepted, retryAfterSeconds: 1 }));
  const response = await app.request('/');
  expect([response.status, response.headers.get(RETRY_AFTER_HEADER), await response.json()]).toEqual([HttpStatus.Accepted, '1', { sequence: 4 }]);
});
```

- [x] **Step 2: Run it and see it fail.** `pnpm --filter @superdoc-history/server exec vitest run src/http/retry-later.test.ts` fails with "Failed to resolve import ./retry-later".

- [x] **Step 3: Commit the red test.** `git add apps/server/src/http/retry-later.test.ts && git commit -m "test(server): pin the Retry-After response helper"`. — evidence: `d2874d3`

- [x] **Step 4: Implement** `apps/server/src/http/retry-later.ts`:

```ts
import { RETRY_AFTER_HEADER, type HttpStatus } from '@superdoc-history/types';
import type { Context } from 'hono';

type RetryStatus = HttpStatus.Accepted | HttpStatus.TooManyRequests | HttpStatus.ServiceUnavailable;

export function retryLater({ context, body, status, retryAfterSeconds }: { context: Context; body: Record<string, string | number>; status: RetryStatus; retryAfterSeconds: number }): Response {
  return context.json(body, status, { [RETRY_AFTER_HEADER]: String(retryAfterSeconds) });
}
```

Add `export const RETRY_AFTER_SECONDS = 1;` to `libs/types/src/http.ts` under `RETRY_AFTER_HEADER`.

- [x] **Step 5: Adopt it at all eight call sites.** The Retry-After value at each site stays exactly as it is today.

`insights-routes.ts`:

```ts
if (result.outcome === RefreshOutcome.TooSoon) return retryLater({ context, body: { error: TOPICS_REFRESH_TOO_SOON_MESSAGE }, status: HttpStatus.TooManyRequests, retryAfterSeconds: result.retryAfterSeconds });
if (result.outcome === SelectionRequestOutcome.TooSoon) return retryLater({ context, body: { error: SELECTION_SUMMARY_TOO_SOON_MESSAGE }, status: HttpStatus.TooManyRequests, retryAfterSeconds: result.retryAfterSeconds });
if (result.outcome === SelectionRequestOutcome.Unavailable) return retryLater({ context, body: { error: result.reason }, status: HttpStatus.ServiceUnavailable, retryAfterSeconds: RETRY_AFTER_SECONDS });
if (result.outcome === SelectionRequestOutcome.Busy) return retryLater({ context, body: { error: LLM_BUSY_MESSAGE }, status: HttpStatus.ServiceUnavailable, retryAfterSeconds: result.retryAfterSeconds });
```

`versions-routes.ts`: delete `retryHeaders` and the local `RETRY_AFTER_SECONDS`. The two `202 { sequence }` responses, the `503 VERSION_FAILED_ERROR` from `peek`, and the `503` from the `/text` catch all become `retryLater({ ..., retryAfterSeconds: RETRY_AFTER_SECONDS })`.

Repoint `RETRY_AFTER_SECONDS` in `testing/timeline-client.ts` and `insights-routes.ts` to `@superdoc-history/types`. Before the change, `rg -w RETRY_AFTER_SECONDS apps/server/src` gives 9 references in 4 files.

- [x] **Step 6: Run the tests and see them pass.** Run the Step 2 command, then `pnpm typecheck`. Then `pnpm --filter @superdoc-history/server exec vitest run src/http src/insights src/history/versions-routes.test.ts src/history/timeline-routes.test.ts`.

- [x] **Step 7: Commit.** `git commit -m "refactor(server): answer every retry through one helper"` with the files listed under Files. — evidence: `1ec8170`

### Task 5: One route prelude

Covers 4.4.

**Files:**
- Modify: `apps/server/src/documents/require-document-role.ts`, `documents-routes.ts`, `share-links-routes.ts`, `apps/server/src/insights/insights-routes.ts`, `apps/server/src/history/{versions-routes,timeline-routes,history-routes}.ts`
- Create: `apps/server/src/documents/require-document-role.test.ts`

**Interfaces:**
- Produces: `authorizedDocumentId({ context, documents, minimumRole }: { context: Context<SignedIn>; documents: DocumentsRepository; minimumRole: DocumentRole }): string`. It throws `DocumentNotFoundError` or `DocumentRoleTooLowError`, which `app.onError` already maps to 404 and 403.

- [x] **Step 1: Write the failing test** `apps/server/src/documents/require-document-role.test.ts`:

```ts
import { DocumentRole, type SessionUser } from '@superdoc-history/types';
import { Hono } from 'hono';
import { expect, test, vi } from 'vitest';
import type { SignedIn } from '../http/require-user';
import type { DocumentsRepository } from './documents-repository';
import { authorizedDocumentId } from './require-document-role';

const USER: SessionUser = { id: 'u1', name: 'Ana', email: 'ana@example.com' };

function appWith(role: DocumentRole | null) {
  const findRole = vi.fn(() => role);
  const documents = { findRole } as unknown as DocumentsRepository;
  const app = new Hono<SignedIn>();
  app.use(async (context, next) => {
    context.set('user', USER);
    await next();
  });
  app.onError((error, context) => context.text(error.constructor.name, 500));
  app.get('/:documentId', (context) => context.text(authorizedDocumentId({ context, documents, minimumRole: DocumentRole.Editor })));
  return { app, findRole };
}

test('an editor gets the document id from the path', async () => {
  const { app, findRole } = appWith(DocumentRole.Editor);
  expect(await (await app.request('/d1')).text()).toBe('d1');
  expect(findRole).toHaveBeenCalledWith({ documentId: 'd1', userId: USER.id });
});

test('a reader is refused with the role error', async () => {
  expect(await (await appWith(DocumentRole.Reader).app.request('/d1')).text()).toBe('DocumentRoleTooLowError');
});

test('a stranger is refused with the not-found error', async () => {
  expect(await (await appWith(null).app.request('/d1')).text()).toBe('DocumentNotFoundError');
});
```

- [x] **Step 2: Run it and see it fail.** `pnpm --filter @superdoc-history/server exec vitest run src/documents/require-document-role.test.ts` fails because `authorizedDocumentId` is not exported.

- [x] **Step 3: Commit the red test.** `git commit -m "test(server): pin the authorized document prelude"` with the test file only. — evidence: `4d8c921`

- [x] **Step 4: Implement** in `require-document-role.ts`:

```ts
const DOCUMENT_ID_PARAM = 'documentId';

export function authorizedDocumentId({ context, documents, minimumRole }: { context: Context<SignedIn>; documents: DocumentsRepository; minimumRole: DocumentRole }): string {
  const documentId = context.req.param(DOCUMENT_ID_PARAM);
  if (!documentId) throw new DocumentNotFoundError();
  requireDocumentRole({ documents, documentId, userId: context.var.user.id, minimumRole });
  return documentId;
}
```

Add `import type { Context } from 'hono';` and `import type { SignedIn } from '../http/require-user';`. The guard exists because Hono types `param(key: string)` as `string | undefined` on an untyped path.

- [x] **Step 5: Adopt it in 17 handlers.** Each pair:

```ts
const documentId = context.req.param('documentId');
requireDocumentRole({ documents: services.documents, documentId, userId: context.get('user').id, minimumRole: DocumentRole.Reader });
```

becomes:

```ts
const documentId = authorizedDocumentId({ context, documents: services.documents, minimumRole: DocumentRole.Reader });
```

The handlers and their minimum roles:

| File | Handlers |
|------|----------|
| `documents-routes.ts` | PATCH (Editor), DELETE (Owner), download (Reader), members (Reader) |
| `insights-routes.ts` | topics (Reader), topics refresh (Editor), summaries (Reader), selection GET (Reader), selection POST (Editor) |
| `versions-routes.ts` | three handlers, all Reader |
| `timeline-routes.ts` | two handlers, both Reader |
| `share-links-routes.ts` | list (Owner), rotate (Owner) |
| `history-routes.ts` | events (Reader) |

Handlers that still need the user id read `context.var.user.id`. `GET /:documentId` in `documents-routes.ts` keeps `requireDocumentRole` because it uses the returned role. After the change, `rg -n "context.get\('user'\)" apps/server/src` prints nothing, and `rg -c requireDocumentRole apps/server/src --type ts -g '!*.test.ts'` shows only `require-document-role.ts` and `documents-routes.ts`.

- [x] **Step 6: Run the tests and see them pass.** Run the Step 2 command, then `pnpm typecheck`. Then `pnpm --filter @superdoc-history/server exec vitest run src/documents src/insights src/history src/http`.

- [x] **Step 7: Commit.** `git commit -m "refactor(server): read the authorized document id through one prelude"`. — evidence: `1f855d9`

### Task 6: `LruMap` for the three hand-rolled caches

Covers 4.1.

**Files:**
- Create: `apps/server/src/limits/lru-map.ts`, `apps/server/src/limits/lru-map.test.ts`
- Modify: `apps/server/src/history/timeline-pipeline-cache.ts`, `apps/server/src/history/versions-service.ts`, `apps/server/src/collaboration/version-rooms.ts`

**Interfaces:**
- Produces: `LruEntry<Value> = { key: string; value: Value }` and the `LruMap<Value>` class:
  - `new LruMap({ isOverBudget: (entries: ReadonlyMap<string, Value>) => boolean })`
  - `get(key): Value | null`, which refreshes recency
  - `peek(key): Value | null`, which does not
  - `set({ key, value }): LruEntry<Value>[]`, which returns the evicted entries, oldest first
  - `delete(key): boolean`
  - `keys(): string[]`
  - `values(): Value[]`
  - `size(): number`

- [x] **Step 1: Write the failing test** `apps/server/src/limits/lru-map.test.ts`:

```ts
import { expect, test } from 'vitest';
import { LruMap } from './lru-map';

function holding(maxEntries: number): LruMap<number> {
  return new LruMap<number>({ isOverBudget: (entries) => entries.size > maxEntries });
}

test('a read refreshes recency, so the least recently read entry is evicted', () => {
  const map = holding(2);
  map.set({ key: 'a', value: 1 });
  map.set({ key: 'b', value: 2 });
  map.get('a');
  expect(map.set({ key: 'c', value: 3 })).toEqual([{ key: 'b', value: 2 }]);
  expect(map.keys()).toEqual(['a', 'c']);
});

test('setting an existing key moves it to the newest end without evicting', () => {
  const map = holding(2);
  map.set({ key: 'a', value: 1 });
  map.set({ key: 'b', value: 2 });
  expect(map.set({ key: 'a', value: 9 })).toEqual([]);
  expect([map.keys(), map.values()]).toEqual([['b', 'a'], [2, 9]]);
});

test('a peek leaves recency alone', () => {
  const map = holding(2);
  map.set({ key: 'a', value: 1 });
  map.set({ key: 'b', value: 2 });
  expect(map.peek('a')).toBe(1);
  expect(map.set({ key: 'c', value: 3 })).toEqual([{ key: 'a', value: 1 }]);
});

test('a value budget evicts oldest first and never the last entry', () => {
  const map = new LruMap<number>({ isOverBudget: (entries) => [...entries.values()].reduce((total, value) => total + value, 0) > 10 && entries.size > 1 });
  map.set({ key: 'a', value: 4 });
  map.set({ key: 'b', value: 4 });
  expect(map.set({ key: 'c', value: 11 })).toEqual([{ key: 'a', value: 4 }, { key: 'b', value: 4 }]);
  expect(map.keys()).toEqual(['c']);
});

test('a missing key reads as null and deletes as false', () => {
  const map = holding(1);
  expect([map.get('x'), map.peek('x'), map.delete('x'), map.size()]).toEqual([null, null, false, 0]);
});
```

- [x] **Step 2: Run it and see it fail.** `pnpm --filter @superdoc-history/server exec vitest run src/limits/lru-map.test.ts` fails with "Failed to resolve import ./lru-map".

- [x] **Step 3: Commit the red test.** `git commit -m "test(server): pin the least recently used map"`. — evidence: `b1547e8`

- [x] **Step 4: Implement** `apps/server/src/limits/lru-map.ts`:

```ts
export type LruEntry<Value> = { key: string; value: Value };

export class LruMap<Value> {
  private readonly entries = new Map<string, Value>();
  private readonly isOverBudget: (entries: ReadonlyMap<string, Value>) => boolean;

  constructor({ isOverBudget }: { isOverBudget: (entries: ReadonlyMap<string, Value>) => boolean }) {
    this.isOverBudget = isOverBudget;
  }

  get(key: string): Value | null {
    const value = this.peek(key);
    if (value === null) return null;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  peek(key: string): Value | null {
    const value = this.entries.get(key);
    if (value === undefined) return null;
    return value;
  }

  set({ key, value }: LruEntry<Value>): LruEntry<Value>[] {
    this.entries.delete(key);
    this.entries.set(key, value);
    return this.evict();
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }

  values(): Value[] {
    return [...this.entries.values()];
  }

  size(): number {
    return this.entries.size;
  }

  private evict(): LruEntry<Value>[] {
    if (!this.isOverBudget(this.entries)) return [];
    const [oldest] = this.entries;
    if (!oldest) return [];
    const [key, value] = oldest;
    this.entries.delete(key);
    return [{ key, value }, ...this.evict()];
  }
}
```

- [x] **Step 5: Adopt it in `TimelinePipelineCache`.**

```ts
type CacheEntry = { cacheKey: string; pipeline: TimelinePipeline };

export class TimelinePipelineCache {
  builds = 0;
  private readonly entries: LruMap<CacheEntry>;

  constructor({ maxEntries = TIMELINE_PIPELINE_CACHE_SIZE }: { maxEntries?: number } = {}) {
    this.entries = new LruMap({ isOverBudget: (entries) => entries.size > maxEntries });
  }

  forget(documentId: string): void {
    this.entries.delete(documentId);
  }

  get({ documentId, key, build }: { documentId: string; key: string; build: () => TimelinePipeline }): TimelinePipeline {
    const cached = this.entries.get(documentId);
    if (cached && cached.cacheKey === key) return cached.pipeline;
    this.builds += 1;
    const pipeline = build();
    this.entries.set({ key: documentId, value: { cacheKey: key, pipeline } });
    return pipeline;
  }
}
```

- [x] **Step 6: Adopt it in `VersionsService`.** Delete the `maxEntries` and `maxBytes` fields and the `touch` and `trim` methods.

```ts
function isOverVersionBudget({ entries, maxEntries, maxBytes }: { entries: ReadonlyMap<string, LoadedVersion>; maxEntries: number; maxBytes: number }): boolean {
  const bytes = [...entries.values()].reduce((total, entry) => total + entry.state.byteLength, 0);
  const isOverByteBudget = bytes > maxBytes && entries.size > 1;
  return entries.size > maxEntries || isOverByteBudget;
}
```

In the constructor: `this.cache = new LruMap({ isOverBudget: (entries) => isOverVersionBudget({ entries, maxEntries, maxBytes }) });`. `this.touch(key)` becomes `this.cache.get(key)`. In `store`, `this.cache.set(key, version); ...; this.trim();` becomes `this.cache.set({ key, value: version });`, and `failedAt` is still cleared. In `forget`, `[this.cache, ...]` iterates `this.cache.keys()`. Task 7 rewrites that line.

- [x] **Step 7: Adopt it in `VersionRooms`.** `rooms` becomes `LruMap<VersionRoom>`, built in the constructor with `isOverBudget: (rooms) => rooms.size > policy.limit`.

`roomFor`:

```ts
private roomFor(endpoint: VersionEndpoint): VersionRoom {
  const key = versionKeyOf(endpoint);
  const existing = this.rooms.get(key);
  const room = existing ? existing : this.create({ key, endpoint });
  this.rooms.set({ key, value: room }).forEach((evicted) => this.destroyInBackground({ key: evicted.key, destroying: this.destroyRoom(evicted.value) }));
  return room;
}
```

`cancelIdle` and `scheduleIdle` read with `this.rooms.peek(key)` so the Hocuspocus hooks never refresh recency. Keep `destroy(key)` under that name, because `version-rooms.test.ts` "stop clears its timeout when destroying a room fails" spies on it:

```ts
private destroyInBackground({ key, destroying }: { key: string; destroying: Promise<void> }): void {
  destroying.catch((error) => console.error(`${ROOM_DESTROY_FAILED_MESSAGE} ${key}: ${describeError(error)}`));
}

private async destroy(key: string): Promise<void> {
  const room = this.rooms.peek(key);
  if (!room) return;
  this.rooms.delete(key);
  await this.destroyRoom(room);
}

private async destroyRoom(room: VersionRoom): Promise<void> {
  if (room.idleTimer) clearTimeout(room.idleTimer);
  await room.hocuspocus.destroy();
}
```

The two idle-timer call sites become `this.destroyInBackground({ key, destroying: this.destroy(key) })`. `forget` and `stop` iterate `this.rooms.keys()`. `size()` returns `this.rooms.size()`.

- [x] **Step 8: Run the tests and see them pass.** Run the Step 2 command, then `pnpm typecheck`. Then `pnpm --filter @superdoc-history/server exec vitest run src/limits src/history/timeline-routes.test.ts src/history/versions-routes.test.ts src/collaboration`. Three existing tests must pass unchanged:
  - "the pipeline cache evicts the least recently read document"
  - "the cache stays under its byte budget"
  - "the limit evicts the least recently used instance"

- [x] **Step 9: Commit.** `git commit -m "refactor(server): share one least recently used map across the three caches"`. — evidence: `5a48589`

### Task 7: `KeyedCooldown`, version failures and version lookups

Covers 4.2, 4.16, 2.10 and 2.7.

**Files:**
- Rename: `apps/server/src/insights/document-cooldown.ts` to `apps/server/src/limits/keyed-cooldown.ts`, and its test to `keyed-cooldown.test.ts` (with `git mv`)
- Modify: `apps/server/src/history/versions-service.ts`, `apps/server/src/history/versions-routes.ts`, `apps/server/src/insights/{topics-service,summaries-service,selection-summaries-service}.ts`
- Create: `apps/server/src/history/versions-service.test.ts`

**Interfaces:**
- Produces:
  - `KeyedCooldown` (`start(key)`, `remainingMs(key)`, `forget(key)`, `keys(): string[]`, `size()`)
  - `keysOfDocument({ keys, documentId }: { keys: Iterable<string>; documentId: string }): string[]`
  - `marksAround({ marks, sequence }: { marks: VersionMarkSummary[]; sequence: number }): VersionMarkSummary[]`
  - `VERSION_MARKS_AROUND`, moved from `versions-routes.ts`

- [x] **Step 1: Move and rename the cooldown.**

```bash
git mv apps/server/src/insights/document-cooldown.ts apps/server/src/limits/keyed-cooldown.ts
git mv apps/server/src/insights/document-cooldown.test.ts apps/server/src/limits/keyed-cooldown.test.ts
```

Rename `DocumentCooldown` to `KeyedCooldown` (11 references in 5 files) and the `documentId` parameters to `key`. Repoint the 4 path imports.

- [x] **Step 2: Write the failing tests.** Append to `keyed-cooldown.test.ts`, which already declares `DURATION_MS` and `clock`:

```ts
test('keys lists every key that was started and not forgotten', () => {
  const cooldown = new KeyedCooldown({ durationMs: DURATION_MS, now: clock.now });
  ['a/1', 'a/2', 'b/1'].forEach((key) => cooldown.start(key));
  cooldown.forget('a/2');
  expect(cooldown.keys()).toEqual(['a/1', 'b/1']);
});
```

Create `apps/server/src/history/versions-service.test.ts`:

```ts
import { expect, test } from 'vitest';
import { keysOfDocument, marksAround, VERSION_MARKS_AROUND } from './versions-service';

const MARK_COUNT = 30;
const marks = Array.from({ length: MARK_COUNT }, (_, index) => ({ sequence: (index + 1) * 10, serverTime: index, minuteStart: 0, isBootstrap: false }));

test('keysOfDocument keeps only the keys of that document', () => {
  expect(keysOfDocument({ keys: ['d1/1', 'd10/1', 'd1/20'], documentId: 'd1' })).toEqual(['d1/1', 'd1/20']);
});

test('marksAround centres on the last mark at or before the sequence', () => {
  expect(marksAround({ marks, sequence: 155 }).map((mark) => mark.sequence)).toEqual(marks.slice(14 - VERSION_MARKS_AROUND, 14 + VERSION_MARKS_AROUND + 1).map((mark) => mark.sequence));
});

test('marksAround before the first mark starts at the first mark', () => {
  expect(marksAround({ marks, sequence: 0 })).toEqual(marks.slice(0, VERSION_MARKS_AROUND + 1));
});
```

Index 14 holds sequence 150, the last mark at or before 155. If the slice expectation disagrees with today's route by one, the route is the truth: fix the test to match `versions-routes.ts` before moving the math.

- [x] **Step 3: Run the tests and see them fail.** `pnpm --filter @superdoc-history/server exec vitest run src/limits/keyed-cooldown.test.ts src/history/versions-service.test.ts` fails because `keys`, `keysOfDocument` and `marksAround` do not exist.

- [x] **Step 4: Commit the red tests together with the move.** `git add` both renamed files and the new test, then `git commit -m "test(server): pin cooldown keys, document keys and the marks window"`. — evidence: `1a263a9`

- [x] **Step 5: Implement.** In `keyed-cooldown.ts`:

```ts
keys(): string[] {
  return [...this.startedAt.keys()];
}
```

In `versions-service.ts`, add these beside `versionKeyPrefixOf`:

```ts
export const VERSION_MARKS_AROUND = 10;

export function keysOfDocument({ keys, documentId }: { keys: Iterable<string>; documentId: string }): string[] {
  const prefix = versionKeyPrefixOf(documentId);
  return [...keys].filter((key) => key.startsWith(prefix));
}

export function marksAround({ marks, sequence }: { marks: VersionMarkSummary[]; sequence: number }): VersionMarkSummary[] {
  const centre = Math.max(0, marks.findLastIndex((mark) => mark.sequence <= sequence));
  return marks.slice(Math.max(0, centre - VERSION_MARKS_AROUND), centre + VERSION_MARKS_AROUND + 1);
}
```

Then change the class:
  - **Failures:** replace `failedAt` with `private readonly failures = new KeyedCooldown({ durationMs: VERSION_FAILURE_TTL_MS });`. `isFailedRecently(key)` becomes `return this.failures.remainingMs(key) > 0;`. In `recordFailure`, `this.failedAt.set(key, Date.now())` becomes `this.failures.start(key)`. In `store`, it calls `this.failures.forget(key)`.
  - **`forget(documentId)`:**

```ts
forget(documentId: string): void {
  this.generations.set(documentId, this.generationOf(documentId) + 1);
  keysOfDocument({ keys: this.cache.keys(), documentId }).forEach((key) => this.cache.delete(key));
  keysOfDocument({ keys: this.failures.keys(), documentId }).forEach((key) => this.failures.forget(key));
  keysOfDocument({ keys: this.loading.keys(), documentId }).forEach((key) => this.loading.delete(key));
}
```

  - **`cachedLookup` (2.10):**

```ts
type CachedLookup = { key: string; sequence: number; cached: LoadedVersion | null };

private cachedLookup(endpoint: VersionEndpoint): CachedLookup | null {
  const mark = this.resolve(endpoint);
  if (!mark) return null;
  const key = versionKeyOf({ documentId: endpoint.documentId, sequence: mark.sequence });
  return { key, sequence: mark.sequence, cached: this.cache.get(key) };
}

peek(endpoint: VersionEndpoint): VersionLookup {
  const lookup = this.cachedLookup(endpoint);
  if (!lookup) throw new VersionNotReadyError(endpoint.documentId);
  if (lookup.cached) return { kind: VersionLookupKind.Ready, version: lookup.cached };
  if (this.isFailedRecently(lookup.key)) return { kind: VersionLookupKind.Failed };
  this.load(endpoint).catch(() => undefined);
  return { kind: VersionLookupKind.Pending };
}

load(endpoint: VersionEndpoint): Promise<LoadedVersion> {
  const lookup = this.cachedLookup(endpoint);
  if (!lookup) return Promise.reject(new VersionNotReadyError(endpoint.documentId));
  if (lookup.cached) return Promise.resolve(lookup.cached);
  if (this.isFailedRecently(lookup.key)) return Promise.reject(new VersionLoadFailedError(lookup.key));
  const inFlight = this.loading.get(lookup.key);
  if (inFlight) return inFlight;
  return this.start({ key: lookup.key, documentId: endpoint.documentId, sequence: lookup.sequence });
}
```

In `versions-routes.ts`, the marks handler becomes:

```ts
const body: VersionMarks = { marks: marksAround({ marks: services.readModel.marks(documentId), sequence: parsed.data }).map(({ sequence, serverTime }) => ({ sequence, serverTime })) };
```

and the route's `VERSION_MARKS_AROUND` is deleted.

- [x] **Step 6: Run the tests and see them pass.** Run the Step 3 command, then `pnpm typecheck`. Then `pnpm --filter @superdoc-history/server exec vitest run src/history src/insights src/collaboration`.

- [x] **Step 7: Commit.** `git commit -m "refactor(server): one keyed cooldown for insights and version failures"`. — evidence: `707376f`

### Task 8: `SlidingWindow` for call budgets and restart budgets

Covers 4.3 and 1.2.

**Files:**
- Create: `apps/server/src/limits/sliding-window.ts`, `apps/server/src/limits/sliding-window.test.ts`
- Modify: `apps/server/src/insights/insights-job-runner.ts`, `apps/server/src/history/projection-scheduler.ts`

**Interfaces:**
- Produces: `new SlidingWindow({ windowMs, now? })`, with `record(): void`, `count(): number` and `oldest(): number | null`. `count` and `oldest` drop entries at or older than `now - windowMs` first.

- [x] **Step 1: Write the failing test** `apps/server/src/limits/sliding-window.test.ts`:

```ts
import { expect, test } from 'vitest';
import { SlidingWindow } from './sliding-window';

const WINDOW_MS = 1000;

test('an entry counts until exactly one window has passed', () => {
  const clock = { time: 0 };
  const window = new SlidingWindow({ windowMs: WINDOW_MS, now: () => clock.time });
  window.record();
  clock.time = 500;
  window.record();
  clock.time = 999;
  expect([window.count(), window.oldest()]).toEqual([2, 0]);
  clock.time = 1000;
  expect([window.count(), window.oldest()]).toEqual([1, 500]);
  clock.time = 1500;
  expect([window.count(), window.oldest()]).toEqual([0, null]);
});
```

- [x] **Step 2: Run it and see it fail.** `pnpm --filter @superdoc-history/server exec vitest run src/limits/sliding-window.test.ts` fails with "Failed to resolve import ./sliding-window".

- [x] **Step 3: Commit the red test.** `git commit -m "test(server): pin the sliding window counter"`. — evidence: `0f9357d`

- [x] **Step 4: Implement** `apps/server/src/limits/sliding-window.ts`:

```ts
export class SlidingWindow {
  private readonly times: number[] = [];
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor({ windowMs, now = () => Date.now() }: { windowMs: number; now?: () => number }) {
    this.windowMs = windowMs;
    this.now = now;
  }

  record(): void {
    this.times.push(this.now());
  }

  count(): number {
    this.prune();
    return this.times.length;
  }

  oldest(): number | null {
    this.prune();
    const [oldest] = this.times;
    if (oldest === undefined) return null;
    return oldest;
  }

  private prune(): void {
    const windowStart = this.now() - this.windowMs;
    const recent = this.times.filter((time) => time > windowStart);
    this.times.splice(0, this.times.length, ...recent);
  }
}
```

- [x] **Step 5: Adopt it.**

In `InsightsJobRunner`, delete `startedAt` and `callsInWindow`, and build `this.calls = new SlidingWindow({ windowMs: LLM_WINDOW_MS, now })` in the constructor:

```ts
consumeCall(): boolean {
  if (this.calls.count() >= this.maxCallsPerHour) return false;
  this.calls.record();
  return true;
}

hasCallBudget(): boolean {
  return this.calls.count() < this.maxCallsPerHour;
}

retryAfterMs(): number {
  if (this.hasCallBudget()) return MIN_RETRY_AFTER_MS;
  const oldest = this.calls.oldest();
  if (oldest === null) return MIN_RETRY_AFTER_MS;
  return Math.max(MIN_RETRY_AFTER_MS, oldest + LLM_WINDOW_MS - this.now());
}
```

In `ProjectionScheduler`, replace `restartTimes` with `private readonly restarts = new SlidingWindow({ windowMs: WORKER_RESTART_WINDOW_MS });`:

```ts
private withinRestartBudget(): boolean {
  this.restarts.record();
  return this.restarts.count() <= MAX_WORKER_RESTARTS_PER_WINDOW;
}
```

- [x] **Step 6: Run the tests and see them pass.** Run the Step 2 command, then `pnpm typecheck`. Then `pnpm --filter @superdoc-history/server exec vitest run src/limits src/insights src/history/projection-scheduler.test.ts src/server.test.ts`. The scheduler test "degrades after too many restarts in one window" and the job runner budget tests stay green unchanged.

- [x] **Step 7: Commit.** `git commit -m "refactor(server): count calls and restarts with one sliding window"`. — evidence: `9991a81`

### Task 9: `withTimeout` shared by the worker and the version rooms

Covers 4.15 and 5.11.

**Files:**
- Create: `apps/server/src/limits/with-timeout.ts`, `apps/server/src/limits/with-timeout.test.ts`
- Modify: `apps/server/src/history/projection-worker.ts`, `apps/server/src/collaboration/version-rooms.ts`

**Interfaces:**
- Produces: `withTimeout<Value>({ work, milliseconds, onTimeout }: { work: Promise<Value>; milliseconds: number; onTimeout: () => Value }): Promise<Value>`. If the work settles first, its result wins. Otherwise `onTimeout`'s value or thrown error wins. The timer is cleared either way.

- [x] **Step 1: Write the failing test** `apps/server/src/limits/with-timeout.test.ts`:

```ts
import { afterEach, expect, test, vi } from 'vitest';
import { ImportTimeoutError } from '../history/projection-messages';
import { withTimeout } from './with-timeout';

const DEADLINE_MS = 1000;
const HANGING = new Promise<string>(() => undefined);

afterEach(() => {
  vi.useRealTimers();
});

test('work that settles first wins and leaves no timer behind', async () => {
  vi.useFakeTimers();
  await expect(withTimeout({ work: Promise.resolve('done'), milliseconds: DEADLINE_MS, onTimeout: () => 'late' })).resolves.toBe('done');
  expect(vi.getTimerCount()).toBe(0);
});

test('a failing work rejects with its own error', async () => {
  await expect(withTimeout({ work: Promise.reject(new Error('boom')), milliseconds: DEADLINE_MS, onTimeout: () => 'late' })).rejects.toThrow('boom');
});

test('hanging work answers what onTimeout returns', async () => {
  vi.useFakeTimers();
  const result = withTimeout({ work: HANGING, milliseconds: DEADLINE_MS, onTimeout: () => 'late' });
  await vi.advanceTimersByTimeAsync(DEADLINE_MS);
  await expect(result).resolves.toBe('late');
});

test('hanging work rejects with the error onTimeout throws', async () => {
  vi.useFakeTimers();
  const result = withTimeout({ work: HANGING, milliseconds: DEADLINE_MS, onTimeout: () => { throw new ImportTimeoutError(DEADLINE_MS); } });
  const settled = expect(result).rejects.toThrow(`The import took longer than ${DEADLINE_MS} ms.`);
  await vi.advanceTimersByTimeAsync(DEADLINE_MS);
  await settled;
});
```

- [x] **Step 2: Run it and see it fail.** `pnpm --filter @superdoc-history/server exec vitest run src/limits/with-timeout.test.ts` fails with "Failed to resolve import ./with-timeout".

- [x] **Step 3: Commit the red test.** `git commit -m "test(server): pin the shared timeout race"`. — evidence: `2360112`

- [x] **Step 4: Implement** `apps/server/src/limits/with-timeout.ts`:

```ts
export function withTimeout<Value>({ work, milliseconds, onTimeout }: { work: Promise<Value>; milliseconds: number; onTimeout: () => Value }): Promise<Value> {
  const timer: { handle: NodeJS.Timeout | null } = { handle: null };
  const expired = new Promise<void>((resolve) => {
    timer.handle = setTimeout(resolve, milliseconds);
  }).then(onTimeout);
  return Promise.race([work, expired]).finally(() => {
    if (timer.handle) clearTimeout(timer.handle);
  });
}
```

- [x] **Step 5: Adopt it.** In `projection-worker.ts`, delete the local `withTimeout`. In `importRevisions`:

```ts
const items = await withTimeout({ work: listRevisions(filePath), milliseconds: IMPORT_TIMEOUT_MS, onTimeout: () => { throw new ImportTimeoutError(IMPORT_TIMEOUT_MS); } });
```

In `stopWorker`:

```ts
if (superdocClient) await withTimeout({ work: superdocClient.then((client) => client.dispose(), () => undefined), milliseconds: STOP_DISPOSE_TIMEOUT_MS, onTimeout: () => undefined }).catch(() => undefined);
```

In `VersionRooms.stop`, a failing destroy still rejects `stop`, and the timer is still created with `STOP_TIMEOUT_MS` and cleared:

```ts
async stop(): Promise<void> {
  const destroyed = Promise.all(this.rooms.keys().map((key) => this.destroy(key))).then(() => undefined);
  await withTimeout({ work: destroyed, milliseconds: STOP_TIMEOUT_MS, onTimeout: () => undefined });
}
```

- [x] **Step 6: Run the tests and see them pass.** Run the Step 2 command, then `pnpm typecheck`. Then `pnpm --filter @superdoc-history/server exec vitest run src/limits src/collaboration src/history/projection-scheduler.test.ts`. "stop clears its timeout when destroying a room fails" and "a hanging import does not delay the projection of another document" stay green unchanged.

- [x] **Step 7: Commit.** `git commit -m "refactor(server): share one timeout race between the worker and version rooms"`. — evidence: `b77d818`

### Task 10: Routes and query parsing

Covers 5.3, 3.16, 3.10 and 3.11.

**Files:**
- Modify: `apps/server/src/history/timeline-query.ts`, `timeline-routes.ts`, `history-routes.ts`, `apps/server/src/insights/insights-routes.ts`, `apps/server/src/http/app.ts`
- Test: `apps/server/src/http/app.test.ts`

- [x] **Step 1: Write the middleware-order pins**, green on today's code, in the `cross-site request forgery` describe of `app.test.ts`:

```ts
test('a foreign form post without a session is refused as forgery before authentication', async () => {
  const form = new FormData();
  form.set(UPLOAD_FIELD, new File([new Uint8Array([1])], 'Plan.docx', { type: DOCX_MIME_TYPE }));
  const response = await fetch(`${server.baseUrl}${ApiPath.Documents}`, { method: 'POST', headers: { origin: FOREIGN_ORIGIN }, body: form });
  expect(response.status).toBe(HttpStatus.Forbidden);
});

test('a same-origin read without a session is unauthorized on every protected path', async () => {
  const paths = [ApiPath.Documents, `${ApiPath.Documents}/anything`, `${ApiPath.ShareLinks}/anything/accept`];
  const statuses = await Promise.all(paths.map(async (path) => (await fetch(`${server.baseUrl}${path}`, { headers: { origin: server.baseUrl } })).status));
  expect(statuses).toEqual(paths.map(() => HttpStatus.Unauthorized));
});
```

- [x] **Step 2: Run the pins and see them green on today's code.** `pnpm --filter @superdoc-history/server exec vitest run src/http/app.test.ts`. If the share-link path answers 404 instead of 401, record the observed status as the expectation, because the pin fixes today's behaviour.

- [x] **Step 3: Commit the pins.** `git commit -m "test(server): pin the forgery-then-session middleware order"`. — evidence: `b274006`

- [x] **Step 4: Loop the protected paths (3.11)** in `app.ts`:

```ts
const PROTECTED_PATHS = [ApiPath.Documents, `${ApiPath.Documents}/*`, `${ApiPath.ShareLinks}/*`];
```

and, in `createApp`, replace the six `app.use` lines with:

```ts
PROTECTED_PATHS.forEach((path) => app.use(path, sameOriginOnly, signedIn));
```

- [x] **Step 5: Parse the whole query (5.3 and 3.16).** In `timeline-query.ts`:

```ts
function isOptionalSafeInteger(value: string | undefined): boolean {
  if (!value) return true;
  return NON_NEGATIVE_INTEGER_PATTERN.test(value) && Number.isSafeInteger(Number(value));
}
```

`binStartParameter` uses `.refine(isOptionalSafeInteger)`. Delete `queryOf` (6 references in 3 files). In `timeline-routes.ts`: `timelineQuerySchema.safeParse(context.req.query())` and `editsQuerySchema.safeParse(context.req.query())`. In `insights-routes.ts`, delete `parseSelection` (3 references) and use `selectionQuerySchema.safeParse(context.req.query())` in both selection handlers.

This is safe because Hono's `query()` keeps the first value of a repeated key, exactly as `query(name)` does (`results[name] ??= value` in `hono/dist/utils/url.js`), and zod objects strip unknown keys.

- [x] **Step 6: One return in the events route (3.10).** In `history-routes.ts`:

```ts
const eventsQuerySchema = z.object({
  [TimelineQueryParam.AfterSequence]: z.string().regex(NON_NEGATIVE_INTEGER_PATTERN).transform(Number).optional().transform((value) => (value === undefined ? null : value)),
  [TimelineQueryParam.Limit]: z.coerce.number().int().min(1).max(EVENTS_PAGE_SIZE).default(EVENTS_PAGE_SIZE),
});
```

and in the handler:

```ts
const parsed = eventsQuerySchema.safeParse(context.req.query());
if (!parsed.success) return context.json({ error: INVALID_EVENTS_QUERY_MESSAGE }, HttpStatus.BadRequest);
const { afterSequence, limit } = parsed.data;
return context.json(readDocumentEvents({ services, documentId, afterSequence, limit }));
```

The `undefined → null` transform is the boundary normalisation the conventions allow, and it mirrors `binMsParameter`.

- [x] **Step 7: Run the tests and see them pass.** `pnpm typecheck`, then `pnpm --filter @superdoc-history/server exec vitest run src/http src/history src/insights`. The existing tests for invalid `afterSequence`, invalid `limit`, invalid `binStart` and the selection query stay green unchanged.

- [x] **Step 8: Commit.** `git commit -m "refactor(server): parse whole queries and loop the protected paths"`. — evidence: `5f6b9ef`

### Task 11: Named conditions in the services

Covers 3.6, 4.11, 3.7, 4.13, 2.8 with 3.8, and 3.9.

**Files:**
- Modify: `apps/server/src/history/timeline-service.ts`, `timeline-routes.ts`, `apps/server/src/insights/{selection-summaries-service,summaries-service,topics-service}.ts`, `apps/server/src/collaboration/attach-collaboration.ts`, `apps/server/src/server.ts`

**Interfaces:**
- Produces: `TopicsService` takes `readPipeline: (documentId: string) => TimelinePipeline`, the same type `SummariesService` takes. Its method becomes `onTimelineRead(documentId: string): void`.

- [x] **Step 1: Name the unassigned condition and reuse `authorsOf` (3.6 and 4.11)** in `timeline-service.ts`:

```ts
function isUnassigned({ event, bandId, hasTopics }: { event: DocumentEditEvent; bandId: string; hasTopics: boolean }): boolean {
  if (event.kind === BlockChangeKind.Removed) return false;
  return !hasTopics || bandId === OTHER_BAND_ID;
}

function toTimelineEvent({ event, bandId }: { event: DocumentEditEvent; bandId: string }): TimelineEvent {
  return { sequence: event.sequence, serverTime: event.serverTime, blockId: event.blockId, bandId, authorKeys: event.authors.map(authorKey), inserted: event.inserted, deleted: event.deleted };
}
```

`buildPipeline` maps each event once to `{ event, bandId: bandOf(event) }`. It filters with `isUnassigned` for `unassignedFirstSequences` and maps with `toTimelineEvent` for `events`, so the index-coupled `timelineEvents[index]!` disappears. In `bandIdentities`, the author branch reads `Object.entries(authorsOf(events)).map(([id, author]) => ({ id, kind: TimelineBandKind.Author, name: author.name }))`.

- [x] **Step 2: Name the usable sentence (3.7)** in `selection-summaries-service.ts`:

```ts
function hasUsableSentence(stored: StoredSelectionSummary | null): stored is StoredSelectionSummary & { sentence: string } {
  return stored !== null && stored.sentence !== null && stored.failure === null;
}

function isFresh({ stored, stamp }: { stored: StoredSelectionSummary | null; stamp: SelectionStamp }): boolean {
  if (!hasUsableSentence(stored)) return false;
  return matchesStamp({ stored, stamp });
}
```

- [x] **Step 3: One last-sequence helper (4.13)** in `summaries-service.ts`:

```ts
function lastSequenceOf(sequences: number[]): number {
  return sequences.reduce((latest, sequence) => Math.max(latest, sequence), 0);
}
```

Use it in `refreshStale` as `lastSequenceOf(pipeline.events.map((event) => event.sequence))` and in `staleTopics` as `lastSequenceOf(topicRuns.map((run) => run.lastSequence)) > computedAt`.

- [x] **Step 4: The topics service reads the pipeline itself (2.8 and 3.8).** `TopicsService` gains a `readPipeline` field and constructor parameter. In `server.ts`, add `readPipeline: (documentId) => readTimelinePipeline({ services, documentId })` to the `TopicsService` construction, with the same closure shape as `SummariesService`. Then in `topics-service.ts`:

```ts
function newBlocksSince({ sequences, computedAtSequence }: { sequences: number[]; computedAtSequence: number }): number {
  return sequences.filter((sequence) => sequence > computedAtSequence).length;
}

onTimelineRead(documentId: string): void {
  const status = this.repository.status(documentId);
  const updatedAt = this.repository.updatedAt(documentId);
  if (!status || updatedAt === null) return;
  if (status.state !== TopicState.Ready) return;
  if (status.computedAtSequence === null) return;
  const newBlocks = newBlocksSince({ sequences: this.readPipeline(documentId).unassignedFirstSequences, computedAtSequence: status.computedAtSequence });
  if (newBlocks < TOPIC_RECOMPUTE_NEW_BLOCKS) return;
  if (Date.now() - updatedAt < TOPIC_RECOMPUTE_MIN_INTERVAL_MS) return;
  this.start({ documentId, isRefresh: false });
}
```

`timeline-routes.ts` calls `services.insights.topics.onTimelineRead(documentId)` after building the timeline and drops the `readTimelinePipeline` import. `ensure` stays before the build, because the build reports the topic status `ensure` may have just set.

- [x] **Step 5: Await the version upgrade (3.9)** in `attach-collaboration.ts`. The `Unavailable` branch keeps the error listener while `socket.end` flushes, exactly as today:

```ts
async function upgradeVersion({ request, socket, head, endpoint }: { request: IncomingMessage; socket: Duplex; head: Buffer; endpoint: VersionEndpoint }): Promise<void> {
  socket.on('error', destroyOnSocketError);
  const admission = await versionRooms.authorize({ endpoint, request }).catch(() => VersionAdmission.Refused);
  if (admission === VersionAdmission.Unavailable) {
    socket.end(UNAVAILABLE_UPGRADE_RESPONSE);
    return;
  }
  socket.removeListener('error', destroyOnSocketError);
  if (admission === VersionAdmission.Refused) {
    socket.destroy();
    return;
  }
  upgrade({ request, socket, head, endpoint });
}
```

The upgrade handler calls it with `if (endpoint) return void upgradeVersion({ request, socket, head, endpoint });`.

- [x] **Step 6: Run the tests.** `pnpm typecheck`, then `pnpm --filter @superdoc-history/server exec vitest run src/history src/insights src/collaboration`. The recompute tests "five new unassigned blocks trigger a recompute once" and "blocks the model leaves out do not retrigger the recompute" stay green unchanged, wherever lane D left them. So do the attach-collaboration refused, unavailable and origin tests.

- [x] **Step 7: Commit.** `git commit -m "refactor(server): name the conditions in the timeline, insights and upgrade paths"`. — evidence: `8a124f7`

### Task 12: Split the prompts file

Covers 2.6 and 4.12.

**Files:**
- Create: `apps/server/src/insights/escape-xml.ts`, `apps/server/src/insights/prompt-budget.ts`
- Modify: `apps/server/src/insights/prompts.ts`, `prompts.test.ts`, `selection-summaries-service.ts`, `summaries-service.ts`

**Interfaces:**
- Produces:
  - `escapeXml(text: string): string`
  - `fitEdits`, `EditOverhead` and `BudgetedEdit` from `prompt-budget.ts`
  - `promptEditsOf({ runs, authors }: { runs: EditRun[]; authors: Record<string, EventAuthor> }): SelectionEdit[]`
  - `authorLabel(edit: SelectionEdit): string`, now exported

- [x] **Step 1: Move the escaping.** Move `XML_ESCAPES`, `XML_SPECIAL_CHARACTERS` and `escapeXml` from `prompts.ts` to `escape-xml.ts`.

- [x] **Step 2: Move the budget algorithm.** Move `EditOverhead`, `BudgetedEdit`, `escapedLength`, `prefixWithin`, `truncateTo` and `fitEdits` to `prompt-budget.ts`. It imports `escapeXml` from `./escape-xml`. `prompts.ts` imports from both, and nothing is re-exported. In `prompts.test.ts`, import `fitEdits` from `./prompt-budget`.

- [x] **Step 3: One newest-first edit list (4.12).** In `prompts.ts`:

```ts
export function promptEditsOf({ runs, authors }: { runs: EditRun[]; authors: Record<string, EventAuthor> }): SelectionEdit[] {
  return [...runs].sort((left, right) => right.lastServerTime - left.lastServerTime).map((run) => ({ authors: run.authorKeys.map((key) => authors[key]!.name), inserted: run.inserted, deleted: run.deleted }));
}
```

Export `authorLabel`.
  - In `selection-summaries-service.ts`, delete `editsOf` and call `fitSelection(promptEditsOf({ runs: resolved.snapshot.runs, authors: resolved.snapshot.authors }))`.
  - In `summaries-service.ts` `promptTopics`, `edits` becomes `promptEditsOf({ runs, authors: pipeline.authors }).map((edit) => ({ author: authorLabel(edit), inserted: edit.inserted, deleted: edit.deleted }))`. The separator is `', '` in both the old and new versions.

- [x] **Step 4: Run the tests.** `pnpm typecheck`, then `pnpm --filter @superdoc-history/server exec vitest run src/insights`. `prompts.test.ts` stays green with only its import line changed.

- [x] **Step 5: Commit.** `git commit -m "refactor(server): split prompt escaping and budgeting from the prompts"`. — evidence: `954ca16`

### Task 13: The projection worker, one handler per request kind

Covers 2.5 and 3.3.

**Files:**
- Create: `apps/server/src/history/projection-handler.ts`, `apps/server/src/history/projection-handler.test.ts`
- Modify: `apps/server/src/history/projection-worker.ts`, `apps/server/src/history/projection-messages.ts`

**Interfaces:**
- Produces: in `projection-messages.ts`, `AnsweredRequest = Exclude<ProjectionRequest, { kind: ProjectionRequestKind.Stop }>` and `AnsweredReply = ProjectionDoneReply | VersionReply | BlocksReply`. In `projection-handler.ts`, `ProjectionStores = { updateLog: UpdateLog; readModel: ReadModel; replays: GcFreeReplays; importRevisions: (request: { documentId: string; filePath: string }) => Promise<string | null> }` and `createProjectionHandler(stores: ProjectionStores): (request: AnsweredRequest) => Promise<AnsweredReply>`.

- [x] **Step 1: Write the failing test** `apps/server/src/history/projection-handler.test.ts`:

```ts
import { GcFreeReplays, MigrationSet, ReadModel, REPLAY_CACHE_SIZE, UpdateLog } from '@superdoc-history/history';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { HISTORY_DATABASE_FILE, openSqliteFile, READ_MODEL_DATABASE_FILE } from '../database/connection';
import { runHistoryMigrations } from '../database/migrate';
import { createProjectionHandler } from './projection-handler';
import { MissingVersionMarkError, ProjectionRequestKind } from './projection-messages';

const DOCUMENT_ID = 'd1';

function storesWith(importRevisions: (request: { documentId: string; filePath: string }) => Promise<string | null>) {
  const directory = mkdtempSync(join(tmpdir(), 'projection-handler-'));
  const historySqlite = openSqliteFile({ directory, fileName: HISTORY_DATABASE_FILE });
  runHistoryMigrations({ sqlite: historySqlite, set: MigrationSet.History });
  const readModelSqlite = openSqliteFile({ directory, fileName: READ_MODEL_DATABASE_FILE });
  runHistoryMigrations({ sqlite: readModelSqlite, set: MigrationSet.ReadModel });
  return { updateLog: new UpdateLog(historySqlite), readModel: new ReadModel(readModelSqlite), replays: new GcFreeReplays(REPLAY_CACHE_SIZE), importRevisions };
}

test('projecting an empty log answers a null cursor', async () => {
  const handle = createProjectionHandler(storesWith(async () => null));
  expect(await handle({ kind: ProjectionRequestKind.Project, documentId: DOCUMENT_ID })).toEqual({ kind: ProjectionRequestKind.Project, documentId: DOCUMENT_ID, cursor: null, importError: null });
});

test('an import reads the cursor before importing and answers the import error', async () => {
  const importRevisions = vi.fn(async () => 'boom');
  const stores = storesWith(importRevisions);
  const cursor = vi.spyOn(stores.readModel, 'cursor');
  const request = { kind: ProjectionRequestKind.Import, documentId: DOCUMENT_ID, filePath: 'plan.docx' } as const;
  expect(await createProjectionHandler(stores)(request)).toEqual({ kind: ProjectionRequestKind.Import, documentId: DOCUMENT_ID, cursor: null, importError: 'boom' });
  expect(importRevisions).toHaveBeenCalledWith(request);
  expect(cursor.mock.invocationCallOrder[0]).toBeLessThan(importRevisions.mock.invocationCallOrder[0]!);
});

test('forgetting clears the replays before the read model and answers a null cursor', async () => {
  const stores = storesWith(async () => null);
  const [replays, readModel] = [vi.spyOn(stores.replays, 'forget'), vi.spyOn(stores.readModel, 'forget')];
  expect(await createProjectionHandler(stores)({ kind: ProjectionRequestKind.Forget, documentId: DOCUMENT_ID })).toEqual({ kind: ProjectionRequestKind.Forget, documentId: DOCUMENT_ID, cursor: null, importError: null });
  expect(replays.mock.invocationCallOrder[0]).toBeLessThan(readModel.mock.invocationCallOrder[0]!);
});

test('blocks of an unprojected document are empty at sequence zero', async () => {
  const handle = createProjectionHandler(storesWith(async () => null));
  expect(await handle({ kind: ProjectionRequestKind.Blocks, documentId: DOCUMENT_ID })).toEqual({ kind: ProjectionRequestKind.Blocks, documentId: DOCUMENT_ID, sequence: 0, blocks: [] });
});

test('a version without a mark fails with the missing mark error', async () => {
  const handle = createProjectionHandler(storesWith(async () => null));
  await expect(handle({ kind: ProjectionRequestKind.Version, documentId: DOCUMENT_ID, sequence: 5 })).rejects.toBeInstanceOf(MissingVersionMarkError);
});
```

- [x] **Step 2: Run it and see it fail.** `pnpm --filter @superdoc-history/server exec vitest run src/history/projection-handler.test.ts` fails with "Failed to resolve import ./projection-handler".

- [x] **Step 3: Commit the red test.** `git commit -m "test(server): pin the projection handler per request kind"`. — evidence: `50aa400`

- [x] **Step 4: Implement** `apps/server/src/history/projection-handler.ts`, with the bodies moved verbatim from the worker:

```ts
import { compact, materialize, projectPending, readMainStoryBlocks, readMainStoryText, type GcFreeReplays, type ReadModel, type UpdateLog } from '@superdoc-history/history';
import * as Y from 'yjs';
import { MissingVersionMarkError, ProjectionRequestKind, SNAPSHOT_EVERY_UPDATES, type AnsweredReply, type AnsweredRequest, type BlocksReply, type ProjectionDoneReply, type VersionReply } from './projection-messages';

export type ProjectionStores = { updateLog: UpdateLog; readModel: ReadModel; replays: GcFreeReplays; importRevisions: (request: { documentId: string; filePath: string }) => Promise<string | null> };

export function createProjectionHandler({ updateLog, readModel, replays, importRevisions }: ProjectionStores): (request: AnsweredRequest) => Promise<AnsweredReply> {
  function handleProject(documentId: string): ProjectionDoneReply {
    compact({ log: updateLog, documentName: documentId, everyUpdates: SNAPSHOT_EVERY_UPDATES });
    return { kind: ProjectionRequestKind.Project, documentId, cursor: projectPending({ log: updateLog, readModel, documentName: documentId }), importError: null };
  }

  async function handleImport(request: { documentId: string; filePath: string }): Promise<ProjectionDoneReply> {
    const cursor = readModel.cursor(request.documentId);
    return { kind: ProjectionRequestKind.Import, documentId: request.documentId, cursor, importError: await importRevisions(request) };
  }

  function handleForget(documentId: string): ProjectionDoneReply {
    replays.forget(documentId);
    readModel.forget(documentId);
    return { kind: ProjectionRequestKind.Forget, documentId, cursor: readModel.cursor(documentId), importError: null };
  }

  function versionReply({ documentId, sequence }: { documentId: string; sequence: number }): VersionReply {
    const mark = readModel.mark({ documentName: documentId, sequence });
    if (!mark) throw new MissingVersionMarkError({ documentId, sequence });
    const version = replays.version({ log: updateLog, documentName: documentId, mark });
    return { kind: ProjectionRequestKind.Version, documentId, sequence, serverTime: mark.serverTime, state: Y.encodeStateAsUpdate(version), text: readMainStoryText(version) };
  }

  function blocksReply(documentId: string): BlocksReply {
    const cursor = readModel.cursor(documentId);
    if (cursor === null) return { kind: ProjectionRequestKind.Blocks, documentId, sequence: 0, blocks: [] };
    return { kind: ProjectionRequestKind.Blocks, documentId, sequence: cursor, blocks: readMainStoryBlocks(materialize({ log: updateLog, documentName: documentId, untilSequence: cursor })) };
  }

  return async function handle(request: AnsweredRequest): Promise<AnsweredReply> {
    if (request.kind === ProjectionRequestKind.Version) return versionReply(request);
    if (request.kind === ProjectionRequestKind.Blocks) return blocksReply(request.documentId);
    if (request.kind === ProjectionRequestKind.Import) return handleImport(request);
    if (request.kind === ProjectionRequestKind.Forget) return handleForget(request.documentId);
    return handleProject(request.documentId);
  };
}
```

`handleImport` passes the whole request object to `importRevisions`, as today. In `projection-messages.ts`, add:

```ts
export type AnsweredRequest = Exclude<ProjectionRequest, { kind: ProjectionRequestKind.Stop }>;
export type AnsweredReply = ProjectionDoneReply | VersionReply | BlocksReply;
```

- [x] **Step 5: Slim the worker.** `projection-worker.ts` keeps the thread wiring, the stores, the SuperDoc client, `listRevisions`, `importRevisions`, `failureOf`, `answer`, `stopWorker` and the queues. It deletes the local `AnsweredRequest`, `versionReply`, `blocksReply` and `handle`, and adds:

```ts
const handle = createProjectionHandler({ updateLog, readModel, replays, importRevisions });
```

`answer` keeps `return await handle(request);` inside its `try`. `tsup.config.ts` needs no change, because the worker entry bundles its imports.

- [x] **Step 6: Run the tests and see them pass.** Run the Step 2 command, then `pnpm typecheck`. Then `pnpm --filter @superdoc-history/server exec vitest run src/history src/collaboration src/documents`. Also run `pnpm --filter @superdoc-history/server build` and confirm `dist/projection-worker.js` exists. Production loads that file.

- [x] **Step 7: Commit.** `git commit -m "refactor(server): one projection handler per request kind"`. — evidence: `a1fbe71`

### Task 14: The projection scheduler, one method per reply kind

Covers 5.4, 2.4 and 3.2.

**Files:**
- Create: `apps/server/src/history/waiting-requests.ts`, `apps/server/src/history/waiting-requests.test.ts`
- Modify: `apps/server/src/history/projection-scheduler.ts`, `apps/server/src/history/projection-messages.ts`
- Test: `apps/server/src/history/projection-scheduler.test.ts`

**Interfaces:**
- Consumes: `ProjectionRequestKind`, `VersionReply`, `BlocksReply` and `ProjectionRequestCrashedError` from `projection-messages.ts`.
- Produces:
  - `ProjectionDoneReply.kind`, narrowed to `ProjectionRequestKind.Project | ProjectionRequestKind.Import | ProjectionRequestKind.Forget`
  - `requestKeyOf({ kind, documentId, sequence }: { kind: ProjectionRequestKind.Version | ProjectionRequestKind.Blocks; documentId: string; sequence: number | null }): string`
  - `WaitingRequests`, with `add({ request, waiter }): boolean` (true when the request must be posted), `resolve(reply)`, `reject({ key, error })`, `rejectAll(errorOf: () => Error)` and `repost({ post, maxPosts })`

- [x] **Step 1: Write the scheduler pins**, green on today's code, in `projection-scheduler.test.ts`. They reuse `inFlightWithRerun`'s `postMessage` mock pattern and the `SchedulerInternals` type, renamed in Task 2.

```ts
test('a blocks reply resolves its waiter whatever cursor it carries', async () => {
  const { server, documentId } = await documentWithOwner();
  const postMessage = vi.spyOn(server.services.scheduler.currentWorker, 'postMessage').mockImplementation(() => undefined);
  const internals = server.services.scheduler as unknown as SchedulerInternals;
  const blocks = server.services.scheduler.blocks(documentId);
  internals.settle({ kind: ProjectionRequestKind.Blocks, documentId, sequence: 7, blocks: [] });
  await expect(blocks).resolves.toMatchObject({ sequence: 7 });
  postMessage.mockRestore();
  await server.stop();
});

test('a version failure rejects only the waiter of that sequence', async () => {
  const { server, documentId } = await documentWithOwner();
  const postMessage = vi.spyOn(server.services.scheduler.currentWorker, 'postMessage').mockImplementation(() => undefined);
  const internals = server.services.scheduler as unknown as SchedulerInternals;
  const [first, second] = [1, 2].map((sequence) => server.services.scheduler.version({ documentId, sequence }));
  internals.settle({ kind: ProjectionReplyKind.Failed, documentId, message: 'boom', requestKind: ProjectionRequestKind.Version, sequence: 1 });
  internals.settle({ kind: ProjectionRequestKind.Version, documentId, sequence: 2, serverTime: 0, state: new Uint8Array(), text: '' });
  await expect(first).rejects.toThrow('boom');
  await expect(second).resolves.toMatchObject({ sequence: 2 });
  postMessage.mockRestore();
  await server.stop();
});

test('a rebuild imports after forgetting, projects after importing, and ends after projecting', async () => {
  const { server, documentId } = await documentWithOwner();
  const postMessage = vi.spyOn(server.services.scheduler.currentWorker, 'postMessage').mockImplementation(() => undefined);
  const internals = server.services.scheduler as unknown as SchedulerInternals;
  const done = (kind: ProjectionRequestKind) => internals.settle({ kind, documentId, cursor: null, importError: null });
  const rebuilt = server.services.scheduler.rebuild({ documentId, filePath: 'plan.docx' });
  done(ProjectionRequestKind.Forget);
  await rebuilt;
  expect(postMessage).toHaveBeenLastCalledWith({ kind: ProjectionRequestKind.Import, documentId, filePath: 'plan.docx' });
  done(ProjectionRequestKind.Import);
  expect(postMessage).toHaveBeenLastCalledWith({ kind: ProjectionRequestKind.Project, documentId });
  expect(server.services.scheduler.isRebuilding(documentId)).toBe(true);
  done(ProjectionRequestKind.Project);
  expect(server.services.scheduler.isRebuilding(documentId)).toBe(false);
  postMessage.mockRestore();
  await server.stop();
});
```

- [x] **Step 2: Write the failing unit test** `apps/server/src/history/waiting-requests.test.ts`:

```ts
import { expect, test, vi } from 'vitest';
import { ProjectionRequestCrashedError, ProjectionRequestKind } from './projection-messages';
import { requestKeyOf, WaitingRequests } from './waiting-requests';

const VERSION_REQUEST = { kind: ProjectionRequestKind.Version, documentId: 'd1', sequence: 3 } as const;
const BLOCKS_REQUEST = { kind: ProjectionRequestKind.Blocks, documentId: 'd1' } as const;

function waiter() {
  return { resolve: vi.fn(), reject: vi.fn() };
}

test('keys name the version sequence and ignore a blocks cursor', () => {
  expect([requestKeyOf(VERSION_REQUEST), requestKeyOf({ ...BLOCKS_REQUEST, sequence: 7 }), requestKeyOf({ ...BLOCKS_REQUEST, sequence: null })]).toEqual(['version:d1@3', 'blocks:d1', 'blocks:d1']);
});

test('a second waiter joins the first request instead of posting again', () => {
  const requests = new WaitingRequests();
  const [first, second] = [waiter(), waiter()];
  expect([requests.add({ request: BLOCKS_REQUEST, waiter: first }), requests.add({ request: BLOCKS_REQUEST, waiter: second })]).toEqual([true, false]);
  const reply = { kind: ProjectionRequestKind.Blocks, documentId: 'd1', sequence: 9, blocks: [] } as const;
  requests.resolve(reply);
  expect([first.resolve, second.resolve].map((resolve) => resolve.mock.calls)).toEqual([[[reply]], [[reply]]]);
});

test('a repost past the limit rejects as crashed and posts nothing', () => {
  const requests = new WaitingRequests();
  const pending = waiter();
  requests.add({ request: VERSION_REQUEST, waiter: pending });
  const post = vi.fn();
  requests.repost({ post, maxPosts: 2 });
  requests.repost({ post, maxPosts: 2 });
  expect(post.mock.calls).toEqual([[VERSION_REQUEST]]);
  expect(pending.reject.mock.calls[0]![0]).toBeInstanceOf(ProjectionRequestCrashedError);
});

test('rejecting all gives each key its own error', () => {
  const requests = new WaitingRequests();
  const [version, blocks] = [waiter(), waiter()];
  requests.add({ request: VERSION_REQUEST, waiter: version });
  requests.add({ request: BLOCKS_REQUEST, waiter: blocks });
  requests.rejectAll(() => new Error('stopping'));
  expect(version.reject.mock.calls[0]![0]).not.toBe(blocks.reject.mock.calls[0]![0]);
});
```

- [x] **Step 3: Run both test files.** `pnpm --filter @superdoc-history/server exec vitest run src/history/projection-scheduler.test.ts src/history/waiting-requests.test.ts`. The three pins pass on today's code. `waiting-requests.test.ts` fails with "Failed to resolve import ./waiting-requests".

- [x] **Step 4: Commit both test files.** `git commit -m "test(server): pin scheduler reply routing and waiting requests"`. — evidence: `dc037f2`

- [x] **Step 5: Narrow the done reply** in `projection-messages.ts`:

```ts
export type ProjectionDoneReply = { kind: ProjectionRequestKind.Project | ProjectionRequestKind.Import | ProjectionRequestKind.Forget; documentId: string; cursor: number | null; importError: string | null };
```

- [x] **Step 6: Implement** `apps/server/src/history/waiting-requests.ts`:

```ts
import { ProjectionRequestCrashedError, ProjectionRequestKind, type BlocksReply, type ProjectionRequest, type VersionReply } from './projection-messages';

export type ServedReply = VersionReply | BlocksReply;
export type ServedRequest = Extract<ProjectionRequest, { kind: ProjectionRequestKind.Version | ProjectionRequestKind.Blocks }>;
type Waiter = { resolve: (reply: ServedReply) => void; reject: (error: Error) => void };
type WaitingRequest = { request: ServedRequest; waiters: Waiter[]; posts: number };

export function requestKeyOf({ kind, documentId, sequence }: { kind: ServedRequest['kind']; documentId: string; sequence: number | null }): string {
  if (kind === ProjectionRequestKind.Version) return `${kind}:${documentId}@${sequence}`;
  return `${kind}:${documentId}`;
}

function keyOfRequest(request: ServedRequest): string {
  if (request.kind === ProjectionRequestKind.Version) return requestKeyOf(request);
  return requestKeyOf({ ...request, sequence: null });
}

export class WaitingRequests {
  private readonly waiting = new Map<string, WaitingRequest>();

  add({ request, waiter }: { request: ServedRequest; waiter: Waiter }): boolean {
    const key = keyOfRequest(request);
    const existing = this.waiting.get(key);
    if (existing) {
      existing.waiters.push(waiter);
      return false;
    }
    this.waiting.set(key, { request, waiters: [waiter], posts: 1 });
    return true;
  }

  resolve(reply: ServedReply): void {
    const entry = this.take(requestKeyOf(reply));
    if (entry) entry.waiters.forEach(({ resolve }) => resolve(reply));
  }

  reject({ key, error }: { key: string; error: Error }): void {
    const entry = this.take(key);
    if (entry) entry.waiters.forEach(({ reject }) => reject(error));
  }

  rejectAll(errorOf: () => Error): void {
    [...this.waiting.keys()].forEach((key) => this.reject({ key, error: errorOf() }));
  }

  repost({ post, maxPosts }: { post: (request: ServedRequest) => void; maxPosts: number }): void {
    [...this.waiting].forEach(([key, waiting]) => {
      if (waiting.posts >= maxPosts) return this.reject({ key, error: new ProjectionRequestCrashedError() });
      waiting.posts += 1;
      post(waiting.request);
    });
  }

  private take(key: string): WaitingRequest | null {
    const entry = this.waiting.get(key);
    this.waiting.delete(key);
    if (!entry) return null;
    return entry;
  }
}
```

- [x] **Step 7: Rewrite the scheduler around it.**
  - **Delete:** `ServedReply`, `Waiter`, `WaitingRequest`, `versionKey`, `blocksKey`, `isServedReply`, `keyOfReply`, `keyOfFailure`, the `waiting` map, `resolveWaiters`, `rejectWaiters`, `settleDone` and `repostWaiting`.
  - **Add:** `private readonly waitingRequests = new WaitingRequests();`.

```ts
version({ documentId, sequence }: { documentId: string; sequence: number }): Promise<VersionReply> {
  return this.serve({ kind: ProjectionRequestKind.Version, documentId, sequence }) as Promise<VersionReply>;
}

blocks(documentId: string): Promise<BlocksReply> {
  return this.serve({ kind: ProjectionRequestKind.Blocks, documentId }) as Promise<BlocksReply>;
}

private serve(request: ServedRequest): Promise<ServedReply> {
  if (this.isDegraded) return Promise.reject(new ProjectionDegradedError());
  if (this.stopping) return Promise.reject(new ProjectionStoppedError());
  return new Promise((resolve, reject) => {
    const isNewRequest = this.waitingRequests.add({ request, waiter: { resolve, reject } });
    if (isNewRequest) this.currentWorker.postMessage(request);
  });
}

private settle(reply: ProjectionReply): void {
  if (reply.kind === ProjectionReplyKind.Failed) return this.settleFailure(reply);
  if (reply.kind === ProjectionRequestKind.Version || reply.kind === ProjectionRequestKind.Blocks) return this.waitingRequests.resolve(reply);
  if (reply.kind === ProjectionRequestKind.Forget) return this.settleForget(reply.documentId);
  if (reply.kind === ProjectionRequestKind.Import) return this.settleImport(reply);
  return this.settleProject(reply);
}

private settleImport({ documentId, importError }: ProjectionDoneReply): void {
  this.pendingImports.delete(documentId);
  if (this.rebuildingDocuments.has(documentId)) this.projectReimported(documentId);
  if (importError !== null) this.reportImportFailure({ documentId, importError });
}

private projectReimported(documentId: string): void {
  this.reimportedDocuments.add(documentId);
  this.schedule(documentId);
}

private settleProject({ documentId }: ProjectionDoneReply): void {
  this.inFlight.delete(documentId);
  if (this.documentsNeedingRerun.delete(documentId)) return this.schedule(documentId);
  if (this.reimportedDocuments.delete(documentId)) this.rebuildingDocuments.delete(documentId);
}
```

  - **`settleFailure`:** the first line becomes `if (requestKind === ProjectionRequestKind.Version || requestKind === ProjectionRequestKind.Blocks) return this.waitingRequests.reject({ key: requestKeyOf({ kind: requestKind, documentId, sequence: reply.sequence }), error: new Error(message) });`.
  - **`stop`:** `this.waitingRequests.rejectAll(() => new ProjectionStoppedError());`.
  - **`degrade`:** `this.waitingRequests.rejectAll(() => new ProjectionDegradedError());`.
  - **`restart`:** `this.waitingRequests.repost({ post: (request) => this.currentWorker.postMessage(request), maxPosts: MAX_REQUEST_POSTS });`.

  A Project reply always carries `importError: null`, because Task 13's `handleProject` builds it that way. So dropping today's import-error early return on the Project path changes nothing.

- [x] **Step 8: Run the tests and see them pass.** Run the Step 3 command, then `pnpm typecheck`. Then `pnpm --filter @superdoc-history/server exec vitest run src/history src/collaboration src/insights`.

- [x] **Step 9: Commit.** `git commit -m "refactor(server): settle each projection reply kind in its own method"`. — evidence: `1099750`

### Task 15: Split `startServer`

Covers 2.1.

**Files:**
- Modify: `apps/server/src/server.ts`
- Test: `apps/server/src/server.test.ts`

**Interfaces:**
- Produces: these module-private functions in `server.ts`:
  - `openDatabases({ databaseDirectory, documentFilesDirectory }): Databases`
  - `closeDatabases(databases: Databases): void`
  - `createServices({ environment, databases, documentFilesDirectory, languageModel, versionRoomPolicy }): { auth: Auth; services: ServerServices }`
  - `resumeProjections({ databases, services }): void`
  - `closeCollaboration(services: ServerServices): Promise<void>`
  - `stopServer({ services, databases, httpServer, sockets }): Promise<void>`

  `Databases` is `{ database: AuthDatabase; historySqlite: Database.Database; readModelSqlite: Database.Database }`. `startServer`'s signature and `RunningServer` are unchanged.

- [x] **Step 1: Write the shutdown pins**, green on today's code, in `server.test.ts`. Add the `Database` import from `better-sqlite3` and `vi`:

```ts
test('stop closes collaboration in order, then the three databases', async () => {
  const running = await startServer({ environment: testEnvironment(), webDistDirectory: null });
  const { versionRooms, hocuspocus, throttle, scheduler, insights } = running.services;
  const closeDatabase = vi.spyOn(Database.prototype, 'close');
  const spies = [vi.spyOn(versionRooms, 'stop'), vi.spyOn(hocuspocus, 'destroy'), vi.spyOn(throttle, 'stop'), vi.spyOn(scheduler, 'stop'), vi.spyOn(insights.jobRunner, 'idle'), closeDatabase];
  await running.stop();
  const firstCalls = spies.map((spy) => spy.mock.invocationCallOrder[0]!);
  expect(firstCalls).toEqual([...firstCalls].sort((left, right) => left - right));
  expect(closeDatabase).toHaveBeenCalledTimes(3);
  vi.restoreAllMocks();
});
```

Extend "startServer rejects instead of hanging when the port is taken" with spies made before `startServer`. Import `ProjectionScheduler` from `./history/projection-scheduler`:

```ts
const stopScheduler = vi.spyOn(ProjectionScheduler.prototype, 'stop');
const closeDatabase = vi.spyOn(Database.prototype, 'close');
...
expect([stopScheduler.mock.calls.length, closeDatabase.mock.calls.length]).toEqual([1, 3]);
expect(stopScheduler.mock.invocationCallOrder[0]).toBeLessThan(closeDatabase.mock.invocationCallOrder[0]!);
vi.restoreAllMocks();
```

- [x] **Step 2: Run them and see them green on today's code.** `pnpm --filter @superdoc-history/server exec vitest run src/server.test.ts`.

- [x] **Step 3: Commit the pins.** `git commit -m "test(server): pin the shutdown order and the listen failure cleanup"`. — evidence: `98fcf23`

- [x] **Step 4: Split.** Today's statements move, in today's order, into these functions.

**`openDatabases`** runs:
  1. `ensureWritableDirectory(databaseDirectory)`
  2. `ensureWritableDirectory(documentFilesDirectory)`, so the "documents directory is not writable" test still fails before any database opens
  3. open the auth database and run `runMigrations`
  4. open the history database and migrate it
  5. open the read model database and migrate it

**`createServices`** runs:
  1. `documents`
  2. `insightsRepository` and its `failInterrupted`
  3. `updateLog`
  4. `readModel`
  5. `scheduler`
  6. `auth`
  7. `versions`
  8. `versionRooms`
  9. `throttle`
  10. `hocuspocus`
  11. `timelinePipelines`
  12. `storage`
  13. `runtime`
  14. `shareLinks`
  15. `jobRunner`
  16. `insights`
  17. `services`

  The `readPipeline` and `readSelection` closures still name `services`. They run only after `createServices` returns, which the existing timeline and insights tests prove.

**`resumeProjections`** runs:

```ts
function resumeProjections({ databases, services }: { databases: Databases; services: ServerServices }): void {
  findDocumentsToProject({ historySqlite: databases.historySqlite, readModelSqlite: databases.readModelSqlite }).forEach((documentId) => services.scheduler.schedule(documentId));
  findDocumentsWithoutMarks(databases.readModelSqlite).forEach((documentId) => void services.scheduler.rebuild({ documentId, filePath: services.storage.pathOf(documentId) }));
}
```

Both loops used to run between service constructions, and they now run right after `createServices`. Nothing can reach the scheduler before `listen`, and the relative order of the two loops is kept. "a document projected before marks existed is rebuilt at startup" proves it.

**`closeCollaboration` and `stopServer`:**

```ts
async function closeCollaboration(services: ServerServices): Promise<void> {
  await services.versionRooms.stop();
  await services.hocuspocus.destroy();
  services.throttle.stop();
  await services.scheduler.stop();
  await services.insights.jobRunner.idle();
}

async function stopServer({ services, databases, httpServer, sockets }: { services: ServerServices; databases: Databases; httpServer: ServerType; sockets: WebSocketServer }): Promise<void> {
  await closeCollaboration(services);
  sockets.clients.forEach((client) => client.terminate());
  sockets.close();
  closeAllConnectionsWhenSupported(httpServer);
  await closeServer(httpServer);
  closeDatabases(databases);
}
```

**`startServer`:**

```ts
export async function startServer({ environment, webDistDirectory, languageModel = chooseLanguageModel(environment.llm), versionRoomPolicy = DEFAULT_VERSION_ROOM_POLICY }: { environment: Environment; webDistDirectory: string | null; languageModel?: LanguageModelChoice; versionRoomPolicy?: VersionRoomPolicy }): Promise<RunningServer> {
  const documentFilesDirectory = join(environment.databaseDirectory, DOCUMENT_FILES_DIRECTORY);
  const databases = openDatabases({ databaseDirectory: environment.databaseDirectory, documentFilesDirectory });
  const { auth, services } = createServices({ environment, databases, documentFilesDirectory, languageModel, versionRoomPolicy });
  resumeProjections({ databases, services });
  const app = createApp({ auth, environment, services });
  if (webDistDirectory) mountStaticWeb({ app, webDistDirectory });
  app.notFound((context) => context.json({ error: NOT_FOUND_MESSAGE }, HttpStatus.NotFound));
  const httpServer = await listen({ app, port: environment.port }).catch(async (error) => {
    await closeCollaboration(services);
    closeDatabases(databases);
    throw error;
  });
  const { port } = httpServer.address() as AddressInfo;
  const sockets = attachCollaboration({ httpServer: httpServer as Server, hocuspocus: services.hocuspocus, versionRooms: services.versionRooms, path: ApiPath.Collaboration, allowedOrigin: environment.appOrigin });
  return { httpServer, port, auth, database: databases.database, services, stop: () => stopServer({ services, databases, httpServer, sockets }) };
}
```

Import `type WebSocketServer` from `ws` and `type Database` from `better-sqlite3`.

- [x] **Step 5: Run the tests.** `pnpm typecheck`, then `pnpm --filter @superdoc-history/server test:unit`, the whole server suite, because every integration test starts a server.

- [x] **Step 6: Commit.** `git commit -m "refactor(server): split startServer into open, create, resume and stop"`. — evidence: `196cb14`

### Task 16: One document-forget fan-out

Covers 2.9.

**Files:**
- Modify: `apps/server/src/collaboration/collaboration-runtime.ts`, `apps/server/src/documents/documents-routes.ts`, `apps/server/src/server.ts`
- Test: `apps/server/src/documents/documents-routes.test.ts`

**Interfaces:**
- Consumes: `InsightsServices` (type-only import from `../http/app`), Task 2's `jobRunner`, and Task 15's `createServices`.
- Produces: `createCollaborationRuntime({ ..., insights })`. `DocumentRuntime.forget(documentId)` now also clears the three insights cooldowns.

- [x] **Step 1: Write the failing test** in `documents-routes.test.ts`, beside "delete removes the row, the file, the log and the events, and closes the room":

```ts
test('forgetting a document clears its insights cooldowns after the projection forgets it', async () => {
  const { server, documentId } = await documentWithOwner();
  const { topics, summaries, selection } = server.services.insights;
  [topics, summaries, selection].forEach((service) => service.cooldown.start(documentId));
  const projectionForget = vi.spyOn(server.services.scheduler, 'forget');
  const insightsForgets = [vi.spyOn(topics, 'forget'), vi.spyOn(summaries, 'forget'), vi.spyOn(selection, 'forget')];
  await server.services.runtime.forget(documentId);
  expect([topics, summaries, selection].map((service) => service.cooldown.size())).toEqual([0, 0, 0]);
  const order = [projectionForget, ...insightsForgets].map((spy) => spy.mock.invocationCallOrder[0]!);
  expect(order).toEqual([...order].sort((left, right) => left - right));
  await server.stop();
});

test('deleting a document forgets it once through the runtime, then removes the file', async () => {
  const { server, owner, created } = await uploadedDocument();
  const forget = vi.spyOn(server.services.runtime, 'forget');
  const remove = vi.spyOn(server.services.storage, 'remove');
  await fetch(`${server.baseUrl}${documentApiPath({ documentId: created.id })}`, { method: 'DELETE', headers: { cookie: owner.cookie, origin: server.baseUrl } });
  expect(forget).toHaveBeenCalledTimes(1);
  expect(forget.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]!);
  await server.stop();
});
```

Use the fixture helpers the file already has for "documentWithOwner" and an uploaded or created document. Match their real names when writing the test.

- [x] **Step 2: Run them.** `pnpm --filter @superdoc-history/server exec vitest run src/documents/documents-routes.test.ts`. The first fails with cooldown sizes `[1, 1, 1]`, because today the route, not the runtime, clears them. The second passes, pinning the route order.

- [x] **Step 3: Commit both tests.** `git commit -m "test(server): pin the document-forget fan-out"`. — evidence: `fb10f8c`

- [x] **Step 4: Move the insights forgets into the runtime.** `createCollaborationRuntime` takes `insights: InsightsServices`, and `forget` ends with these lines after `await scheduler.forget(documentId);`:

```ts
insights.topics.forget(documentId);
insights.summaries.forget(documentId);
insights.selection.forget(documentId);
```

In `createServices`, build `jobRunner` and `insights` before `runtime` and pass `insights` in. The insights services depend only on `insightsRepository`, `scheduler`, `languageModel` and the lazy `services` closures. The route becomes:

```ts
routes.delete('/:documentId', async (context) => {
  const documentId = authorizedDocumentId({ context, documents, minimumRole: DocumentRole.Owner });
  documents.remove(documentId);
  await runtime.forget(documentId);
  await storage.remove(documentId);
  return context.body(null, HttpStatus.NoContent);
});
```

- [x] **Step 5: Run the tests and see them pass.** Run the Step 2 command, then `pnpm typecheck`. Then `pnpm --filter @superdoc-history/server exec vitest run src/documents src/insights src/history src/collaboration`. The existing insights-routes test that checks deletion clears the cooldowns stays green unchanged.

- [x] **Step 6: Commit.** `git commit -m "refactor(server): forget a document through the runtime alone"`. — evidence: `53497ef`

### Task 17: Lane gate

- [ ] **Step 1: Run the whole local gate.** `pnpm typecheck`, `pnpm test:unit` and `pnpm test:e2e`, which is `/verify`. All green. — partial: typecheck exit 0 and test:unit exit 0 at `53497ef` (types 16, history 83, web 218, server 419 + 2 skipped); test:e2e left to CI by the lead
- [x] **Step 2: Run the convention sweep.** Each of these must print nothing: — evidence: all four printed nothing at `53497ef`

```bash
rg -n '\?\? ' apps/server/src libs/types/src libs/history/src/timeline --type ts
rg -n "from '\.\./server'" apps/server/src/http
rg -nw 'queryOf|parseSelection|keyOfReply|keyOfFailure|isServedReply|DocumentCooldown|InsightsWorker' apps/server/src
rg -n 'describeError' apps/server/src/history/projection-messages.ts
```

- [x] **Step 3: Write the tester briefing.** Write `tester-briefing.md` in this folder. It lists the new tests, red before and green after, from `git log --oneline main..` and states the five Review Focus behaviours as hypotheses.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1.3 | A module still imports the LLM defaults from the job runner, recreating the config → runtime edge | `rg "from '\.\./insights" apps/server/src/config` prints a line; typecheck may still pass | Repoint the import; revert the task commit if typecheck breaks |
| 2.1 | A projection-worker `worker` gets renamed to `jobRunner` in a test | `projection-scheduler.test.ts` or `version-rooms.test.ts` fails to compile on `currentWorker` | Restore those lines from `git diff`; the rename touches only the insights job runner |
| 2.3 | A `libs/history` call loses its `log:` key | typecheck fails with "Object literal may only specify known properties" | Write `{ log: updateLog }` |
| 3.4 | Author identity order changes when an author key looks like an integer, because object keys order numerically first while `Map` keeps insertion order | A band order difference in the timeline route tests | Better Auth ids are random alphanumeric strings, so this is accepted; if a test shows it, keep the `Map` in `bandIdentities` and revert 4.11 only |
| 4.5 | A Retry-After value changes at one of eight sites | `timeline-client.ts` assertion `RETRY_AFTER_SECONDS_TEXT`, or insights route tests reading the header | Revert the task commit |
| 5.5 | A handler that needs the role or user loses it | typecheck fails on `role` or `userId` | Keep `requireDocumentRole` there, as `GET /:documentId` does |
| 6.5 | A rebuild that throws now leaves a stale pipeline marked recently used | Not observable in tests; at worst one entry evicts later than before | Accepted; revert to the inline map if a reviewer objects |
| 6.7 | Hocuspocus hooks refresh room recency because `get` was used | "the limit evicts the least recently used instance" fails, or evicts the wrong room | Use `peek` in `cancelIdle`, `scheduleIdle` and `destroy` |
| 6.7 | Evicted rooms are no longer destroyed | `versionRooms.size()` stays at the limit but sockets stay open; the eviction test's `closed` spy never fires | `set` must forward every evicted entry to `destroyRoom` |
| 7.5 | The version failure TTL boundary shifts by one millisecond | "a failed version answers 503 then retries after the TTL" or similar versions-routes timing test fails | `remainingMs > 0` is the same predicate as `elapsed < TTL`; check the clock source, which is `Date.now` in both |
| 8.5 | The restart budget counts differently | "degrades after too many restarts" fails | `SlidingWindow` prunes with `time > now - window`, identical to today's `now - time < window`; check the off-by-one in the test first |
| 9.5 | `VersionRooms.stop` no longer rejects on a failing destroy, or no longer clears its timer | "stop clears its timeout when destroying a room fails" fails | `withTimeout` must race the work's rejection; check `.finally` |
| 10.4 | A request runs the session middleware before the forgery check | The new forgery-order pin answers 401 instead of 403 | Put `sameOriginOnly` before `signedIn` in the `app.use` call |
| 10.6 | `limit` omitted is no longer 50 | The events route tests paging with no `limit` fail | Check zod 4 `.default` on `z.coerce`; fall back to today's two returns |
| 11.5 | A refused upgrade leaks a socket error listener, or an unavailable one loses it | attach-collaboration tests fail, or a socket error crashes the process in E2E | Restore the `.then(onFulfilled, onRejected)` form |
| 13.4 | Forget order or import cursor timing changes | `projection-handler.test.ts` call-order assertions fail | Move the bodies verbatim from the pre-task worker |
| 13.5 | The production worker cannot load its new import | `pnpm --filter @superdoc-history/server build` passes, but the E2E projection walks never project | `tsup` bundles imports into `projection-worker.js`; check `dist/` and the `external` list |
| 14.7 | A Blocks reply misses its waiter because the key used the reply's cursor | The pin "a blocks reply resolves its waiter whatever cursor it carries" times out | `requestKeyOf` must ignore `sequence` for Blocks |
| 14.7 | A rebuild never ends | The pin "a rebuild imports after forgetting..." sees `isRebuilding` stay true | Compare `settleImport` and `settleProject` against the pre-task `settleDone` |
| 15.4 | A database opens before the documents directory check | "fails with a named error when the documents directory is not writable" fails, or leaks a handle | `ensureWritableDirectory` for both directories stays first in `openDatabases` |
| 15.4 | The shutdown order changes | The new shutdown pin's order assertion fails | Restore `closeCollaboration` to today's five lines |
| 16.4 | Insights cooldowns are cleared before the projection forgets | The new fan-out pin's order assertion fails | Append the three forgets after `await scheduler.forget` |

**Steps with no backout:** none. Every task is one or two commits and reverts cleanly. No data, schema or wire format changes.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict. The refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** not applicable, because no UI was touched. The tester states this with the E2E log path as evidence.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
