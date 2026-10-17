# Refinement: tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove 84 tracked tests and rewrite 9 so the suites guard the same behaviour in less CI time (742 → 658 tests).

**Architecture:** Four tasks, one per package (libs, server unit, web unit, E2E). Each removed test is dropped for a stated reason or folded into a named surviving test that carries its assertion. Each task ends with its suite green at an exact count, then one commit.

**Tech Stack:** Vitest 5 (server, web, libs), Playwright (E2E), pnpm workspaces, Prettier (from lane B).

**Spec:** `spec.md` (same folder). It lists every removed test and the surviving test that owns its assertion.

**Tier:** 🟢
**Seam:** test files only, plus `data-faded` on the streamgraph band `<path>`.
**Assumptions (decided, owner can override):**
- Lane B is merged first. Paths are as after lane B: `apps/server/src/repository-shape/` (with `repository-files.ts`), `apps/web/src/testing/` (alias `@/testing/`), `apps/web/src/features/versions/time-travel.test.tsx`.
- Server counts assume Docker Compose is available, as in CI. Without it the rendered-compose block of 8 tests skips: read 375 passed + 10 skipped before and 328 passed + 10 skipped after.
- PR #7 (failed-summary E2E) is merged; that test is not touched.

## Global Constraints

- No comments, flat `if`s, early returns, no `else`, no `?? default`, enums over literals, named parameters for more than one argument, array methods over loops, no `.js` import extensions (`CLAUDE.md`).
- No `sleep`, no `waitForTimeout`.
- Run `pnpm format` on touched files before each commit (lane B made Prettier a CI gate, print width 140).
- `tsconfig` has no `noUnusedLocals`: remove every import, constant and helper a step names as unused; the step lists them.
- Branch `chore/refinement-tests`. Commits are Conventional Commits; never `git add -A` or `git add .`; stage the files the step names.
- A test count that differs from the step's expected count stops the task: reconcile before going on.

## Review Focus

1. A fold that silently drops the absorbed assertion (a renamed test loses an `expect`). Each fold has a mutation check in `test-plan.md` → "Folds still guard".
2. Fake timers leaking from the rewritten version-rooms test into the next test of that file. Task 2 Step 7 restores real timers before any other await; test plan checks the whole file passes in order.
3. Mutating `services.hocuspocus.configuration.timeout` on one test server leaking into another server. Each test starts its own server; test plan runs the whole attach-collaboration file.
4. A merged E2E walk exceeding the 120 s Playwright timeout (narrow viewport now also summarizes; keyboard walk now does both checks). Test plan records each merged walk's duration from the run.
5. Prettier reflowing a merged body into something that no longer reads as written. Steps run `pnpm format` before commit and the reviewer reads the formatted diff.

---

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/{routes.test.ts,documents.test.ts,timeline.test.ts}`, `libs/history/src/{edit-windows.ts,edit-windows.test.ts,single-flight.ts,single-flight.test.ts,index.ts}`, `libs/history/src/timeline/words.test.ts`, `docs/adr/0001-event-sourcing-over-yjs.md` | `developer-tests-libs` |
| G2 | `apps/server/src/**/*.test.ts` named in Task 2 | `developer-tests-server` |
| G3 | `apps/web/src/features/{timeline,versions,editor}/*.test.ts(x)` named in Task 3, `apps/web/src/features/timeline/streamgraph.tsx` | `developer-tests-web` |
| G4 | `e2e/{selection-summary,time-travel,timeline}.spec.ts` | `developer-tests-e2e` |

## Sequencing

The groups own disjoint files and can run in parallel. G2 removes the server `sharePagePath` test that G1 re-homes in `libs/types`; the total only adds up when both land, so the branch is not pushed before G1 and G2 are both committed. Commit order on the branch: G1, G2, G3, G4.

---

### Task 1: libs — types and history (G1)

**Files:**
- Create: `libs/types/src/routes.test.ts`
- Modify: `libs/types/src/documents.test.ts`, `libs/types/src/timeline.test.ts`, `libs/history/src/index.ts`, `libs/history/src/timeline/words.test.ts`, `docs/adr/0001-event-sourcing-over-yjs.md`
- Delete: `libs/history/src/edit-windows.ts`, `libs/history/src/edit-windows.test.ts`, `libs/history/src/single-flight.ts`, `libs/history/src/single-flight.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `libs/types/src/routes.test.ts` holds the `sharePagePath` assertion that Task 2 removes from the server.

**Counts:** libs/types 13 → 7; libs/history 80 → 72.

- [ ] **Step 1: Record the before counts**

Run: `pnpm --filter @superdoc-history/types test:unit && pnpm --filter @superdoc-history/history test:unit`
Expected: `Tests  13 passed (13)` and `Tests  80 passed (80)`.

- [ ] **Step 2: Create the routes table**

`libs/types/src/routes.test.ts`:

```ts
import { expect, test } from 'vitest';
import {
  DocumentResource,
  documentApiPath,
  selectionSummaryApiPath,
  sharePagePath,
  timelineEditsApiPath,
  topicsRefreshApiPath,
  VersionResource,
  versionApiPath,
  versionCollaborationPath,
  versionViewPagePath,
} from './routes';

test('builds every path with its ids encoded', () => {
  const built = [
    documentApiPath({ documentId: 'a/b' }),
    documentApiPath({ documentId: 'd1', resource: DocumentResource.Events }),
    versionApiPath({ documentId: 'a/b', sequence: 42 }),
    versionApiPath({ documentId: 'd1', sequence: 7, resource: VersionResource.Text }),
    topicsRefreshApiPath('d1'),
    timelineEditsApiPath('d1'),
    versionViewPagePath({ documentId: 'd1', sequence: 42 }),
    versionCollaborationPath({ documentId: 'a/b', sequence: 42 }),
    selectionSummaryApiPath('a/b'),
    sharePagePath('a b'),
  ];
  expect(built).toEqual([
    '/api/documents/a%2Fb',
    '/api/documents/d1/events',
    '/api/documents/a%2Fb/versions/42',
    '/api/documents/d1/versions/7/text',
    '/api/documents/d1/topics/refresh',
    '/api/documents/d1/timeline/edits',
    '/documents/d1/versions/42/view',
    '/collaboration/versions/a%2Fb/42',
    '/api/documents/a%2Fb/summaries/selection',
    '/share/a%20b',
  ]);
});
```

- [ ] **Step 3: Trim `documents.test.ts`**

Delete "ranks owner above editor above reader and maps links to roles" and "builds encoded document api paths". The file becomes:

```ts
import { describe, expect, test } from 'vitest';
import { titleSchema } from './documents';

describe('documents contracts', () => {
  test('trims a title and rejects a blank one', () => {
    expect(titleSchema.parse({ title: '  Plan  ' }).title).toBe('Plan');
    expect(titleSchema.safeParse({ title: '   ' }).success).toBe(false);
  });
});
```

- [ ] **Step 4: Replace `timeline.test.ts` with the type-level check**

Delete the four path tests and "the retry header and the shortest retry keep their values". Rewrite "the selection query parameters are the page search parameters". New assertion: every `TimelineSearchParam` value is a `TimelineQueryParam` value, checked by `pnpm typecheck`.

```ts
import { expectTypeOf, test } from 'vitest';
import { TimelineQueryParam, TimelineSearchParam } from './timeline';

test('every page search parameter is also a timeline query parameter', () => {
  expectTypeOf<`${TimelineSearchParam}`>().toExtend<`${TimelineQueryParam}`>();
});
```

- [ ] **Step 5: Prove the type-level check is red for the right reason**

Temporarily change `TimelineSearchParam.Topic = 'topic'` to `'topics'` in `libs/types/src/timeline.ts`.
Run: `pnpm --filter @superdoc-history/types typecheck`
Expected: FAIL in `timeline.test.ts` on `toExtend`. Restore `'topic'`; typecheck passes.

- [ ] **Step 6: Delete the unused history modules and the keystroke duplicate**

```bash
git rm libs/history/src/edit-windows.ts libs/history/src/edit-windows.test.ts libs/history/src/single-flight.ts libs/history/src/single-flight.test.ts
```

In `libs/history/src/index.ts` delete the lines `export * from './edit-windows';` and `export * from './single-flight';`.
In `libs/history/src/timeline/words.test.ts` delete the test "counts a run built from keystrokes".
Run: `rg -n "edit-windows|single-flight|groupIntoWindows|SingleFlight|EditWindow|WindowRules" apps libs e2e`
Expected: no output.

- [ ] **Step 7: ADR 0001 addendum**

Append to `docs/adr/0001-event-sourcing-over-yjs.md`, after "Revisit when", in the style of ADR 0004:

```markdown
## Addendum 2026-10-17

The window grouping (`idleGapMs`, `maxWindowMs`, `coEditGapMs`) was ported from the POC but never used: the timeline groups edits into runs per author, block and bin (`libs/history/src/timeline/`), so `edit-windows` and `single-flight` were deleted in refinement-tests; the POC still proves H10.
```

- [ ] **Step 8: Run the suites and typecheck**

Run: `pnpm --filter @superdoc-history/types test:unit && pnpm --filter @superdoc-history/history test:unit && pnpm typecheck`
Expected: `Tests  7 passed (7)`, `Tests  72 passed (72)`, typecheck clean.

- [ ] **Step 9: Commit**

```bash
pnpm format
git add libs/types/src/routes.test.ts libs/types/src/documents.test.ts libs/types/src/timeline.test.ts libs/history/src/index.ts libs/history/src/timeline/words.test.ts docs/adr/0001-event-sourcing-over-yjs.md
git commit -m "test(types,history): fold the path tests into one table and delete the unused windows and single flight"
```

(The `git rm` in Step 6 already staged the deletions.)

---

### Task 2: server unit tests (G2)

**Files (all under `apps/server/src/`):**
- Modify: `repository-shape/delivery-docs.test.ts`, `repository-shape/ci-workflow.test.ts`, `insights/llm-client.test.ts`, `insights/prompts.test.ts`, `database/connection.test.ts`, `database/migrate.test.ts`, `documents/share-links-routes.test.ts`, `documents/share-links.test.ts`, `auth/session.test.ts`, `http/app.test.ts`, `collaboration/room-name.test.ts`, `history/timeline-routes.test.ts`, `documents/documents-routes.test.ts`, `history/history-routes.test.ts`, `insights/insights-routes.test.ts`, `insights/selection-summaries-service.test.ts`, `insights/topics-service.test.ts`, `collaboration/collaboration-server.test.ts`, `collaboration/attach-collaboration.test.ts`, `history/versions-routes.test.ts`, `collaboration/version-rooms.test.ts`

**Interfaces:**
- Consumes: Task 1's `libs/types/src/routes.test.ts` owns the `sharePagePath` assertion.
- Produces: nothing other tasks use.

**Counts:** 383 passed + 2 skipped → 336 passed + 2 skipped.

| File | Before | After |
|---|---|---|
| `repository-shape/delivery-docs.test.ts` | 18 | 4 |
| `repository-shape/ci-workflow.test.ts` | 8 | 2 |
| `insights/llm-client.test.ts` | 5 | 4 |
| `insights/prompts.test.ts` | 14 | 13 |
| `database/connection.test.ts` | 4 | 3 |
| `database/migrate.test.ts` | 3 | 2 |
| `documents/share-links-routes.test.ts` | 13 | 12 |
| `documents/share-links.test.ts` | 4 | 2 |
| `auth/session.test.ts` | 2 | 1 |
| `http/app.test.ts` | 14 | 13 |
| `collaboration/room-name.test.ts` | 2 | 1 |
| `history/timeline-routes.test.ts` | 16 | 12 |
| `history/history-routes.test.ts` | 11 | 10 |
| `insights/insights-routes.test.ts` | 26 | 23 |
| `insights/selection-summaries-service.test.ts` | 22 | 16 |
| `insights/topics-service.test.ts` | 22 | 19 |

- [ ] **Step 1: Record the before count**

Run: `pnpm --filter @superdoc-history/server test:unit`
Expected: `Tests  383 passed | 2 skipped (385)`.

- [ ] **Step 2: Repository-shape prose (owner decision)**

`repository-shape/delivery-docs.test.ts` becomes (helpers `slugOf`, `headingSlugs`, `isBroken`, `brokenTargets` unchanged; `readmeSections`, `lineAbove` and every constant not shown are deleted):

```ts
import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import { capturedNames, composeVariables, readRepositoryFile, repositoryPath } from './repository-files';

const README_FILE = 'README.md';
const RUNBOOK_FILE = 'docs/features/deploy/runbook.md';
const LINKED_DOCUMENTS = [README_FILE, RUNBOOK_FILE];
const LINK_PATTERN = /\]\(([^)\s]+)\)/g;
const HEADING_PATTERN = /^#{1,6} (.+)$/gm;
const FENCED_BLOCK_PATTERN = /```[\s\S]*?```/g;
const SLUG_DISALLOWED_PATTERN = /[^a-z0-9 -]/g;
const SPACE_PATTERN = / /g;
const EXTERNAL_LINK_PATTERN = /^(https?:|mailto:|#)/;
const ANCHOR_SEPARATOR = '#';
const MARKDOWN_EXTENSION = '.md';

function slugOf(heading: string): string {
  return heading.toLowerCase().replace(SLUG_DISALLOWED_PATTERN, '').replace(SPACE_PATTERN, '-');
}

function headingSlugs(path: string): string[] {
  return capturedNames({ text: readRepositoryFile(path).replace(FENCED_BLOCK_PATTERN, ''), pattern: HEADING_PATTERN }).map(slugOf);
}

function isBroken({ document, target }: { document: string; target: string }): boolean {
  const path = target.split(ANCHOR_SEPARATOR, 1).join('');
  const anchor = target.slice(path.length + ANCHOR_SEPARATOR.length);
  const targetPath = posix.join(posix.dirname(document), path);
  if (!existsSync(repositoryPath(targetPath))) return true;
  if (!anchor) return false;
  if (!targetPath.endsWith(MARKDOWN_EXTENSION)) return false;
  return !headingSlugs(targetPath).includes(anchor);
}

function brokenTargets({ document, text }: { document: string; text: string }): string[] {
  return capturedNames({ text, pattern: LINK_PATTERN })
    .filter((target) => !EXTERNAL_LINK_PATTERN.test(target))
    .filter((target) => isBroken({ document, target }));
}

describe('delivery documents', () => {
  test.each(LINKED_DOCUMENTS)('every relative link in %s points at a file and a heading in the repository', (document) => {
    expect(brokenTargets({ document, text: readRepositoryFile(document) })).toEqual([]);
  });

  test('a link to a heading its target does not have is reported', () => {
    const text = `[missing](${RUNBOOK_FILE}#no-such-heading) [present](${RUNBOOK_FILE}#6-hand-it-over)`;
    expect(brokenTargets({ document: README_FILE, text })).toEqual([`${RUNBOOK_FILE}#no-such-heading`]);
  });

  test('the runbook sets every variable the compose file reads', () => {
    const runbook = readRepositoryFile(RUNBOOK_FILE);
    expect(composeVariables().filter((name) => !runbook.includes(`\n${name}=`))).toEqual([]);
  });
});
```

`repository-shape/ci-workflow.test.ts` becomes (the six dropped tests: docker job builds/boots/restarts, redeploy same volume, every sign-in bounded, bounded timeout, strict shell, verify requires Docker Compose):

```ts
import { describe, expect, test } from 'vitest';
import { readRepositoryFile } from './repository-files';

const WORKFLOW_FILE = '.github/workflows/verify.yml';
const DOCKER_JOB_START = '\n  docker:\n';
const NEXT_JOB_PATTERN = /\n {2}\S[^\n]*:\n/;
const WORKFLOW_PERMISSIONS = '\npermissions:\n  contents: read\n';
const JOBS_START = '\njobs:\n';
const FORBIDDEN_DOCKER_JOB_FRAGMENTS = ['\n    needs:', 'secrets.', 'docker restart'];

function dockerJob(): string {
  const workflow = readRepositoryFile(WORKFLOW_FILE);
  const start = workflow.indexOf(DOCKER_JOB_START);
  if (start === -1) throw new Error(`${WORKFLOW_FILE} has no docker job`);
  const rest = workflow.slice(start + DOCKER_JOB_START.length);
  const next = rest.search(NEXT_JOB_PATTERN);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('CI workflow', () => {
  test('the docker job needs no other job and no secret', () => {
    const job = dockerJob();
    expect(FORBIDDEN_DOCKER_JOB_FRAGMENTS.filter((fragment) => job.includes(fragment))).toEqual([]);
  });

  test('the workflow grants the token read access to the contents only', () => {
    const workflow = readRepositoryFile(WORKFLOW_FILE);
    expect(workflow).toContain(WORKFLOW_PERMISSIONS);
    expect(workflow.indexOf(WORKFLOW_PERMISSIONS)).toBeLessThan(workflow.indexOf(JOBS_START));
  });
});
```

Run: `pnpm --filter @superdoc-history/server exec vitest run src/repository-shape`
Expected: delivery-docs 4 passed, ci-workflow 2 passed, compose, dockerfile and entrypoint unchanged.

- [ ] **Step 3: Small drops and folds**

- `insights/llm-client.test.ts`: delete "the unavailable reasons name the language model, not one feature" and the constant `UNAVAILABLE_PREFIX`.
- `insights/prompts.test.ts`: delete "the system prompt tells the model to list each person separately", the constant `SEPARATE_PEOPLE_RULE` and `SELECTION_SYSTEM_PROMPT` from the `./prompts` import.
- `database/connection.test.ts`: delete "creates the auth tables after migrating" (keep `runMigrations`: the idempotence test uses it).
- `database/migrate.test.ts`: delete the `describe('runHistoryMigrations', …)` block and the now unused imports `MigrationSet`, `openSqliteFile`, `runHistoryMigrations`.
- `documents/share-links-routes.test.ts`: delete "the share page path is built from the token" and `sharePagePath` from its import (Task 1's routes table owns it).
- `documents/share-links.test.ts`: replace the first three tests with one; "another secret derives a different token" is covered by share-links-routes "links stored under another secret are regenerated and work":

```ts
test('one nonce and secret derive the same token and another nonce a different one', () => {
  const token = deriveShareToken({ secret: SECRET, nonce: 'nonce-one' });
  expect(deriveShareToken({ secret: SECRET, nonce: 'nonce-one' })).toBe(token);
  expect(deriveShareToken({ secret: SECRET, nonce: 'nonce-two' })).not.toBe(token);
});
```

- `auth/session.test.ts`: delete "returns null without a cookie" (app "me without a session returns a null user" goes through `readSession`).
- `http/app.test.ts`: delete the whole `describe('health', …)` block (server "still answers the health endpoint with the web directory mounted" asserts `{ status: 'ok' }`).
- `collaboration/room-name.test.ts`: the file keeps one test:

```ts
test('reads the document id from the SuperDoc v2.1 room name and refuses any other shape', () => {
  expect(documentIdFromRoomName(`sd2/v2.1/${DOCUMENT_ID}`)).toBe(DOCUMENT_ID);
  const refused = [`other/${DOCUMENT_ID}`, `sd2/v2.1/${DOCUMENT_ID}/x`, DOCUMENT_ID, 'sd2/v2.1/probe', `sd2/v2.1/${DOCUMENT_ID.toUpperCase()}`, `sd2/v2.1/${DOCUMENT_ID}\n`];
  expect(refused.map(documentIdFromRoomName)).toEqual(refused.map(() => null));
});
```

- [ ] **Step 4: Timeline and history routes fold into the library tests**

`history/timeline-routes.test.ts`: delete "term filters runs case-insensitively", "two hours of history choose two-minute bins", "bins carry the version of their end" and "deleting the runtime document forgets its cached pipeline". Remove the now unused `MAX_BINS` import line, `vi` from the vitest import, and the constants `TWO_HOURS_EVENTS` and `TEN_MINUTE_BIN_MS`.

`documents/documents-routes.test.ts`, test "delete removes the row, the file, the log and the events, and closes the room": add the pipeline spy (first line below) before the existing delete request and its assertion (last line below) after the existing status check. The middle two lines are already there:

```ts
  const forgetPipeline = vi.spyOn(server.services.timelinePipelines, 'forget');
  const deleted = await request({ server, cookie: owner.cookie, path: pathOf({ documentId: created.id }), method: HttpMethod.Delete });
  expect(deleted.status).toBe(HttpStatus.NoContent);
  expect(forgetPipeline).toHaveBeenCalledWith(created.id);
```

`history/history-routes.test.ts`: delete "events page on a sequence boundary" and its helper `sequencesFollowing`. Replace "events default to a 500-event page" with:

```ts
test('events default to a 500-event page and honour a smaller limit after a sequence', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitBulkEvents({ server, documentId, userId: owner.id, count: BULK_EVENT_COUNT });
  const page = (await (await fetchEventsPage({ server, documentId, cookie: owner.cookie, query: '' })).json()) as DocumentEditEvents;
  expect(page.events).toHaveLength(EVENTS_PAGE_SIZE);
  expect(page.nextAfterSequence).toBe(EVENTS_PAGE_SIZE);
  const query = `limit=1&afterSequence=${EVENTS_PAGE_SIZE}`;
  const small = (await (await fetchEventsPage({ server, documentId, cookie: owner.cookie, query })).json()) as DocumentEditEvents;
  expect(small.events.map((event) => event.sequence)).toEqual([EVENTS_PAGE_SIZE + 1]);
  expect(small.nextAfterSequence).toBe(EVENTS_PAGE_SIZE + 1);
  await server.stop();
});
```

- [ ] **Step 5: Insights route twins absorb the service and sibling tests**

`insights/insights-routes.test.ts`:

1. Replace "a second refresh by the same user inside the cooldown is 429 with Retry-After, another document is 202" and delete "a second editor on the same document inside the cooldown is 429 with Retry-After":

```ts
test('a second refresh on the same document inside the cooldown is 429 with Retry-After for any editor, another document is 202', async () => {
  const { server, documentId, owner, client } = await storyWithBlocks({ texts: ['Budget up'] });
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const otherDocumentId = randomUUID();
  server.services.documents.create({ id: otherDocumentId, title: 'Other', ownerUserId: owner.id });
  expect((await refresh({ server, documentId, cookie: owner.cookie })).status).toBe(HttpStatus.Accepted);
  await server.services.insights.worker.idle();
  const second = await refresh({ server, documentId, cookie: owner.cookie });
  expect(second.status).toBe(HttpStatus.TooManyRequests);
  expect(await second.json()).toEqual({ error: TOPICS_REFRESH_TOO_SOON_MESSAGE });
  expect(Number(second.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(0);
  const byEditor = await refresh({ server, documentId, cookie: editor.cookie });
  expect(byEditor.status).toBe(HttpStatus.TooManyRequests);
  expect(Number(byEditor.headers.get(RETRY_AFTER_HEADER))).toBeGreaterThan(0);
  expect((await refresh({ server, documentId: otherDocumentId, cookie: owner.cookie })).status).toBe(HttpStatus.Accepted);
  await server.services.insights.worker.idle();
  client.close();
  await server.stop();
});
```

2. Delete "a refresh while a run is in flight returns 202 without a second model call" and replace "the same user refreshing again while the run is in flight gets 202, then 429 once it ends":

```ts
test('a refresh while the run is in flight is 202 without a second model call, then 429 once it ends', async () => {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const model = gatedModel({ gate, answer: { topics: [{ name: 'Budget', blockIds: ['b0'] }] } });
  const { server, documentId, owner, client } = await storyWithBlocks({ languageModel: readyModel(model), texts: ['Budget up'] });
  expect((await refresh({ server, documentId, cookie: owner.cookie })).status).toBe(HttpStatus.Accepted);
  expect((await refresh({ server, documentId, cookie: owner.cookie })).status).toBe(HttpStatus.Accepted);
  open();
  await server.services.insights.worker.idle();
  expect(model.doGenerateCalls).toHaveLength(1);
  expect((await refresh({ server, documentId, cookie: owner.cookie })).status).toBe(HttpStatus.TooManyRequests);
  client.close();
  await server.stop();
});
```

Remove the now unused `readTopics` from the `../testing/timeline-client` import and the constant `POLL_TIMEOUT_MS`.

3. Delete "deleting a document forgets its selection cooldown" and replace "deleting a document forgets its refresh and summary cooldowns":

```ts
test('deleting a document forgets its refresh, summary and selection cooldowns', async () => {
  const { server, documentId, owner, client } = await storyWithBlocks({ texts: ['Budget up'] });
  expect((await refresh({ server, documentId, cookie: owner.cookie })).status).toBe(HttpStatus.Accepted);
  await server.services.insights.worker.idle();
  server.services.insights.summaries.cooldown.start(documentId);
  server.services.insights.selection.cooldown.start(documentId);
  expect(server.services.insights.topics.cooldown.size()).toBe(1);
  const deleted = await fetch(`${server.baseUrl}${documentApiPath({ documentId })}`, { method: HttpMethod.Delete, headers: { cookie: owner.cookie, origin: server.baseUrl } });
  expect(deleted.status).toBe(HttpStatus.NoContent);
  expect(server.services.insights.topics.cooldown.size()).toBe(0);
  expect(server.services.insights.summaries.cooldown.size()).toBe(0);
  expect(server.services.insights.selection.cooldown.size()).toBe(0);
  client.close();
  await server.stop();
});
```

4. In "a full worker answers 503 busy", add before `await server.stop();` the no-row assertion moved from the service test:

```ts
  expect((await readSelectionSummary({ server, documentId, cookie: editor.cookie, query: MEMBER_QUERY })).state).toBe(SelectionSummaryState.None);
```

`insights/selection-summaries-service.test.ts`: delete "reading never calls the model", "an empty selection is none and cannot be requested", "an unavailable model reads as failed with the reason and refuses requests", "a full worker answers busy without a row", "forget drops the document cooldown" and "an exhausted hourly cap answers busy with the time until a slot frees". Remove the now unused imports `HOUR_MS`, `SECOND_MS`, `chooseLanguageModel` and `LLM_MODEL_MISSING_MESSAGE`.

- [ ] **Step 6: Topics service folds**

`insights/topics-service.test.ts`: delete "refresh without an LLM fails without calling anything", "a twelve-topic answer is saved as eight topics and the prompt carries no email" and "a recompute keeps the id of a topic that keeps its blocks". Remove the `MAX_TOPICS` import line, the constant `TWELVE` and the helper `blockTexts`. Replace "no LLM fails with the configuration reason" (the read comes first because only an explicit refresh starts the refresh cooldown):

```ts
test('no LLM fails with the configuration reason on read and on refresh without reading the blocks', async () => {
  const { server, documentId, owner, client } = await storyWithBlocks({ texts: ['Budget up'] });
  expect((await readTopics({ server, documentId, cookie: owner.cookie })).status).toMatchObject({ state: TopicState.Failed, failure: LLM_MODEL_MISSING_MESSAGE });
  expect((await readTimeline({ server, documentId, cookie: owner.cookie })).bands.map((band) => band.kind)).toEqual([TimelineBandKind.Author]);
  const blocks = vi.spyOn(server.services.scheduler, 'blocks');
  const refreshed = await fetch(`${server.baseUrl}${topicsRefreshApiPath(documentId)}`, { method: 'POST', headers: { cookie: owner.cookie, origin: server.baseUrl } });
  expect(refreshed.status).toBe(HttpStatus.Accepted);
  await expect
    .poll(async () => (await readTopics({ server, documentId, cookie: owner.cookie })).status, { timeout: POLL_TIMEOUT_MS })
    .toMatchObject({ state: TopicState.Failed, failure: LLM_MODEL_MISSING_MESSAGE });
  expect(blocks).not.toHaveBeenCalled();
  client.close();
  await server.stop();
});
```

- [ ] **Step 7: Rewrites that stop asserting config or waiting real seconds**

`collaboration/collaboration-server.test.ts`. New assertion: while a client types faster than the store debounce, the document is touched within `MAX_STORE_DEBOUNCE_MS` plus one debounce. Add `vi` to the vitest import and the constant `KEYSTROKES_PER_DEBOUNCE = 4` at the top:

```ts
test('storing is forced after a bounded delay under continuous typing', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const { debounce } = server.services.hocuspocus.configuration;
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  const touch = vi.spyOn(server.services.documents, 'touch');
  const typing = setInterval(() => client.document.getText('t').insert(0, 'x'), debounce / KEYSTROKES_PER_DEBOUNCE);
  await expect.poll(() => touch.mock.calls.length, { timeout: MAX_STORE_DEBOUNCE_MS + debounce }).toBeGreaterThan(0);
  clearInterval(typing);
  expect(touch).toHaveBeenCalledWith(documentId);
  client.close();
  await server.stop();
});
```

`collaboration/attach-collaboration.test.ts`. New assertion: with a 300 ms idle timeout the server closes the never-authenticated socket with code 4401 (Unauthorized) within 3 s. Replace the constants `UNAUTHENTICATED_CLOSE_DEADLINE_MS = 12_000` and `UNAUTHENTICATED_TEST_TIMEOUT_MS` with:

```ts
const SHORT_SOCKET_TIMEOUT_MS = 300;
const UNAUTHENTICATED_CLOSE_DEADLINE_MS = 3_000;
const UNAUTHORIZED_CLOSE_CODE = 4401;
```

and the test with:

```ts
  test('a socket that never authenticates is closed by the server as unauthorized', async () => {
    const server = await startTestServer();
    server.services.hocuspocus.configuration.timeout = SHORT_SOCKET_TIMEOUT_MS;
    const socket = new WebSocket(`ws://${LOOPBACK_HOST}:${new URL(server.baseUrl).port}${ApiPath.Collaboration}`, { origin: server.baseUrl });
    const startedAt = Date.now();
    const closeCode = await new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
    await server.stop();
    expect(closeCode).toBe(UNAUTHORIZED_CLOSE_CODE);
    expect(Date.now() - startedAt).toBeLessThan(UNAUTHENTICATED_CLOSE_DEADLINE_MS);
  });
```

`history/versions-routes.test.ts`, "every version served equals a full replay at its mark": change `const MINUTES = 8;` to `const MINUTES = 3;`. Same assertions over three minutes of marks.

`collaboration/version-rooms.test.ts`. New assertion: after the rejected stop no timer is left. Remove `STOP_TIMEOUT_MS` from the `./version-rooms` import:

```ts
test('stop leaves no timer behind when destroying a room fails', { timeout: SETUP_TIMEOUT_MS }, async () => {
  const { server, documentId, owner, client } = await editedAfterBootstrap();
  const [mark] = server.services.readModel.marks(documentId);
  const viewer = await connectToDocument({ server, cookie: owner.cookie, documentId, path: endpointOf({ documentId, sequence: mark!.sequence }) });
  const rooms = server.services.versionRooms as unknown as { destroy: (key: string) => Promise<void> };
  const destroy = vi.spyOn(rooms, 'destroy').mockRejectedValue(new Error(DESTROY_FAILURE));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const stopFailure = await server.services.versionRooms.stop().catch((error: unknown) => error);
  const leftTimers = vi.getTimerCount();
  vi.useRealTimers();
  expect(stopFailure).toMatchObject({ message: DESTROY_FAILURE });
  expect(leftTimers).toBe(0);
  destroy.mockRestore();
  viewer.close();
  client.close();
  await server.stop();
});
```

(The count is read and real timers come back before any assertion, so a failing expectation cannot leave fake timers installed for the next test.)

`history/projection-scheduler.test.ts`: unchanged (owner decision).

- [ ] **Step 8: Prove each rewrite is red for the right reason**

Run each mutation, watch the named test fail with the stated message, then revert:
1. In `collaboration/collaboration-server.ts` delete `maxDebounce: MAX_STORE_DEBOUNCE_MS,` → "storing is forced…" fails on `expect.poll` (Hocuspocus default is 10 s).
2. In the attach-collaboration test delete the `configuration.timeout` line → fails on the 3 s deadline.
3. In `collaboration/version-rooms.ts` `stop()`, delete `if (timer.handle) clearTimeout(timer.handle);` → "stop leaves no timer behind…" fails with `expected 1 to be +0`.

- [ ] **Step 9: Run the suite**

Run: `pnpm --filter @superdoc-history/server test:unit`
Expected: `Tests  336 passed | 2 skipped (338)`; the per-file counts in the table above.

- [ ] **Step 10: Commit**

```bash
pnpm format
git add apps/server/src/repository-shape/delivery-docs.test.ts apps/server/src/repository-shape/ci-workflow.test.ts apps/server/src/insights/llm-client.test.ts apps/server/src/insights/prompts.test.ts apps/server/src/database/connection.test.ts apps/server/src/database/migrate.test.ts apps/server/src/documents/share-links-routes.test.ts apps/server/src/documents/share-links.test.ts apps/server/src/auth/session.test.ts apps/server/src/http/app.test.ts apps/server/src/collaboration/room-name.test.ts apps/server/src/history/timeline-routes.test.ts apps/server/src/documents/documents-routes.test.ts apps/server/src/history/history-routes.test.ts apps/server/src/insights/insights-routes.test.ts apps/server/src/insights/selection-summaries-service.test.ts apps/server/src/insights/topics-service.test.ts apps/server/src/collaboration/collaboration-server.test.ts apps/server/src/collaboration/attach-collaboration.test.ts apps/server/src/history/versions-routes.test.ts apps/server/src/collaboration/version-rooms.test.ts
git commit -m "test(server): fold service and library copies into their route twins and drop the repository prose pins"
```

---

### Task 3: web unit tests (G3)

**Files:**
- Modify: `apps/web/src/features/timeline/streamgraph.tsx`, `apps/web/src/features/timeline/streamgraph.test.tsx`, `apps/web/src/features/timeline/timeline-api.test.ts`, `apps/web/src/features/timeline/timeline-panel.test.tsx`, `apps/web/src/features/editor/highlight-edits.test.ts`, `apps/web/src/features/versions/time-travel.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `data-faded="true" | "false"` on every streamgraph band `<path>`.

**Counts:** 218 → 205 (the plan was written against a 214 baseline; PR #8 had added four web tests).

| File | Removed |
|---|---|
| `editor/highlight-edits.test.ts` | 1 |
| `timeline/timeline-api.test.ts` | 7 (3 drop + 4 merge) |
| `timeline/streamgraph.test.tsx` | 2 |
| `timeline/timeline-panel.test.tsx` | 1 |
| `versions/time-travel.test.tsx` | 2 |

- [ ] **Step 1: Record the before count**

Run: `pnpm --filter @superdoc-history/web test:unit`
Expected: `Tests  218 passed (218)`.

- [ ] **Step 2: Write the failing fading test**

In `timeline/streamgraph.test.tsx` replace "a highlighted band keeps full opacity while the others fade". New assertion: the highlighted band carries `data-faded="false"`, the others `data-faded="true"`.

```ts
test('a highlighted band keeps full opacity while the others fade', () => {
  renderGraph({ highlightedBandId: timeline.bands[0]!.id });
  expect(screen.getByLabelText('Budget, 340 characters')).toHaveAttribute('data-faded', 'false');
  expect(screen.getByLabelText('Hiring, 90 characters')).toHaveAttribute('data-faded', 'true');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @superdoc-history/web exec vitest run src/features/timeline/streamgraph.test.tsx -t "keeps full opacity"`
Expected: FAIL, `Expected the element to have attribute: data-faded="false"`.

- [ ] **Step 4: Commit the red test**

```bash
git add apps/web/src/features/timeline/streamgraph.test.tsx
git commit -m "test(web): assert band fading through data-faded instead of a class"
```

- [ ] **Step 5: Add the attribute**

In `timeline/streamgraph.tsx`, on the band `<path>` that already computes `isFaded`, add `data-faded={isFaded}` next to `aria-label`. Keep the `opacity-40` class: it is the styling.
Run the Step 3 command. Expected: PASS.

- [ ] **Step 6: Streamgraph rewrite and folds**

Replace "every band is a focusable path labelled with its size". New assertion: a topic band and the Other band are both focusable `<path>`s with their size label; no class assertions.

```ts
test('every band is a focusable path labelled with its size', () => {
  renderGraph();
  [screen.getByLabelText('Budget, 340 characters'), screen.getByLabelText('Other, 15 characters')].forEach((band) => {
    expect(band.tagName.toLowerCase()).toBe('path');
    expect(band).toHaveAttribute('tabindex', '0');
  });
});
```

Delete "the tooltip aligns to the edge it is near" and "the first and the last bins open their tooltip inward". Replace "the tooltip follows the pointer and aligns inward at the edges" so it also carries the centre case:

```ts
test('the tooltip follows the pointer, aligns inward at the edges and centres in the middle', () => {
  const { container } = renderGraph();
  const chart = container.querySelector('svg')!;
  fireEvent.pointerMove(chart, { clientX: 0, clientY: 100, buttons: 0 });
  expect(screen.getByRole('tooltip')).toHaveStyle({ left: '0px', top: `${100 + TOOLTIP_POINTER_OFFSET}px` });
  expect(screen.getByRole('tooltip')).toHaveAttribute('data-alignment', TooltipAlignment.Start);
  fireEvent.pointerMove(chart, { clientX: WIDTH / 2, clientY: 100, buttons: 0 });
  expect(screen.getByRole('tooltip')).toHaveAttribute('data-alignment', TooltipAlignment.Center);
  fireEvent.pointerMove(chart, { clientX: WIDTH, clientY: 100, buttons: 0 });
  expect(screen.getByRole('tooltip')).toHaveStyle({ left: `${WIDTH}px` });
  expect(screen.getByRole('tooltip')).toHaveAttribute('data-alignment', TooltipAlignment.End);
});
```

- [ ] **Step 7: Timeline API table and drops**

In `timeline/timeline-api.test.ts`:

1. Delete "fetchTimeline without filters requests the bare path" and replace "fetchTimeline sends only the present filters":

```ts
test('fetchTimeline sends only the present filters', async () => {
  const filteredSpy = respondWith(new Response(JSON.stringify({ bins: [] })));
  await fetchTimeline({ documentId: DOCUMENT_ID, filter: { term: 'a b', author: null } });
  expect(filteredSpy).toHaveBeenLastCalledWith(`${TIMELINE_PATH}?term=a+b`, expect.anything());
  const bareSpy = respondWith(new Response(JSON.stringify({ bins: [] })));
  await fetchTimeline({ documentId: DOCUMENT_ID, filter: { term: null, author: null } });
  expect(bareSpy).toHaveBeenLastCalledWith(TIMELINE_PATH, expect.anything());
});
```

2. Delete "a selection at a period sends the bin size of that period", "a selection without a period never sends a bin size" and "an empty selection is read from the bare path", and replace "reading a selection summary sends every part of the selection":

```ts
const SELECTION_QUERY = `term=budget&author=ana&topic=band-0&at=${SELECTION.at}`;

test('a selection summary URL carries the present parts and a bin size only with a period', async () => {
  const cases: { selection: EditSelection; binMs: number | null; path: string }[] = [
    { selection: SELECTION, binMs: null, path: `${SELECTION_PATH}?${SELECTION_QUERY}` },
    { selection: SELECTION, binMs: MINUTE_MS, path: `${SELECTION_PATH}?${SELECTION_QUERY}&binMs=${MINUTE_MS}` },
    { selection: EMPTY_SELECTION, binMs: MINUTE_MS, path: SELECTION_PATH },
    { selection: EMPTY_SELECTION, binMs: null, path: SELECTION_PATH },
  ];
  const requested = await cases.reduce<Promise<string[]>>(async (previous, { selection, binMs }) => {
    const paths = await previous;
    const fetchSpy = respondWith(new Response(JSON.stringify(NONE_VIEW)));
    expect(await fetchSelectionSummary({ documentId: DOCUMENT_ID, selection, binMs })).toEqual(NONE_VIEW);
    return [...paths, String(fetchSpy.mock.lastCall![0])];
  }, Promise.resolve([]));
  expect(requested).toEqual(cases.map(({ path }) => path));
});
```

3. Delete the `test.each` "a %s selection summary is returned as the server sent it" (three rows).

In `editor/highlight-edits.test.ts` delete "the comment and match APIs keep the shape the highlighter relies on" and `expectTypeOf` from the vitest import.

- [ ] **Step 8: Panel and time-travel folds**

In `timeline/timeline-panel.test.tsx` delete "the button is disabled while the request is in flight and while the summary is up to date" and replace "an editor summarizes the filtered selection and sees who edited":

```ts
test('an editor summarizes the filtered selection, waits on a disabled button and sees who edited', async () => {
  let release: (response: Response) => void = () => undefined;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const fetchSpy = mockTimelineApi({ selectionViews: [NONE_VIEW, READY_VIEW], summarizeResponse: () => pending });
  renderPanel({ route: `${ROUTE}?author=ana` });
  await userEvent.click(await screen.findByRole('button', { name: SUMMARIZE_EDITS_LABEL }));
  expect(fetchSpy).toHaveBeenCalledWith(`${SELECTION_PATH}?author=ana`, expect.objectContaining({ method: HttpMethod.Post }));
  await waitFor(() => expect(screen.getByRole('button', { name: SUMMARIZE_EDITS_LABEL })).toHaveAttribute('title', SUMMARIZING_EDITS_MESSAGE));
  expect(screen.getByRole('button', { name: SUMMARIZE_EDITS_LABEL })).toBeDisabled();
  release(json(READY_VIEW, HttpStatus.Accepted));
  const card = await screen.findByRole('region', { name: SELECTION_SUMMARY_HEADING });
  await waitFor(() => expect(card).toHaveTextContent(READY_VIEW.summary!.sentence));
  expect(within(card).getByTitle(FIXTURE_AUTHOR_NAME)).toBeInTheDocument();
  expect(postCalls(fetchSpy)).toHaveLength(1);
});
```

In `versions/time-travel.test.tsx`:
1. Delete "below the wide layout the editor keeps a usable height and the panel stacks under it".
2. Delete "Escape in the title input keeps the version" and insert its check as the first step of "Escape leaves the version from anywhere but a field being typed in", right after `await screen.findByTitle(VERSION_FRAME_TITLE);`:

```ts
  fireEvent.keyDown(screen.getByLabelText(TITLE_LABEL), { key: 'Escape' });
  expect(router.state.location.search).toBe(`?at=${BIN_STARTS[1]}`);
```

3. In "the previous frame stays until the next one is ready and foreign messages are ignored" delete the line `expect(frameB).toHaveClass('invisible');`. The new assertion is the `aria-hidden="true"` check on the line before it, which stays.

- [ ] **Step 9: Run the suite and the class-string sweep**

Run: `pnpm --filter @superdoc-history/web test:unit && pnpm typecheck`
Expected: `Tests  205 passed (205)`, typecheck clean.
Run: `rg -n "toHaveClass\('(opacity-40|invisible|topic-band|topic-band-other|shrink-0)'\)|className\).toContain\('(min-h|lg:|max-h)" apps/web/src`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
pnpm format
git add apps/web/src/features/timeline/streamgraph.tsx apps/web/src/features/timeline/streamgraph.test.tsx apps/web/src/features/timeline/timeline-api.test.ts apps/web/src/features/timeline/timeline-panel.test.tsx apps/web/src/features/editor/highlight-edits.test.ts apps/web/src/features/versions/time-travel.test.tsx
git commit -m "test(web): fold duplicate cases and assert through attributes instead of class strings"
```

---

### Task 4: E2E (G4)

**Files:**
- Modify: `e2e/selection-summary.spec.ts`, `e2e/time-travel.spec.ts`, `e2e/timeline.spec.ts`

**Interfaces:**
- Consumes: helpers already in `e2e/timeline.ts` and `e2e/editor.ts` (`summarizeButton`, `summaryCard`, `waitForSettledTimeline`, `readTimeline`, `currentAt`, `readLiveText`, `versionBanner`).
- Produces: nothing.

**Counts:** 48 → 38 (selection-summary 9 → 4, time-travel 11 → 9, timeline 9 → 6; auth 7, collaboration 2, documents 9, topics-on-open 1 unchanged).

- [ ] **Step 1: Record the before count**

Run: `pnpm exec playwright test --list | tail -1`
Expected: `Total: 48 tests in 7 files`.

- [ ] **Step 2: selection-summary.spec.ts**

Delete "an edit outside the filter also marks the summary as for an earlier state", "a second filter inside the cooldown shows when to retry", "a reader sees the summary but no Summarize button", "an empty selection disables Summarize with a reason" and "the summary fits a 375 px screen". Replace "a new edit marks the summary as for an earlier state and Summarize refreshes it after the cooldown" with the walk below. New assertion: an edit by another author outside the filter turns the card stale and enables Summarize, with exactly one model call and no 30 s wait.

```ts
test('an edit outside the filter marks the summary as for an earlier state and enables Summarize', async ({ browser }) => {
  const { ana, bruno, documentId } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await waitForSettledTimeline({ page: ana.page, documentId });
  await filterBy({ page: ana.page, text: ANA_FILTER });
  const before = await readSelectionCalls(ana.page.request);
  await summarizeButton(ana.page).click();
  await expect(summaryCard(ana.page)).toContainText(`${ANA} edited`, { timeout: SUMMARY_TIMEOUT_MS });
  await typeInParagraph({ page: bruno.page, paragraphText: HIRING_PREFIX, text: WRITER_TEXT });
  await expect(summaryCard(ana.page)).toContainText(EARLIER_STATE_LABEL, { timeout: SUMMARY_TIMEOUT_MS });
  await expect(summarizeButton(ana.page)).toBeEnabled();
  expect(await readSelectionCalls(ana.page.request)).toBe(before + 1);
});
```

Remove what no remaining test uses: `SELECTION_SUMMARY_COOLDOWN_MS`, `SELECTION_SUMMARY_TOO_SOON_MESSAGE`, `DEMO_USERS`, `SECOND_MS`, `ShareLinkRole` (types import); `NO_EDITS_TO_SUMMARIZE_MESSAGE`, `SUMMARIZE_EDITS_LABEL` (copy import); `shareAndAccept` (editor import); `signedInContext` (fixtures import); constants `CAIO`, `COOLDOWN_PASS_TIMEOUT_MS`, `PROBE_TIMEOUT_MS`, `NARROW_VIEWPORT`, `NOTHING_FILTER`, `EDITED_PHRASE`, `RETRY_SECONDS_PATTERN`. Keep `RETRY_SUMMARY_LABEL`, `SUMMARY_UP_TO_DATE_MESSAGE`, `FAILING_TEXT`, `BRUNO_FILTER` (still used).

- [ ] **Step 3: time-travel.spec.ts**

1. Delete "Browser Back from a version returns to live" and "a non-member opening an at link sees the document is unavailable". Replace "the edit bin shows the edit and lists it" (Browser Back now leaves the edit bin):

```ts
test('the edit bin shows the edit, lists it and Browser Back returns to live', async ({ browser }) => {
  const { ana, documentId } = await ownerWithEdit(browser);
  await openEditBin({ page: ana.page, documentId });
  const serverText = await expectViewerMatchesServer({ page: ana.page, documentId });
  expect(serverText).toContain(EDIT_TEXT.trim());
  const binEdits = ana.page.locator('aside section').getByRole('listitem');
  await expect(binEdits.filter({ hasText: ANA })).toBeVisible();
  await expect(binEdits.filter({ hasText: INSERTED_SNIPPET_PATTERN })).toBeVisible();
  await ana.page.goBack();
  await expect.poll(() => currentAt(ana.page)).toBeNull();
  await expect(versionBanner(ana.page)).toHaveCount(0);
  await expect.poll(() => readLiveText(ana.page)).toContain(EDIT_TEXT);
});
```

2. In "a reader opens the timeline and a version, cannot refresh, and the room drops their edits", add right after the `REFRESH_TOPICS_LABEL` count check:

```ts
  await expect(caio.page.getByRole('button', { name: SUMMARIZE_EDITS_LABEL })).toHaveCount(0);
```

and add `SUMMARIZE_EDITS_LABEL` to the `timeline-copy` import.

3. Replace "a reader sees failed topics without a Retry button while the owner has one" (absorbs timeline "topics unavailable shows author bands"):

```ts
test('failed topics fall back to author bands and only the owner gets Retry', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: FAILING_PARAGRAPHS });
  await typeInParagraph({ page: ana.page, paragraphText: 'FAIL-TOPICS:', text: EDIT_TEXT });
  await expect(ana.page.getByText(TOPICS_UNAVAILABLE_MESSAGE)).toBeVisible({ timeout: VERSION_TIMEOUT_MS });
  await waitForBands({ page: ana.page, names: [ANA] });
  await expect(ana.page.getByRole('button', { name: RETRY_TOPICS_LABEL })).toBeVisible();
  const caio = await signedInContext({ browser, user: DEMO_USERS[2]! });
  await acceptShareLink({ page: caio.page, documentId, role: ShareLinkRole.Read, owner: ana.page });
  await expect(caio.page.getByText(TOPICS_UNAVAILABLE_MESSAGE)).toBeVisible({ timeout: VERSION_TIMEOUT_MS });
  await expect(caio.page.getByRole('button', { name: RETRY_TOPICS_LABEL })).toHaveCount(0);
});
```

Remove `DOCUMENT_UNAVAILABLE_MESSAGE` from the types import and the constant `VERSIONS_SEGMENT` (only the deleted non-member walk used them).

- [ ] **Step 4: timeline.spec.ts**

1. Delete "topics unavailable shows author bands". Remove `TOPICS_UNAVAILABLE_MESSAGE` (types import), `RETRY_TOPICS_LABEL` (copy import), `ANA` (timeline import) and the constant `FAILING_PARAGRAPH`.

2. Delete "filter by username hides the other author" and replace "filter by term survives a reload":

```ts
test('filters by person and term hide the other author and survive a reload', async ({ browser }) => {
  const { ana } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  await filterBy({ page: ana.page, text: '@bruno' });
  await expect(ana.page).toHaveURL(new RegExp(`${TimelineSearchParam.Author}=bruno`));
  await expect(bandNamed({ page: ana.page, name: BUDGET })).toHaveAttribute('aria-label', bandAriaLabel({ name: BUDGET, volume: 0 }), { timeout: FILTER_TIMEOUT_MS });
  await expect(topEdits(ana.page).filter({ hasText: HIRING })).toHaveCount(1);
  await expect(topEdits(ana.page).filter({ hasText: BUDGET })).toHaveCount(0);
  await filterBy({ page: ana.page, text: 'designer' });
  await expect(ana.page).toHaveURL(new RegExp(`${TimelineSearchParam.Term}=designer`));
  await ana.page.reload();
  await expect(ana.page.getByRole('button', { name: removeFilterLabel('designer') })).toBeVisible({ timeout: BANDS_TIMEOUT_MS });
  await expect(ana.page).toHaveURL(new RegExp(`${TimelineSearchParam.Author}=bruno`));
  await expect(bandNamed({ page: ana.page, name: BUDGET })).toHaveAttribute('aria-label', bandAriaLabel({ name: BUDGET, volume: 0 }), { timeout: FILTER_TIMEOUT_MS });
  await expect.poll(() => bandVolume({ page: ana.page, name: HIRING })).toBeGreaterThan(0);
});
```

3. Delete "two quick arrow presses land on the second bin with one navigation" and replace "keyboard moves the selected bin":

```ts
test('keyboard moves the selected bin and two quick presses navigate once', async ({ browser }) => {
  const { ana, documentId } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  const { bins } = await readTimeline({ page: ana.page, documentId });
  await pressInChart({ page: ana.page, name: BUDGET, keys: ['End'] });
  await expect.poll(() => currentAt(ana.page), { timeout: VERSION_TIMEOUT_MS }).toBe(bins.at(-1)!.start);
  const lastRule = await ruleX(ana.page);
  const navigations: string[] = [];
  ana.page.on('framenavigated', (frame) => navigations.push(frame.url()));
  const versionRequests: string[] = [];
  ana.page.on('request', (request) => {
    if (VERSION_REQUEST_PATTERN.test(new URL(request.url()).pathname)) versionRequests.push(request.url());
  });
  await ana.page.keyboard.press('ArrowLeft');
  await ana.page.keyboard.press('ArrowLeft');
  await expect.poll(() => currentAt(ana.page), { timeout: VERSION_TIMEOUT_MS }).toBe(bins.at(-3)!.start);
  expect(await ruleX(ana.page)).toBeLessThan(lastRule);
  expect(navigations.filter((url) => url.includes(`${TimelineSearchParam.At}=`))).toHaveLength(1);
  expect(versionRequests.length).toBeLessThanOrEqual(1);
});
```

4. Replace "narrow viewport stacks the panel" (absorbs selection-summary "the summary fits a 375 px screen"). Add the constants `SUMMARY_TIMEOUT_MS = 30_000` and `EDITED_PHRASE = 'edited'` and import `summarizeButton`, `summaryCard`, `waitForSettledTimeline` from `./timeline`:

```ts
test('narrow viewport stacks the panel and fits the summary', async ({ browser }) => {
  const { ana, documentId } = await twoAuthorsInTwoTopics({ browser, paragraphs: [BUDGET_PARAGRAPH, HIRING_PARAGRAPH] });
  await ana.page.setViewportSize(NARROW_VIEWPORT);
  await waitForBands({ page: ana.page, names: [BUDGET, HIRING] });
  const editor = await ana.page.locator('[data-testid="document-editor"]').boundingBox();
  const panel = await ana.page.locator('aside').boundingBox();
  expect(panel!.y).toBeGreaterThanOrEqual(editor!.y + editor!.height);
  await waitForSettledTimeline({ page: ana.page, documentId });
  await summarizeButton(ana.page).click();
  await expect(summaryCard(ana.page)).toContainText(EDITED_PHRASE, { timeout: SUMMARY_TIMEOUT_MS });
  await expect(summarizeButton(ana.page)).toBeVisible();
  expect(await ana.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(NARROW_VIEWPORT.width);
});
```

- [ ] **Step 5: Typecheck and list**

Run: `pnpm typecheck:e2e && pnpm exec playwright test --list | tail -1`
Expected: clean; `Total: 38 tests in 7 files`.

- [ ] **Step 6: Run the three changed specs twice**

Run: `pnpm test:e2e e2e/selection-summary.spec.ts e2e/time-travel.spec.ts e2e/timeline.spec.ts --repeat-each=2`
Expected: 38 passed (19 tests × 2), no retries (the config has `retries: 0`). Record each merged walk's duration from the list reporter; each stays under 60 s.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add e2e/selection-summary.spec.ts e2e/time-travel.spec.ts e2e/timeline.spec.ts
git commit -m "test(e2e): fold duplicate walks and stop waiting the real summary cooldown"
```

---

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| T1.4 | `toExtend` missing from the bundled expect-type | `pnpm typecheck` error "Property 'toExtend' does not exist" | use `toMatchTypeOf` (same expect-type 1.4.0, deprecated alias); note it in the briefing |
| T1.6 | something still imports the deleted modules | `rg` in T1.6 prints a match, or typecheck fails | restore with `git checkout HEAD -- <file>` and report the importer |
| T2.5 | the merged in-flight refresh test sees two model calls | `expected [ …2 items ] to have length 1` | restore the two original tests from `git show HEAD:<path>`; strike the fold through with the reason |
| T2.6 | the read-first order makes refresh return 429 | `expected 429 to be 202` | swap to refresh first then read, as the deleted test did; keep both assertions |
| T2.7 storing | typing never lets Hocuspocus force a store in time (CI slower) | poll timeout on `touch.mock.calls.length` | raise the poll timeout to `MAX_STORE_DEBOUNCE_MS + 2 * debounce`; if still red, restore the config test and strike the step |
| T2.7 socket | the close code is not 4401 (a different close path fires first) | `expected 1006 to be 4401` | assert only the deadline; record the code seen in the briefing |
| T2.7 version-rooms | fake `setTimeout` stalls something inside `stop()` | test times out at `SETUP_TIMEOUT_MS` | restore the spy-pairing test from `HEAD`; strike the step with the reason |
| T2.9 | count is not 336 | Vitest summary line | diff `vitest list` output against the per-file table; fix the file that is off |
| T3.7 | `fetchSpy.mock.lastCall` is the URL object, not a string | table compares `[object Request]` | read `fetchSpy.mock.lastCall![0]` the way `timeline-api.ts` calls `fetch` (it passes a string path today) |
| T3.8 | the card region exists before content, so `findByRole` resolves early | already handled with `waitFor` on the text | none needed |
| T4.3 | Browser Back after End plus ArrowLefts needs two Backs (more than one history push) | `currentAt` stays non-null after `goBack` | press `End` only, as the deleted walk did, then assert; strike the fold |
| T4.4 | person plus term filters on reload drop one chip | URL lacks `author=bruno` after reload | assert the term chip only (the original walk) and keep the person half before reload |
| T4.6 | a merged walk exceeds 60 s or flakes | list reporter duration or a red run | split it back into the two original walks from `HEAD` |

**Steps with no backout:** none. Every step edits tests in place; `git checkout HEAD -- <file>` restores any of them.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md` with the per-package before/after counts, the commit hashes, the mutation results of T1.5 and T2.8, and the merged walks' durations.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** not applicable: no user-visible change (`data-faded` renders nothing).
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened with the CI duration before and after.
