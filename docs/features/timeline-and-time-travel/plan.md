# Timeline and time travel — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Author this list with every box empty. A sub-agent ticks its own line with evidence. A wrong step is struck through with the reason, not deleted.

**Spec:** [spec.md](spec.md) · **Spike:** [spike.md](spike.md) (commit c0fbdcc; all four facts held)
**Tier:** 🔴
**Goal:** The side panel shows a live streamgraph of edit volume per LLM-named topic with a shareable filter and a Top edits list with one LLM sentence per topic, and any moment of the chart opens the document as it was then, read-only, in the editor area.
**Architecture:** `libs/history` gains pure timeline code (bins, runs, words, stack rows, bands), topic schemas and assignment, and per-minute version marks written by the projection with a native Yjs snapshot each. `apps/server` serves `/timeline`, topics, summaries and versions; LLM calls run in an in-process insights queue through the AI SDK and OpenRouter; versions and topic blocks are decoded in the projection worker, which also takes over compaction and projects on a 1.5 s throttle from `onChange`; a version is served to a second read-only SuperDoc that joins the room under the document's own id (`sd2/v2.1/<documentId>`) on a per-version WebSocket endpoint `/collaboration/versions/<documentId>/<sequence>`, backed by one read-only Hocuspocus instance per (document, sequence) and evicted when idle; the selected period's edits are painted in that viewer as local temporary comments. `apps/web` replaces the placeholder with a resizable timeline panel (d3-shape + React SVG) whose state lives in the URL, and overlays a version viewer with a banner on the editor area.
**Tech stack:** slice 2 stack plus `ai` 7.0.142 and `@openrouter/ai-sdk-provider` 3.1.0 (server), `d3-shape` 3.2.0, `d3-scale` 4.0.2, `@types/d3-shape` 3.2.0, `@types/d3-scale` 4.0.9 (web), `zod` 4.6.7 in `libs/history`.
**Seam:** `onChange` in `apps/server/src/collaboration/collaboration-server.ts` (throttle trigger) and the upgrade router in `attach-collaboration.ts` (per-version endpoints); the worker's request switch in `projection-worker.ts`; `createApp` mounts three route groups; `document-page.tsx` swaps `TimelinePanelPlaceholder` for `TimelinePanel` and gains the viewer overlay.
**Assumptions (decided, owner can override):**
- Aggregation runs in memory over the read model's events, not in SQL `GROUP BY`: authors are resolved at read time (ADR 0002), the term filter needs keystroke events joined into runs, and SQLite `lower()` is ASCII-only. The resolved events of a document are built once per (cursor, identities, topic set) and shared by `/timeline`, `/timeline/edits` and the summaries (`TimelinePipelineCache`); filters and bins run per request over that cached pipeline. An integration test pins 10k events under 150 ms per call. `activity_buckets` stays unbuilt.
- A **run** is the events of one block by the same author set inside one bin, joined in sequence order. Terms match runs, never single keystroke events; deleted text is also matched reversed, because Backspace emits characters right to left. Words are counted on runs.
- Bins are aligned to multiples of `binMs` since the epoch; the ladder is 10 s, 30 s, 1, 2, 5, 10, 15, 30 min, 1, 3, 6, 12 h, 1 d, 7 d, smallest step with at most `MAX_BINS` (120) data bins, plus one empty bin on each side so a single bin still draws a closed band. The spec says 1 min to 1 h; the 10 s and 30 s steps make a short demo readable and the long steps cover the spec's 30-day test. Marks stay per minute, so bins under a minute share a version: a 10 s bin opens the latest mark before its end, which can be the end of the previous minute. `binMs` is also accepted as a query parameter, documented as test-only.
- Version marks live in the read model (`version_marks`, written only by the projection worker, ADR 0007), not in `apps/server/src/database/schema/insights.ts`. One mark per minute of activity (the last update of that minute) plus the bootstrap mark; every mark stores `Y.encodeSnapshot(Y.snapshot(doc))`. A bin's version is the latest mark before the bin's end, else the bootstrap mark. The URL `at` is the selected bin's **start in ms**; the version sequence is derived from the timeline (`versionSequenceAt(binStart + binMs)`, carried as `bin.versionSequence`), so a reload reselects the same bin. Documents projected before this slice (a cursor but no marks) are forgotten and re-projected at startup, imports included; until that finishes `/versions` answers 202.
- The bands are generic: `TimelineBandKind { Topic, Other, Author }`. With stored topics the bands are topics plus "Other"; without topics (pending first run, failed, or no LLM) they are authors and the panel says so.
- Topics are clamped, not rejected: the LLM is asked for 4–8; the parser accepts 1–20 (`MAX_TOPICS_ACCEPTED`); more than 8 keep the 8 with the most known blocks, the rest fall into "Other". Zero topics, a topic without blocks or duplicate names reject the output (state `Failed`).
- Topic tables (`topic_sets`, `document_topics`, `topic_blocks`, `topic_summaries`) live in `auth.sqlite` so documents cascade them; `topic_sets` holds the state machine, which the spec names but does not place.
- The insights "worker" is an in-process single-flight queue (`InsightsWorker`): LLM calls are network-bound, so a thread buys nothing. Every job catches and logs its own failure once (a document deleted mid-call fails a foreign key); at boot, a `pending` topic set with no running job is reset to `failed`. Decoding (topic blocks, versions) goes to the projection worker.
- Summaries are recomputed at most once per `SUMMARY_MIN_INTERVAL_MS` (60 s) per document, so polling while two people type does not call the LLM every 3 s.
- The edits of a bin are served at `GET /api/documents/:id/timeline/edits?binStart&binMs&term&author`, not under `/versions/:sequence/edits`: an empty bin's version is an earlier mark, so a version does not identify a bin.
- `GET /versions/:sequence` returns `VersionSummary` JSON (200, carrying the version's `collaborationPath`), 202 with `Retry-After` while it loads, or 503 `{ error: VERSION_FAILED_ERROR }` while a recent load failure is cached (`VERSION_FAILURE_TTL_MS`); the state bytes never travel over HTTP, the version's Hocuspocus instance loads them server-side. The cache is bounded by count (`VERSION_CACHE_SIZE` 16) and bytes (`VERSION_CACHE_MAX_BYTES` 256 MB).
- Two SuperDoc instances on one page are unverified, so the viewer renders in a **same-origin iframe** at `/documents/:id/versions/:sequence/view`: a minimal page holding only the read-only SuperDoc. Cookies flow because it is same-origin; the parent drives highlights and hears readiness through `postMessage`, checking `event.origin`.
- Spec correction (spike §2): a version cannot live in a room named `<id>@<sequence>`, because SuperDoc keys the room's maps by the document id and builds the room name itself. The viewer keeps the original document id and the version is isolated by endpoint, with one Hocuspocus instance per (document, sequence), because one instance keys rooms by name and two versions of one document would collide.
- Topic identity is the stored `document_topics.id`, never the name (spike §3: names vary between runs). A recompute reuses the id, and with it the summary, of the previous topic sharing at least half of a new topic's blocks.
- E2E runs the real OpenRouter provider against a fake OpenAI-compatible server (`e2e/fake-openrouter.ts`) through `OPENROUTER_BASE_URL`, so topics are deterministic and no test calls a real model. The owner allows Task 1 to add an empty `OPENROUTER_BASE_URL=` line to `.env.example`; `.env` is never opened.
- `generateObject` is deprecated in `ai@7` (`@deprecated Use generateText with an output setting instead`, the spike saw the `AISDK_DEP_GENERATE_OBJECT` warning); the client uses `generateText({ output: Output.object({ schema }) })`. The mock is `MockLanguageModelV4` from `ai/test` (there is no `MockLanguageModelV1` in 7.x).
- Live updates poll `/timeline` every `TIMELINE_POLL_MS` (3000) while the panel is open; SSE (`/history-stream`) is not built and `useTimeline` isolates the transport. The server cost of a poll is bounded by the pipeline cache; the spike measured only the chart's re-render (0.7–0.9 ms median for 120 bins × 8 bands), so `MAX_BINS` stays 120 and labels are placed on every data change.

## Global constraints

- Everything in English. No comments. No `?? default`. No `else`. Enums over string literals. Constants over magic literals. Named parameters when a function takes more than one. Function declarations for functions, components and hooks. No `.js` in imports. No `sleep` in tests: wait on conditions. Test names in present tense, never "should".
- Versions pinned exactly: `ai` 7.0.142, `@openrouter/ai-sdk-provider` 3.1.0, `d3-shape` 3.2.0, `d3-scale` 4.0.2, `@types/d3-shape` 3.2.0, `@types/d3-scale` 4.0.9, `zod` 4.6.7; slice 2 pins unchanged. `pnpm-lock.yaml` changes in Task 1 only.
- Panel: `MIN_PANEL_WIDTH` 420 px, default 40% of the viewport, chart height 240 px, stacks below the editor at full width under 1024 px.
- Streamgraph: `stackOffsetWiggle`, `stackOrderInsideOut`, `curveBasis`; hue by onset order (cool → warm), saturation by the band's volume, both through CSS variables on tokens; labels inside bands when at least `MIN_LABEL_HEIGHT` (16) px tall, never overlapping or leaving their band; the SVG has a title and a description; every band is focusable with `aria-label` naming band and volume; arrow keys move the selected bin.
- Band value: characters inserted + deleted. The panel reports words.
- `TOPIC_RECOMPUTE_NEW_BLOCKS` = 5; `PROJECTION_THROTTLE_MS` = 1500; `TIMELINE_POLL_MS` = 3000; `SCRUB_DEBOUNCE_MS` = 300; `EVENTS_PAGE_SIZE` = 500.
- Every new route checks membership (`requireDocumentRole`, reader minimum except refresh); a non-member gets the slice 2 404 body. `POST /topics/refresh` needs editor, one run in flight per document, one refresh per (user, document) per `TOPIC_REFRESH_COOLDOWN_MS` (30 s).
- LLM prompts carry only the document's own block text and edit runs with author **names**; never emails, never other documents; block text, author names, topic names and edit text are all XML-escaped. `OPENROUTER_API_KEY` never leaves the server. Without `LLM_MODEL` or the key, topics are `Failed` with a visible message and the chart shows author bands with "Topics unavailable", never silently.
- Version endpoints are ephemeral, read-only for everyone, authenticated (session, membership, existing mark) **before** an instance is created, and never write updates, identities or membership; viewer highlights are local comments that never reach the server.
- Agents never read `.env`; anything that needs secrets runs through `scripts/with-env.sh <command>`. Tests mock the model; the only real-LLM test is skipped unless `OPENROUTER_API_KEY` is set.
- Red first (HARNESS → Build): every task from 1 to 14 commits its failing tests alone in a `test(<scope>): …` commit before the implementation commit, and checks `git show --stat <sha>` lists only test files. Never `git add -A`.
- `poc/` untouched. One projection worker per process.

## Review focus

1. A filter term with regex metacharacters (`a.b*(`, `[`) matches literally and never throws (Task 3: `a term with regex metacharacters matches literally`; Task 7: `term=a.b*( narrows without a 500`).
2. A document whose whole history is one edit draws a closed band, not an empty or broken chart (Task 3: `a single edit yields three bins, the middle one filled`; Task 11: `one filled bin renders a closed band with its label hidden`).
3. The LLM names a block id that no longer exists: the topics are saved, the unknown ids are logged once, and their events fall into "Other" (Task 4: `unknown block ids are dropped and reported`; Task 8: `unknown block ids are logged once and the topics are saved`).
4. A version requested before the bootstrap commit opens the document as uploaded, never a blank or hanging viewer (Task 9: `a sequence before the bootstrap resolves to the bootstrap version`).
5. An `?at=` link opened by someone without access shows "This document is no longer available" and requests no version (Task 9: `versions routes and version endpoints refuse a non-member like a missing document`; Task 13: `an inaccessible document never requests a version`).
6. The LLM returns 1 or 12 topics: 1 is kept, 12 is clamped to the 8 largest, 21 is `Failed` (Task 4: `twelve topics keep the eight largest`; Task 8: `a twelve-topic answer is saved as eight topics`).

## File map

| Group | Owner | Paths |
|---|---|---|
| G1 types + history library + dependencies | developer A | `libs/types/**`, `libs/history/**`, root `package.json`, `pnpm-lock.yaml`, `.env.example` (Task 1 only), the dependency blocks of `apps/server/package.json` and `apps/web/package.json` (Task 1 only) |
| G2 server | developer B | `apps/server/**` except its dependency block: `src/{collaboration,config,database,documents,history,http,insights,testing}/**`, `src/server.ts`, `drizzle/**`, `tsup.config.ts` |
| G3 web | developer C | `apps/web/**` except its dependency block |
| G4 e2e + docs | developer A | `e2e/**`, `playwright.config.ts`, `README.md`, `docker/**`, `docs/features/timeline-and-time-travel/tester-briefing.md`, `docs/features/README.md` |

Every G2 task edits `server.ts`, `http/app.ts` and `testing/test-server.ts`; one developer runs them in order. `libs/types` is written once in Task 1; later tasks only consume it (Task 16 removes the dead placeholder constant).

## Sequencing

Task 0 is done: all four spike facts held and the plan is written for them, with no conditional steps. Task 1 lands every dependency and contract with one `pnpm install`. Then:
- A: Task 2 → 3 → 4 (in that order, because B needs Task 2 first), then Task 15 (after B and C) → 16.
- B: Task 5 right after Task 1; Task 6 after Task 2; Task 7 after Task 3; Task 8 after Task 4; Task 9 last. Strictly in order.
- C: Task 10 right after Task 1; Task 11 after Task 3 (`toStackRows` through `@superdoc-collab/history/timeline`); then 12 → 13 → 14. C mocks `fetch` against the Task 1 contracts and never waits for B.

Then Z.

---

### Task 0: Spike (done)

- [ ] **Step 1:** Record the spike as read: `spike.md` (commit c0fbdcc). Fact 1 held: createDocFromSnapshot over a gc:false replay equals `materialize` on 11 of 11 sequences, restore 1–8 ms, about one snapshot byte per update, and a version opens read-only only under the original document id, isolated by endpoint → Tasks 2, 9, 13. Fact 2 held through temporary comments (`format.highlight` is refused in `viewing`) → Task 14. Fact 3 held: 7 topics in 4–5 s, every block id valid, `generateText` + `Output.object`, `MockLanguageModelV4` → Task 8. Fact 4 held: under 1 ms median at 120 × 8 → Task 11, `MAX_BINS` 120. Regression tests per fact: Task 2 `a delete-heavy history restores exactly at every mark`, Task 9 `two versions of one document load side by side`, Task 15 `highlights stay local to one viewer`, Task 8 `topics-llm.smoke.test.ts`.

---

### Task 1: Dependencies and shared contracts (G1)

**Files:**
- Create: `libs/types/src/{timeline,constants}.ts`, `libs/types/src/timeline.test.ts`
- Modify: `libs/types/src/{history,http,routes,index}.ts`, `libs/history/package.json`, `apps/server/package.json`, `apps/web/package.json`, `pnpm-lock.yaml`, `.env.example`

**Interfaces:**
- Produces: from `constants.ts` `SECOND_MS`, `MINUTE_MS`, `VERSION_MARK_MS`, `VERSION_ROOM_IDLE_MS`, `VERSION_ROOMS_LIMIT`, `VERSION_CACHE_SIZE`, `VERSION_CACHE_MAX_BYTES`, `VERSION_FAILURE_TTL_MS`; `AppRoute.VersionView`, `versionViewPagePath({ documentId, sequence })`; `HttpStatus.ServiceUnavailable`; `VERSION_FAILED_ERROR`, `VERSION_FAILED_MESSAGE`, `TOPICS_INTERRUPTED_MESSAGE`; constants `TOPIC_RECOMPUTE_NEW_BLOCKS`, `EVENTS_PAGE_SIZE`, `OTHER_BAND_ID`, `OTHER_BAND_NAME`, `FILTER_MAX_LENGTH`, `TOPICS_UNAVAILABLE_MESSAGE`, `TOPICS_PENDING_MESSAGE`, `TOPICS_FAILED_MESSAGE`, `TOPICS_REFRESH_TOO_SOON_MESSAGE`, `HISTORY_CATCHING_UP_MESSAGE`, `NO_MATCHING_EDITS_MESSAGE`, `VERSION_NOT_READY_ERROR`; enums `TopicState`, `TimelineFilterKind`, `VersionViewerState`, `TimelineBandKind`, `TimelineSearchParam`, `TimelineQueryParam`, `VersionResource`; types `TimelineFilter`, `TimelineCell`, `TimelineBin`, `TimelineBand`, `TimelineContributor`, `TopicStatus`, `ProjectionStatus`, `DocumentTimeline`, `DocumentTopic`, `DocumentTopics`, `TopicSummary`, `TopicSummaries`, `EditRunView`, `BinEdits`, `VersionSummary`, `VersionText`, `VersionMarks`; `DocumentEditEvents.nextAfterSequence`; `HttpStatus.Accepted`; `DocumentResource.{Timeline, Topics, Summaries, Versions}`; `topicsRefreshApiPath(documentId)`, `timelineEditsApiPath(documentId)`, `versionApiPath({ documentId, sequence, resource? })`, `versionCollaborationPath({ documentId, sequence })`; package subpath `@superdoc-collab/history/timeline`.

- [x] **Step 0: Dependencies, one install** — write, all exact: `apps/server/package.json` dependencies `ai 7.0.142`, `@openrouter/ai-sdk-provider 3.1.0`; `apps/web/package.json` dependencies `d3-shape 3.2.0`, `d3-scale 4.0.2`, `@superdoc-collab/history workspace:*`, devDependencies `@types/d3-shape 3.2.0`, `@types/d3-scale 4.0.9`; `libs/history/package.json` dependency `zod 4.6.7` and `"exports"` gains `"./timeline": "./src/timeline/index.ts"`. Add the line `OPENROUTER_BASE_URL=` under `LLM_MODEL` in `.env.example` (owner-approved; `.env` is never opened). Run `pnpm install` once. Check `ls node_modules/.pnpm | grep -E '^ai@7.0.142|openrouter\+ai-sdk-provider@3.1.0'` prints both. Then read the `MockLanguageModelV4` constructor and `LanguageModelV4GenerateResult` in `node_modules/ai/dist/test/index.d.ts` and `@ai-sdk/provider`: if the result shape differs from the literal in Task 8 (`content: [{ type: 'text', text }]`, `finishReason: { unified, raw }`, `usage: { inputTokens: { total, noCache, cacheRead, cacheWrite }, outputTokens: { total, text, reasoning } }`, `warnings`), correct Task 8's `testing/language-model.ts` in this plan before Task 8 starts.
- [x] **Step 1: Failing test** — `libs/types/src/timeline.test.ts`
```ts
describe('timeline contracts', () => {
  test('builds version and topics paths with encoded ids', () => {
    expect(versionApiPath({ documentId: 'a/b', sequence: 42 })).toBe('/api/documents/a%2Fb/versions/42');
    expect(versionApiPath({ documentId: 'd1', sequence: 7, resource: VersionResource.Text })).toBe('/api/documents/d1/versions/7/text');
    expect(topicsRefreshApiPath('d1')).toBe('/api/documents/d1/topics/refresh');
    expect(timelineEditsApiPath('d1')).toBe('/api/documents/d1/timeline/edits');
  });
  test('builds the iframe page of a version', () => {
    expect(versionViewPagePath({ documentId: 'd1', sequence: 42 })).toBe('/documents/d1/versions/42/view');
  });
  test('puts each version on its own collaboration endpoint', () => {
    expect(versionCollaborationPath({ documentId: 'a/b', sequence: 42 })).toBe('/collaboration/versions/a%2Fb/42');
  });
});
```
- [x] **Step 2: Run, expect failure** — `pnpm --filter @superdoc-collab/types test:unit` → FAIL: cannot find `./timeline` / `versionApiPath` is not exported. Commit the test alone: `test(types): pin the timeline and version contracts`; `git show --stat` lists only the test.
- [x] **Step 3: Implement** — `timeline.ts`
```ts
import type { EventAuthor } from './history';

export const TOPIC_RECOMPUTE_NEW_BLOCKS = 5;
export const EVENTS_PAGE_SIZE = 500;
export const FILTER_MAX_LENGTH = 200;
export const OTHER_BAND_ID = 'other';
export const OTHER_BAND_NAME = 'Other';
export const VERSION_NOT_READY_ERROR = 'VERSION_NOT_READY';
export const TOPICS_UNAVAILABLE_MESSAGE = 'Topics unavailable';
export const TOPICS_PENDING_MESSAGE = 'Naming topics…';
export const TOPICS_FAILED_MESSAGE = 'The topics could not be named. Try again.';
export const TOPICS_REFRESH_TOO_SOON_MESSAGE = 'Topics were refreshed a moment ago. Try again in a few seconds.';
export const HISTORY_CATCHING_UP_MESSAGE = 'History is catching up';
export const NO_MATCHING_EDITS_MESSAGE = 'No edits match';
export const TOPICS_INTERRUPTED_MESSAGE = 'Naming topics was interrupted. Try again.';
export const VERSION_FAILED_ERROR = 'VERSION_FAILED';
export const VERSION_FAILED_MESSAGE = 'This version could not be opened. Try another moment.';

export enum TopicState { Pending = 'pending', Ready = 'ready', Failed = 'failed' }
export enum TimelineFilterKind { Term = 'term', Author = 'author' }
export enum VersionViewerState { Live = 'live', Viewing = 'viewing' }
export enum TimelineBandKind { Topic = 'topic', Other = 'other', Author = 'author' }
export enum TimelineSearchParam { Term = 'term', Author = 'author', At = 'at', Topic = 'topic' }
export enum TimelineQueryParam { Term = 'term', Author = 'author', BinMs = 'binMs', BinStart = 'binStart', AfterSequence = 'afterSequence', Limit = 'limit', Around = 'around' }

export type TimelineFilter = { term: string | null; author: string | null };
export type TimelineCell = { inserted: number; deleted: number; authorKeys: string[] };
export type TimelineBin = { start: number; versionSequence: number | null; byBand: Record<string, TimelineCell> };
export type TimelineBand = { id: string; kind: TimelineBandKind; name: string; hue: number | null; onsetTime: number; volume: number };
export type TimelineContributor = { authorKey: string; inserted: number; deleted: number; wordsInserted: number; wordsDeleted: number };
export type TopicStatus = { state: TopicState; failure: string | null; computedAtSequence: number | null };
export type ProjectionStatus = { isBehind: boolean; lagMs: number | null; isDegraded: boolean };
export type DocumentTimeline = { binMs: number; bins: TimelineBin[]; bands: TimelineBand[]; contributorsByBand: Record<string, TimelineContributor[]>; authors: Record<string, EventAuthor>; topics: TopicStatus; projection: ProjectionStatus };
export type DocumentTopic = { id: string; name: string; blockCount: number };
export type DocumentTopics = { status: TopicStatus; topics: DocumentTopic[] };
export type TopicSummary = { topicId: string; sentence: string; computedAtSequence: number };
export type TopicSummaries = { summaries: TopicSummary[] };
export type EditRunView = { blockId: string; bandId: string; authorKeys: string[]; inserted: string; deleted: string; lastServerTime: number };
export type BinEdits = { binStart: number; binMs: number; runs: EditRunView[]; authors: Record<string, EventAuthor> };
export type VersionSummary = { sequence: number; serverTime: number; collaborationPath: string };
export type VersionText = { sequence: number; text: string };
export type VersionMarks = { marks: { sequence: number; serverTime: number }[] };
```
`routes.ts`: `DocumentResource` adds `Timeline = 'timeline'`, `Topics = 'topics'`, `Summaries = 'summaries'`, `Versions = 'versions'`; add `export enum VersionResource { Text = 'text' }` and four helpers built on `documentApiPath`: `topicsRefreshApiPath(documentId)` appends `/refresh` to the topics path, `timelineEditsApiPath(documentId)` appends `/edits` to the timeline path, `versionApiPath({ documentId, sequence, resource? })` is `<versions path>/<sequence>[/<resource>]` (early return without `resource`), and `versionCollaborationPath({ documentId, sequence })` is `` `${ApiPath.Collaboration}/versions/${encodeURIComponent(documentId)}/${sequence}` ``; the segments are constants at the top of `routes.ts`.
`history.ts`: `DocumentEditEvents = { events: DocumentEditEvent[]; cursor: number | null; nextAfterSequence: number | null }`. `http.ts`: `Accepted = 202`, `ServiceUnavailable = 503`. `routes.ts` also gains `AppRoute.VersionView = '/documents/:documentId/versions/:sequence/view'` and `versionViewPagePath({ documentId, sequence })` (`` `${documentPagePath(documentId)}/versions/${sequence}/view` ``). `constants.ts`, the home of time and policy numbers shared by the server and the libraries:
```ts
export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const VERSION_MARK_MS = MINUTE_MS;
export const VERSION_ROOM_IDLE_MS = MINUTE_MS;
export const VERSION_ROOMS_LIMIT = 32;
export const VERSION_CACHE_SIZE = 16;
export const VERSION_CACHE_MAX_BYTES = 256 * 1024 * 1024;
export const VERSION_FAILURE_TTL_MS = 30 * SECOND_MS;
```
`index.ts` re-exports `./timeline` and `./constants`.
- [x] **Step 4: Run, expect pass** — types suite green; `pnpm typecheck` reports only `nextAfterSequence` missing in `apps/server/src/history/history-routes.ts` (fixed by Task 7); record the exact error line.
- [x] **Step 5: Commit** — `chore(deps): add the AI SDK, OpenRouter and d3 for the timeline slice` (Step 0) and `feat(types): add timeline, topics and version contracts`

---

_Done — evidence: commits cf18e5a (tests), 3daec3d (deps), af6e792; task review approved_

### Task 2: Version marks, paged events and version state (G1)

**Files:**
- Create: `libs/history/src/{version-marks,version-state}.ts`, `libs/history/drizzle/read-model/0001_*.sql` (generated)
- Modify: `libs/history/src/{edit-events,projection,read-model,index}.ts`, `libs/history/src/schema/read-model.ts`, `libs/history/src/{projection,read-model}.test.ts` (callers of `commit` gain `marks: []`)
- Test: `libs/history/src/{version-marks,version-state}.test.ts`, `libs/history/src/read-model.test.ts`

**Interfaces:**
- Consumes: `UpdateLog`, `materialize`, `findBootstrapSequence`, `readMainStoryText`.
- Produces (with `VERSION_MARK_MS` imported from `@superdoc-collab/types`): `VersionMark = { sequence; serverTime; minuteStart; isBootstrap: boolean; snapshot: Uint8Array }`, `VersionMarkSummary = Omit<VersionMark, 'snapshot'>`, `minuteStartOf(serverTime)`, `endsItsMinute({ update, next })`, `markOf({ update, document, isBootstrap })`, `versionSequenceAt({ marks, time }): number | null`, `clampToMark({ marks, sequence }): VersionMarkSummary | null`; `ProjectedBatch = { events: ProjectedEdit[]; marks: VersionMark[] }` returned by `projectEditEvents`; `ReadModel.commit({ documentName, events, marks, lastSequence })`, `ReadModel.marks(documentName): VersionMarkSummary[]`, `ReadModel.mark({ documentName, sequence }): VersionMark | null`, `ReadModel.readPage({ documentName, afterSequence, limit }): { events: StoredEditEvent[]; cursor: number | null; nextAfterSequence: number | null }`; `REPLAY_CACHE_SIZE = 2`, `GcFreeReplays` with `version({ log, documentName, mark }): Y.Doc` and `forget(documentName)`; `MissingBootstrapUpdateError`.

- [x] **Step 1: Failing tests** — `version-state.test.ts` (the property test: every mark restores exactly what a full replay gives at its sequence; the spike's history was typing only, so the second fixture is delete-heavy on a `Y.Text`)
```ts
const DOCUMENT = 'version-room';
const EDITS = 30;
const BATCH_SIZE = 7;
const DELETE_ROUNDS = 40;
const INSERTED_PER_ROUND = 200;
const DELETED_PER_ROUND = 190;

function bootstrappedLog(texts: string[]): { log: UpdateLog; readModel: ReadModel; ana: Y.Doc } {
  const log = new UpdateLog(openTestDatabase({ set: MigrationSet.History }));
  const readModel = new ReadModel(openTestDatabase({ set: MigrationSet.ReadModel }));
  const ana = new Y.Doc();
  ana.on('update', (update: Uint8Array) => log.append({ documentName: DOCUMENT, connectionUserId: 'ana', update }));
  writeStory({ document: ana, texts });
  commitBootstrap(ana);
  return { log, readModel, ana };
}

function expectEveryMarkRestored({ log, readModel }: { log: UpdateLog; readModel: ReadModel }): void {
  const replays = new GcFreeReplays(REPLAY_CACHE_SIZE);
  readModel.marks(DOCUMENT).forEach(({ sequence }) => {
    const mark = readModel.mark({ documentName: DOCUMENT, sequence });
    if (!mark) throw new Error(`mark ${sequence} missing`);
    const restored = replays.version({ log, documentName: DOCUMENT, mark });
    const expected = replay(log.read({ documentName: DOCUMENT, untilSequence: sequence }));
    expect(restored.getMap('content').toJSON()).toEqual(expected.getMap('content').toJSON());
    expect(restored.getText('draft').toString()).toBe(expected.getText('draft').toString());
  });
}

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 16, 9, 0) }));
afterEach(() => vi.useRealTimers());

test('every mark restores the document exactly as a full replay at its sequence', () => {
  const { log, readModel, ana } = bootstrappedLog(['Plan']);
  Array.from({ length: EDITS }).forEach((_, index) => {
    vi.advanceTimersByTime(VERSION_MARK_MS / 3);
    writeStory({ document: ana, texts: [`Plan ${'x'.repeat(index)}`, index % 4 === 0 ? '' : `Note ${index}`] });
  });
  projectPending({ log, readModel, documentName: DOCUMENT, batchSize: BATCH_SIZE });
  expect(readModel.marks(DOCUMENT).length).toBeGreaterThan(EDITS / 3);
  expectEveryMarkRestored({ log, readModel });
});
test('a delete-heavy history restores exactly at every mark', () => {
  const { log, readModel, ana } = bootstrappedLog(['Plan']);
  const draft = ana.getText('draft');
  Array.from({ length: DELETE_ROUNDS }).forEach((_, round) => {
    vi.advanceTimersByTime(VERSION_MARK_MS / 2);
    draft.insert(0, 'x'.repeat(INSERTED_PER_ROUND));
    draft.delete(0, DELETED_PER_ROUND);
    writeStory({ document: ana, texts: [`Plan ${round}`] });
  });
  projectPending({ log, readModel, documentName: DOCUMENT, batchSize: BATCH_SIZE });
  expectEveryMarkRestored({ log, readModel });
});
```
`version-marks.test.ts`, each input → expected:
- `keeps the bootstrap mark and one mark per minute`: the log above projected → exactly one mark with `isBootstrap: true` at the bootstrap sequence, and no two non-bootstrap marks share a `minuteStart`, even though `batchSize: 7` splits minutes across batches.
- `versionSequenceAt picks the latest mark before the time, else the first`: marks at times 10, 70, 130 (sequences 3, 9, 14) → time 75 → 9; time 5 → 3; `[]` → `null`.
- `clampToMark snaps down and lifts a sequence before the first mark`: sequence 12 → 9; 1 → 3; 99 → 14.

`read-model.test.ts` adds:
- `readPage ends on a sequence boundary`: events at sequences `[1, 1, 2, 3, 3, 3, 4]`, `limit: 4` → page sequences `[1, 1, 2, 3, 3, 3]`, `nextAfterSequence: 3`; next page from 3 → `[4]`, `nextAfterSequence: null`.
- `forget clears the marks`: commit one mark, `forget` → `marks` is `[]`.
- [x] **Step 2: Run, expect failure** — `pnpm --filter @superdoc-collab/history test:unit` → FAIL: cannot find `./version-state` and `./version-marks`. Commit the tests alone: `test(history): pin version marks, paged events and exact version state`.
- [x] **Step 3: Schema** — `schema/read-model.ts` adds `versionMarks = sqliteTable('version_marks', { documentName: text('document_name').notNull(), sequence: integer('sequence').notNull(), serverTime: integer('server_time').notNull(), minuteStart: integer('minute_start').notNull(), isBootstrap: integer('is_bootstrap', { mode: 'boolean' }).notNull(), snapshot: blob('snapshot').notNull() }, (table) => [primaryKey({ columns: [table.documentName, table.sequence] }), index('version_marks_by_minute').on(table.documentName, table.minuteStart)])`; `pnpm --filter @superdoc-collab/history exec drizzle-kit generate --config drizzle.read-model.config.ts` creates `drizzle/read-model/0001_*.sql`; never hand-edit it.
- [x] **Step 4: Implement marks and projection** — `version-marks.ts`
```ts
import { VERSION_MARK_MS } from '@superdoc-collab/types';
import * as Y from 'yjs';
import type { LoggedUpdate } from './update-log';

export type VersionMark = { sequence: number; serverTime: number; minuteStart: number; isBootstrap: boolean; snapshot: Uint8Array };
export type VersionMarkSummary = Omit<VersionMark, 'snapshot'>;

export function minuteStartOf(serverTime: number): number {
  return Math.floor(serverTime / VERSION_MARK_MS) * VERSION_MARK_MS;
}

export function endsItsMinute({ update, next }: { update: LoggedUpdate; next: LoggedUpdate | undefined }): boolean {
  if (!next) return true;
  return minuteStartOf(next.serverTime) !== minuteStartOf(update.serverTime);
}

export function markOf({ update, document, isBootstrap }: { update: LoggedUpdate; document: Y.Doc; isBootstrap: boolean }): VersionMark {
  return { sequence: update.sequence, serverTime: update.serverTime, minuteStart: minuteStartOf(update.serverTime), isBootstrap, snapshot: Y.encodeSnapshot(Y.snapshot(document)) };
}

export function versionSequenceAt({ marks, time }: { marks: VersionMarkSummary[]; time: number }): number | null {
  const first = marks[0];
  if (!first) return null;
  const before = marks.filter((mark) => mark.serverTime < time).at(-1);
  if (!before) return first.sequence;
  return before.sequence;
}

export function clampToMark({ marks, sequence }: { marks: VersionMarkSummary[]; sequence: number }): VersionMarkSummary | null {
  const first = marks[0];
  if (!first) return null;
  const atOrBefore = marks.filter((mark) => mark.sequence <= sequence).at(-1);
  if (!atOrBefore) return first;
  return atOrBefore;
}
```
`edit-events.ts`: `projectEditEvents` returns `ProjectedBatch`; inside its `flatMap((update, index) => …)`, after `previous = current`, add `if (endsItsMinute({ update, next: updates[index + 1] })) marks.push(markOf({ update, document, isBootstrap: false }));` with `const marks: VersionMark[] = []` declared before, and `return { events, marks }`. `projection.ts`: `continueProjection` destructures `{ events, marks }` and passes `marks` to `commit`; the bootstrap branch commits `marks: [bootstrapMark({ log, documentName, sequence: bootstrapSequence })]`:
```ts
function bootstrapMark({ log, documentName, sequence }: { log: UpdateLog; documentName: string; sequence: number }): VersionMark {
  const [update] = log.readRange({ documentName, afterSequence: sequence - 1, untilSequence: sequence });
  if (!update) throw new MissingBootstrapUpdateError(sequence);
  return markOf({ update, document: materialize({ log, documentName, untilSequence: sequence }), isBootstrap: true });
}
```
`read-model.ts`: `READ_MODEL_TABLES` gains `'version_marks'`; inside `commit`'s transaction, after the events, `marks.forEach((mark) => { pruneMinute.run(documentName, mark.minuteStart, mark.sequence); insertMark.run({ documentName, ...mark, isBootstrap: mark.isBootstrap ? 1 : 0 }); })` with `PRUNE_MINUTE = 'DELETE FROM version_marks WHERE document_name = ? AND minute_start = ? AND sequence < ? AND is_bootstrap = 0'` and `INSERT OR IGNORE`. `marks` selects everything but `snapshot` ordered by sequence; `mark` selects one row and returns `new Uint8Array(row.snapshot)`. `readPage` runs in one transaction: the boundary is `SELECT sequence … ORDER BY sequence, id LIMIT 1 OFFSET limit - 1`; without a boundary it returns `read(...)` and `nextAfterSequence: null`; with one it returns every event with `sequence <= boundary` and `nextAfterSequence: boundary` when `SELECT 1 … sequence > boundary LIMIT 1` finds a row, else `null`.
- [x] **Step 5: Implement version state** — `version-state.ts` (spike §1: restore 1–8 ms, gc:false +0.9% memory)
```ts
export const REPLAY_CACHE_SIZE = 2;

type Replay = { document: Y.Doc; lastSequence: number };

export class GcFreeReplays {
  private readonly capacity: number;
  private readonly replays = new Map<string, Replay>();

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  version({ log, documentName, mark }: { log: UpdateLog; documentName: string; mark: VersionMark }): Y.Doc {
    return Y.createDocFromSnapshot(this.caughtUp({ log, documentName }), Y.decodeSnapshot(mark.snapshot));
  }

  forget(documentName: string): void {
    this.replays.delete(documentName);
  }

  private replayOf(documentName: string): Replay {
    const cached = this.replays.get(documentName);
    if (cached) return cached;
    return { document: new Y.Doc({ gc: false }), lastSequence: 0 };
  }

  private caughtUp({ log, documentName }: { log: UpdateLog; documentName: string }): Y.Doc {
    const replay = this.replayOf(documentName);
    const tail = log.readRange({ documentName, afterSequence: replay.lastSequence, untilSequence: Number.MAX_SAFE_INTEGER });
    tail.forEach((update) => Y.applyUpdate(replay.document, update.update));
    const lastSequence = tail.reduce((latest, update) => Math.max(latest, update.sequence), replay.lastSequence);
    this.replays.delete(documentName);
    this.replays.set(documentName, { document: replay.document, lastSequence });
    [...this.replays.keys()].slice(0, Math.max(0, this.replays.size - this.capacity)).forEach((evicted) => this.replays.delete(evicted));
    return replay.document;
  }
}
```
`index.ts` re-exports both new modules.
- [x] **Step 6: Run, expect pass** — every `libs/history` suite; `pnpm --filter @superdoc-collab/history typecheck` clean.
- [x] **Step 7: Commit** — `feat(history): record per-minute version marks and restore exact versions`

---

_Done — evidence: commits through 6f04d47; task review approved (restore == replay at every mark on three fixtures)_

### Task 3: Timeline library: bins, runs, words, stack rows, bands (G1)

**Files:**
- Create: `libs/history/src/timeline/{bins,runs,words,stack,bands,index}.ts`
- Modify: `libs/history/src/index.ts` (re-exports `./timeline`)
- Test: `libs/history/src/timeline/{bins,runs,words,bands}.test.ts`

**Interfaces:**
- Consumes: `TimelineBin`, `TimelineCell`, `TimelineBand`, `TimelineBandKind`, `TimelineContributor`, `EventAuthor`, `OTHER_BAND_ID`.
- Produces (importable from `@superdoc-collab/history/timeline`, which imports nothing but `@superdoc-collab/types`; `SECOND_MS` and `MINUTE_MS` come from there): `MAX_BINS = 120`, `BIN_LADDER_MS`, `chooseBinMs(spanMs)`, `binStartOf({ time, binMs })`, `binStartsCovering({ firstTime, lastTime, binMs })`, `buildBins({ runs, binStarts, binMs, versionSequenceAt })`; `TimelineEvent = { sequence; serverTime; blockId; bandId; authorKeys: string[]; inserted; deleted }`, `EditRun = { binStart; blockId; bandId; authorKeys; inserted; deleted; firstServerTime; lastServerTime; lastSequence }`, `authorKey(author: EventAuthor): string`, `groupIntoRuns({ events, binMs })`, `runMatchesTerm({ run, term })`, `filterRuns({ runs, term, authorKeys })`; `countWords(text)`; `TOPIC_HUE_START = 205`, `TOPIC_HUE_END = 25`, `StackRow = { start: number; values: Record<string, number> }`, `toStackRows({ bins, bandIds })`, `huesByOnset(bands)`; `BandIdentity = { id; kind; name }`, `buildBands({ identities, allRuns, matchedRuns })`, `contributorsByBand(runs)`.

- [x] **Step 1: Failing tests** — `runs.test.ts`
```ts
const BIN_MS = MINUTE_MS;

function typed({ text, author, blockId, startTime }: { text: string; author: string; blockId: string; startTime: number }): TimelineEvent[] {
  return [...text].map((character, index) => ({ sequence: startTime + index, serverTime: startTime + index, blockId, bandId: blockId, authorKeys: [author], inserted: character, deleted: '' }));
}

test('keystrokes of one author in one block and bin join into one run', () => {
  const runs = groupIntoRuns({ events: [...typed({ text: 'budget', author: 'ana', blockId: 'b1', startTime: 0 }), ...typed({ text: 'hire', author: 'bruno', blockId: 'b2', startTime: 100 })], binMs: BIN_MS });
  expect(runs.map((run) => [run.authorKeys, run.inserted])).toEqual([[['ana'], 'budget'], [['bruno'], 'hire']]);
});
test('a term with regex metacharacters matches literally', () => {
  const runs = groupIntoRuns({ events: [...typed({ text: 'cost a.b*( up', author: 'ana', blockId: 'b1', startTime: 0 }), ...typed({ text: 'aXbb', author: 'ana', blockId: 'b2', startTime: 50 })], binMs: BIN_MS });
  expect(filterRuns({ runs, term: 'a.b*(', authorKeys: null }).map((run) => run.blockId)).toEqual(['b1']);
  expect(filterRuns({ runs, term: '[', authorKeys: null })).toEqual([]);
});
```
Also, each input → expected:
- `runs.test.ts` — `matching is case-insensitive and finds backspaced deletions`: a run with `deleted: 'tegdub'` (Backspace order) matches `'Budget'`; `filterRuns` with `authorKeys: new Set(['bruno'])` keeps only Bruno's run; `authorKey({ id: null, name: 'Chris Crawford' })` is `'imported:Chris Crawford'`.
- `bins.test.ts` — `chooseBinMs` over spans 30 s → 10 s, 2 min → 10 s, 10 min → 10 s, 30 min → 30 s, 3 h → 2 min, 5 h → 5 min, 30 days → 6 h, 3 years → a whole number of weeks; in every case `Math.ceil(span / binMs) + 1 <= MAX_BINS`. `a single edit yields three bins, the middle one filled`: one run at 10:00:30, `binStartsCovering` → `[09:59, 10:00, 10:01]` and only the middle bin has a cell. `bins between edits stay empty and carry the version before their end`: runs at 10:00 and 10:03 with `versionSequenceAt` returning `start + binMs` → six bins (two padding), bins 10:01 and 10:02 have `byBand: {}` and a non-null `versionSequence`.
- `words.test.ts` — `countWords('  plan the  budget ')` is 3; `''` and `'   '` are 0; the run `'Hello w'` built from seven keystrokes counts 2.
- `bands.test.ts` — `hues follow onset from cool to warm and Other has none`: bands with onsets 30, 10, 20 and one Other → hues by id `{ b10: 205, b20: 115, b30: 25 }`, Other `null`; one band alone → 205. `volume counts matched runs only, onset counts all runs`: a filter that removes the earliest run keeps the onset time of that run and drops its characters from `volume`. `contributors sort by characters`: Ana 10 characters, Bruno 30 → `[bruno, ana]`, with `wordsInserted` from `countWords` per run.
- [x] **Step 2: Run, expect failure** — FAIL: cannot find `./runs`, `./bins`, `./words`, `./bands`. Commit the tests alone: `test(history): pin timeline bins, runs, words and bands`.
- [x] **Step 3: Implement** — `bins.ts`
```ts
export const MAX_BINS = 120;
const WEEK_MS = 10_080 * MINUTE_MS;
const SUB_MINUTE_BINS_MS = [10 * SECOND_MS, 30 * SECOND_MS];
const BIN_LADDER_MINUTES = [1, 2, 5, 10, 15, 30, 60, 180, 360, 720, 1440];
export const BIN_LADDER_MS = [...SUB_MINUTE_BINS_MS, ...BIN_LADDER_MINUTES.map((minutes) => minutes * MINUTE_MS), WEEK_MS];

export function chooseBinMs(spanMs: number): number {
  const fitting = BIN_LADDER_MS.find((binMs) => Math.ceil(spanMs / binMs) + 1 <= MAX_BINS);
  if (fitting) return fitting;
  return Math.ceil(spanMs / MAX_BINS / WEEK_MS) * WEEK_MS;
}

export function binStartOf({ time, binMs }: { time: number; binMs: number }): number {
  return Math.floor(time / binMs) * binMs;
}

export function binStartsCovering({ firstTime, lastTime, binMs }: { firstTime: number; lastTime: number; binMs: number }): number[] {
  const first = binStartOf({ time: firstTime, binMs }) - binMs;
  const last = binStartOf({ time: lastTime, binMs }) + binMs;
  return Array.from({ length: (last - first) / binMs + 1 }, (_, index) => first + index * binMs);
}

function mergeCell({ cell, run }: { cell: TimelineCell | undefined; run: EditRun }): TimelineCell {
  if (!cell) return { inserted: run.inserted.length, deleted: run.deleted.length, authorKeys: run.authorKeys };
  return { inserted: cell.inserted + run.inserted.length, deleted: cell.deleted + run.deleted.length, authorKeys: [...new Set([...cell.authorKeys, ...run.authorKeys])].sort() };
}

export function buildBins({ runs, binStarts, binMs, versionSequenceAt }: { runs: EditRun[]; binStarts: number[]; binMs: number; versionSequenceAt: (time: number) => number | null }): TimelineBin[] {
  return binStarts.map((start) => ({
    start,
    versionSequence: versionSequenceAt(start + binMs),
    byBand: runs.filter((run) => run.binStart === start).reduce<Record<string, TimelineCell>>((cells, run) => ({ ...cells, [run.bandId]: mergeCell({ cell: cells[run.bandId], run }) }), {}),
  }));
}
```
`runs.ts`
```ts
const IMPORTED_AUTHOR_PREFIX = 'imported:';
const RUN_KEY_SEPARATOR = '|';

export function authorKey(author: EventAuthor): string {
  if (author.id === null) return `${IMPORTED_AUTHOR_PREFIX}${author.name}`;
  return author.id;
}

export function groupIntoRuns({ events, binMs }: { events: TimelineEvent[]; binMs: number }): EditRun[] {
  const runs = new Map<string, EditRun>();
  [...events].sort((left, right) => left.sequence - right.sequence || left.serverTime - right.serverTime).forEach((event) => {
    const binStart = binStartOf({ time: event.serverTime, binMs });
    const key = [binStart, event.blockId, event.authorKeys.join(',')].join(RUN_KEY_SEPARATOR);
    const run = runs.get(key);
    if (!run) {
      runs.set(key, { binStart, blockId: event.blockId, bandId: event.bandId, authorKeys: event.authorKeys, inserted: event.inserted, deleted: event.deleted, firstServerTime: event.serverTime, lastServerTime: event.serverTime, lastSequence: event.sequence });
      return;
    }
    runs.set(key, { ...run, inserted: run.inserted + event.inserted, deleted: run.deleted + event.deleted, lastServerTime: event.serverTime, lastSequence: event.sequence });
  });
  return [...runs.values()];
}

export function runMatchesTerm({ run, term }: { run: EditRun; term: string }): boolean {
  const needle = term.toLocaleLowerCase();
  const backspacedDeletion = [...run.deleted].reverse().join('');
  return [run.inserted, run.deleted, backspacedDeletion].some((text) => text.toLocaleLowerCase().includes(needle));
}

export function filterRuns({ runs, term, authorKeys }: { runs: EditRun[]; term: string | null; authorKeys: Set<string> | null }): EditRun[] {
  return runs.filter((run) => {
    const matchesTerm = term === null || runMatchesTerm({ run, term });
    const matchesAuthor = authorKeys === null || run.authorKeys.some((key) => authorKeys.has(key));
    return matchesTerm && matchesAuthor;
  });
}
```
`words.ts`: `const WORD_PATTERN = /\S+/g;` and `countWords` returns `0` when `text.match(WORD_PATTERN)` is `null`, else its length. `stack.ts`: `toStackRows` maps each bin to `{ start, values }` with one entry per band id, the cell's `inserted + deleted` or 0 when the bin has no cell for that band (an explicit `if (!cell) return 0` in `cellVolume`; an empty cell is a real zero); `huesByOnset` sorts by `onsetTime` and spreads hues evenly from `TOPIC_HUE_START` (205) to `TOPIC_HUE_END` (25), a single band taking 205.
`bands.ts`
```ts
export type BandIdentity = { id: string; kind: TimelineBandKind; name: string };

function runsOf({ runs, bandId }: { runs: EditRun[]; bandId: string }): EditRun[] {
  return runs.filter((run) => run.bandId === bandId);
}

function hueOf({ hues, bandId }: { hues: Map<string, number>; bandId: string }): number | null {
  const hue = hues.get(bandId);
  if (hue === undefined) return null;
  return hue;
}

export function buildBands({ identities, allRuns, matchedRuns }: { identities: BandIdentity[]; allRuns: EditRun[]; matchedRuns: EditRun[] }): TimelineBand[] {
  const present = identities
    .map((identity) => ({ identity, runs: runsOf({ runs: allRuns, bandId: identity.id }) }))
    .filter(({ runs }) => runs.length > 0)
    .map(({ identity, runs }) => ({ ...identity, onsetTime: Math.min(...runs.map((run) => run.firstServerTime)) }));
  const hues = huesByOnset(present.filter((band) => band.kind !== TimelineBandKind.Other));
  return present.map((band) => ({ ...band, hue: hueOf({ hues, bandId: band.id }), volume: runsOf({ runs: matchedRuns, bandId: band.id }).reduce((sum, run) => sum + run.inserted.length + run.deleted.length, 0) }));
}

function addRun({ contributor, run }: { contributor: TimelineContributor; run: EditRun }): TimelineContributor {
  return { ...contributor, inserted: contributor.inserted + run.inserted.length, deleted: contributor.deleted + run.deleted.length, wordsInserted: contributor.wordsInserted + countWords(run.inserted), wordsDeleted: contributor.wordsDeleted + countWords(run.deleted) };
}

function contributorOf({ byAuthor, authorKey }: { byAuthor: Map<string, TimelineContributor>; authorKey: string }): TimelineContributor {
  const existing = byAuthor.get(authorKey);
  if (existing) return existing;
  return { authorKey, inserted: 0, deleted: 0, wordsInserted: 0, wordsDeleted: 0 };
}

function authorsOfBand({ totals, bandId }: { totals: Map<string, Map<string, TimelineContributor>>; bandId: string }): Map<string, TimelineContributor> {
  const existing = totals.get(bandId);
  if (existing) return existing;
  const created = new Map<string, TimelineContributor>();
  totals.set(bandId, created);
  return created;
}

export function contributorsByBand(runs: EditRun[]): Record<string, TimelineContributor[]> {
  const totals = new Map<string, Map<string, TimelineContributor>>();
  runs.forEach((run) => {
    const byAuthor = authorsOfBand({ totals, bandId: run.bandId });
    run.authorKeys.forEach((key) => byAuthor.set(key, addRun({ contributor: contributorOf({ byAuthor, authorKey: key }), run })));
  });
  return Object.fromEntries([...totals].map(([bandId, byAuthor]) => [bandId, [...byAuthor.values()].sort((left, right) => right.inserted + right.deleted - (left.inserted + left.deleted))]));
}
```
`timeline/index.ts` re-exports the five files.
- [x] **Step 4: Run, expect pass** — the four suites; `grep -rn "from '\.\./" libs/history/src/timeline` prints nothing (the subpath stays free of SQLite and Yjs).
- [x] **Step 5: Commit** — `feat(history): add the timeline aggregation library`

---

_Done — evidence: commits bbc9408 (tests), c5a1f44; task review approved (MAX_BINS invariant pinned)_

### Task 4: Topic schemas and block assignment (G1)

**Files:**
- Create: `libs/history/src/topics/{topic-schema,topic-assignment,index}.ts`
- Modify: `libs/history/src/index.ts`
- Test: `libs/history/src/topics/{topic-schema,topic-assignment}.test.ts`

**Interfaces:**
- Consumes: `OTHER_BAND_ID`.
- Produces: `MIN_TOPICS = 4`, `MAX_TOPICS = 8`, `MAX_TOPICS_ACCEPTED = 20`, `TOPIC_NAME_MAX_LENGTH = 40`, `SUMMARY_SENTENCE_MAX_LENGTH = 200`, `DUPLICATE_TOPIC_NAMES_MESSAGE`, `topicsOutputSchema`, `summariesOutputSchema`, `TopicsOutput`, `SummariesOutput`; `NormalizedTopic = { name: string; blockIds: string[] }`, `normalizeTopics({ output, knownBlockIds }): { topics: NormalizedTopic[]; unknownBlockIds: string[] }`, `assignBlocks(topics: { id: string; blockIds: string[] }[]): Map<string, string>`, `topicBandId({ assignment, blockId }): string`, `IdentifiedTopic = NormalizedTopic & { id: string | null }`, `matchPreviousTopics({ previous, next }: { previous: { id: string; blockIds: string[] }[]; next: NormalizedTopic[] }): IdentifiedTopic[]`.

- [x] **Step 1: Failing tests** — `topic-assignment.test.ts`
```ts
function topic({ name, count, offset }: { name: string; count: number; offset: number }) {
  return { name, blockIds: Array.from({ length: count }, (_, index) => `b${offset + index}`) };
}

const KNOWN = new Set(Array.from({ length: 200 }, (_, index) => `b${index}`));

test('twelve topics keep the eight largest in the order the model gave', () => {
  const output = { topics: Array.from({ length: 12 }, (_, index) => topic({ name: `T${index}`, count: index + 1, offset: index * 20 })) };
  const { topics } = normalizeTopics({ output, knownBlockIds: KNOWN });
  expect(topics.map((kept) => kept.name)).toEqual(['T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11']);
});
test('unknown block ids are dropped and reported', () => {
  const { topics, unknownBlockIds } = normalizeTopics({ output: { topics: [{ name: 'Budget', blockIds: ['b1', 'gone', 'b2'] }, { name: 'Ghost', blockIds: ['gone'] }] }, knownBlockIds: KNOWN });
  expect(topics).toEqual([{ name: 'Budget', blockIds: ['b1', 'b2'] }]);
  expect(unknownBlockIds).toEqual(['gone']);
});
```
Also, each input → expected:
- `topic-assignment.test.ts` — `a recomputed topic keeps the id of the topic it mostly covers`: previous `t1 [b1, b2, b3]`, `t2 [b4]`; next `Costs [b1, b2, b9]`, `Team [b4, b5, b6]`, `New [b7]` → ids `t1`, `null` (one of three blocks is under half), `null`; an id is reused at most once, by the larger overlap. `one topic is kept as is`; `a block claimed twice stays with the first topic`; `assignBlocks` then `topicBandId` → the topic id for `b1`, `OTHER_BAND_ID` for `b99`.
- `topic-schema.test.ts` — `topicsOutputSchema` rejects `{ topics: [] }`, a topic with `blockIds: []`, two topics named `'Budget'` and `' budget '` (duplicate after trim and case), a 41-character name, and 21 topics; accepts 1 and 12. `summariesOutputSchema` rejects a 201-character sentence and accepts `{ summaries: [] }`.
- [x] **Step 2: Run, expect failure** — FAIL: cannot find `./topic-assignment`, `./topic-schema`. Commit the tests alone: `test(history): pin topic schemas, clamping and block assignment`.
- [x] **Step 3: Implement** — `topic-schema.ts`
```ts
export const MIN_TOPICS = 4;
export const MAX_TOPICS = 8;
export const MAX_TOPICS_ACCEPTED = 20;
export const TOPIC_NAME_MAX_LENGTH = 40;
export const SUMMARY_SENTENCE_MAX_LENGTH = 200;
export const DUPLICATE_TOPIC_NAMES_MESSAGE = 'Topic names must be unique.';

const topicSchema = z.object({ name: z.string().trim().min(1).max(TOPIC_NAME_MAX_LENGTH), blockIds: z.array(z.string().min(1)).min(1) });

export const topicsOutputSchema = z
  .object({ topics: z.array(topicSchema).min(1).max(MAX_TOPICS_ACCEPTED) })
  .refine((output) => new Set(output.topics.map((topic) => topic.name.toLocaleLowerCase())).size === output.topics.length, { message: DUPLICATE_TOPIC_NAMES_MESSAGE });

export const summariesOutputSchema = z.object({ summaries: z.array(z.object({ topicId: z.string().min(1), sentence: z.string().trim().min(1).max(SUMMARY_SENTENCE_MAX_LENGTH) })) });

export type TopicsOutput = z.infer<typeof topicsOutputSchema>;
export type SummariesOutput = z.infer<typeof summariesOutputSchema>;
```
`topic-assignment.ts`
```ts
export type NormalizedTopic = { name: string; blockIds: string[] };

export function normalizeTopics({ output, knownBlockIds }: { output: TopicsOutput; knownBlockIds: Set<string> }): { topics: NormalizedTopic[]; unknownBlockIds: string[] } {
  const unknownBlockIds = [...new Set(output.topics.flatMap((topic) => topic.blockIds))].filter((blockId) => !knownBlockIds.has(blockId));
  const claimed = new Set<string>();
  const known = output.topics
    .map((topic) => {
      const blockIds = [...new Set(topic.blockIds)].filter((blockId) => knownBlockIds.has(blockId) && !claimed.has(blockId));
      blockIds.forEach((blockId) => claimed.add(blockId));
      return { name: topic.name, blockIds };
    })
    .filter((topic) => topic.blockIds.length > 0);
  const largest = new Set([...known].sort((left, right) => right.blockIds.length - left.blockIds.length).slice(0, MAX_TOPICS));
  return { topics: known.filter((topic) => largest.has(topic)), unknownBlockIds };
}

export type IdentifiedTopic = NormalizedTopic & { id: string | null };

function sharedBlocks({ blockIds, previousBlockIds }: { blockIds: string[]; previousBlockIds: string[] }): number {
  return blockIds.filter((blockId) => previousBlockIds.includes(blockId)).length;
}

function chosenId({ chosen, index }: { chosen: Map<number, string>; index: number }): string | null {
  const id = chosen.get(index);
  if (id === undefined) return null;
  return id;
}

export function matchPreviousTopics({ previous, next }: { previous: { id: string; blockIds: string[] }[]; next: NormalizedTopic[] }): IdentifiedTopic[] {
  const candidates = next
    .flatMap((topic, index) => previous.map((old) => ({ index, id: old.id, needed: topic.blockIds.length, shared: sharedBlocks({ blockIds: topic.blockIds, previousBlockIds: old.blockIds }) })))
    .filter((candidate) => candidate.shared * 2 >= candidate.needed)
    .sort((left, right) => right.shared - left.shared);
  const taken = new Set<string>();
  const chosen = new Map<number, string>();
  candidates.forEach((candidate) => {
    if (taken.has(candidate.id) || chosen.has(candidate.index)) return;
    taken.add(candidate.id);
    chosen.set(candidate.index, candidate.id);
  });
  return next.map((topic, index) => ({ ...topic, id: chosenId({ chosen, index }) }));
}

export function assignBlocks(topics: { id: string; blockIds: string[] }[]): Map<string, string> {
  return new Map(topics.flatMap((topic) => topic.blockIds.map((blockId): [string, string] => [blockId, topic.id])));
}

export function topicBandId({ assignment, blockId }: { assignment: Map<string, string>; blockId: string }): string {
  const topicId = assignment.get(blockId);
  if (!topicId) return OTHER_BAND_ID;
  return topicId;
}
```
- [x] **Step 4: Run, expect pass** — both suites and every earlier `libs/history` suite.
- [x] **Step 5: Commit** — `feat(history): add topic schemas, clamping and block assignment`

---

_Done — evidence: commits through f1eebaa; task review approved after the controller ruled the id-stability denominator is the NEW topic (half of the new topic's blocks must come from the old one, so its summary stays relevant)_

### Task 5: LLM settings, insights schema and repository (G2)

**Files:**
- Create: `apps/server/src/database/schema/insights.ts`, `apps/server/drizzle/0002_*.sql` (generated), `apps/server/src/insights/{insights-repository,llm-client}.ts`
- Modify: `apps/server/src/config/environment.ts`, `apps/server/src/database/connection.ts` (schema spread), `apps/server/src/server.ts` (`services.insightsRepository`, `startServer({ …, languageModel })`), `apps/server/src/http/app.ts` (`AppServices.insightsRepository`), `apps/server/src/testing/{test-server,collaboration-client}.ts` (`startTestServer({ languageModel? })`, `documentWithOwner({ languageModel? })`)
- Test: `apps/server/src/config/environment.test.ts`, `apps/server/src/insights/{insights-repository,llm-client}.test.ts`

**Interfaces:**
- Consumes: `TopicState`, `TopicStatus`, `TopicSummary`, `IdentifiedTopic`.
- Produces: `LlmSettings = { model: string | null; apiKey: string | null; baseUrl: string | null }`, `Environment.llm`; tables `topicSets`, `documentTopics`, `topicBlocks`, `topicSummaries`; `StoredTopic = { id: string; name: string; position: number; blockIds: string[] }`; `InsightsRepository(database: AuthDatabase)`: `status(documentId): TopicStatus | null`, `markPending(documentId)`, `markFailed({ documentId, failure })`, `saveTopics({ documentId, topics: IdentifiedTopic[], computedAtSequence })`, `topics(documentId): StoredTopic[]`, `summaries(documentId): TopicSummary[]`, `saveSummaries({ summaries: { topicId: string; sentence: string }[]; computedAtSequence })`, `failInterrupted(failure)` (every `pending` set becomes `failed`); `services.insightsRepository`, `AppServices.insightsRepository`; `LanguageModelAvailability { Ready, Unavailable }`, `LanguageModelChoice`, `chooseLanguageModel(settings): LanguageModelChoice`, `generateStructured({ model, schema, system, prompt })`, `LLM_MODEL_MISSING_MESSAGE`, `LLM_KEY_MISSING_MESSAGE`; `startServer({ environment, webDistDirectory, languageModel = chooseLanguageModel(environment.llm) })`; `startTestServer({ languageModel? })` (default: `chooseLanguageModel` of the empty test settings, so `Unavailable`) and `documentWithOwner({ languageModel? })` threading it.

- [x] **Step 1: Failing tests** — `insights-repository.test.ts`
```ts
test('a recompute keeps reused topic ids with their summaries and drops the rest', async () => {
  const { server, documentId } = await documentWithOwner();
  const insights = server.services.insightsRepository;
  insights.saveTopics({ documentId, topics: [{ id: null, name: 'Budget', blockIds: ['b1', 'b2'] }, { id: null, name: 'Hiring', blockIds: ['b3'] }], computedAtSequence: 10 });
  const [budget, hiring] = insights.topics(documentId);
  insights.saveSummaries({ summaries: [{ topicId: budget!.id, sentence: 'Costs rose.' }, { topicId: hiring!.id, sentence: 'Two hires.' }], computedAtSequence: 10 });
  insights.saveTopics({ documentId, topics: [{ id: budget!.id, name: 'Costs', blockIds: ['b1', 'b2', 'b4'] }, { id: null, name: 'Scope', blockIds: ['b5'] }], computedAtSequence: 20 });
  expect(insights.topics(documentId).map((topic) => [topic.id === budget!.id, topic.name, topic.blockIds])).toEqual([[true, 'Costs', ['b1', 'b2', 'b4']], [false, 'Scope', ['b5']]]);
  expect(insights.summaries(documentId).map((summary) => summary.sentence)).toEqual(['Costs rose.']);
  expect(insights.status(documentId)).toEqual({ state: TopicState.Ready, failure: null, computedAtSequence: 20 });
  await server.stop();
});
```
Also, each input → expected:
- `failInterrupted turns every pending set into failed`: two documents, one `pending`, one `ready` → only the first becomes `{ state: failed, failure: TOPICS_INTERRUPTED_MESSAGE }`.
- `llm-client.test.ts`: `chooseLanguageModel({ model: null, … })` → `Unavailable` with `LLM_MODEL_MISSING_MESSAGE`; a model without a key → `LLM_KEY_MISSING_MESSAGE`; both set → `Ready` whose `model.modelId` is the configured id; `providerSettings` passes `baseURL` only when `baseUrl` is set.
- `markPending keeps the stored topics`: after `saveTopics`, `markPending` → `status.state` is `pending` and `topics` unchanged; `markFailed({ failure: 'x' })` → `{ state: failed, failure: 'x' }`, topics unchanged.
- `deleting the document cascades every insights row`: `documents.remove(documentId)` → `status` `null`, `topics` `[]`, and `SELECT COUNT(*) FROM topic_blocks` is 0.
- `environment.test.ts`: without `LLM_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` → `llm` is `{ model: null, apiKey: null, baseUrl: null }`; empty strings → the same; set values pass through; `OPENROUTER_BASE_URL=not-a-url` throws.
- [x] **Step 2: Run, expect failure** — `pnpm --filter @superdoc-collab/server test:unit` → FAIL: `services.insightsRepository` is undefined / cannot find `./insights-repository`. Commit the tests alone: `test(server): pin LLM settings and the insights repository`.
- [x] **Step 3: Implement** — `environment.ts`: a second schema `z.object({ LLM_MODEL: z.string().optional(), OPENROUTER_API_KEY: z.string().optional(), OPENROUTER_BASE_URL: z.union([z.literal(''), z.url()]).optional() })` parsed after the required one; `presentOrNull(value)` returns `null` for `undefined` or `''` (an explicit `if (!value) return null`), and `loadLlmSettings(source)` returns `{ model, apiKey, baseUrl }` through it.
`Environment` gains `llm: LlmSettings`, filled by `loadLlmSettings(source)`; the missing-variable check still walks only the required `schema.shape`. 
`llm-client.ts`
```ts
export const LLM_MODEL_MISSING_MESSAGE = 'Topics are unavailable: LLM_MODEL is not set on the server.';
export const LLM_KEY_MISSING_MESSAGE = 'Topics are unavailable: OPENROUTER_API_KEY is not set on the server.';
const LLM_TIMEOUT_MS = 30 * SECOND_MS;
const LLM_MAX_RETRIES = 1;

export enum LanguageModelAvailability { Ready = 'ready', Unavailable = 'unavailable' }
export type LanguageModelChoice = { availability: LanguageModelAvailability.Ready; model: LanguageModel } | { availability: LanguageModelAvailability.Unavailable; reason: string };

function providerSettings({ apiKey, baseUrl }: { apiKey: string; baseUrl: string | null }): OpenRouterProviderSettings {
  if (!baseUrl) return { apiKey };
  return { apiKey, baseURL: baseUrl };
}

export function chooseLanguageModel({ model, apiKey, baseUrl }: LlmSettings): LanguageModelChoice {
  if (!model) return { availability: LanguageModelAvailability.Unavailable, reason: LLM_MODEL_MISSING_MESSAGE };
  if (!apiKey) return { availability: LanguageModelAvailability.Unavailable, reason: LLM_KEY_MISSING_MESSAGE };
  return { availability: LanguageModelAvailability.Ready, model: createOpenRouter(providerSettings({ apiKey, baseUrl })).chat(model) };
}

export async function generateStructured<Schema extends z.ZodType>({ model, schema, system, prompt }: { model: LanguageModel; schema: Schema; system: string; prompt: string }): Promise<z.infer<Schema>> {
  const { output } = await generateText({ model, output: Output.object({ schema }), system, prompt, maxRetries: LLM_MAX_RETRIES, abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS) });
  return output;
}
```
Imports, pinned by the spike: `import { generateText, Output, type LanguageModel } from 'ai';`, `import { createOpenRouter, type OpenRouterProviderSettings } from '@openrouter/ai-sdk-provider';`, and in `testing/language-model.ts` `import { MockLanguageModelV4 } from 'ai/test';` (spike §3: 7 topics in 4–5 s on 50 blocks, summaries in 3–4 s).
`schema/insights.ts` (picked up by the `schema/*.ts` glob; `pnpm --filter @superdoc-collab/server exec drizzle-kit generate` → `drizzle/0002_*.sql`):
- `topic_sets`: `document_id` text primary key references `documents.id` on delete cascade; `state` `text('state', { enum: [TopicState.Pending, TopicState.Ready, TopicState.Failed] })` not null; `failure` text nullable; `computed_at_sequence` integer nullable; `updated_at` timestamp_ms not null.
- `document_topics`: `id` text primary key; `document_id` references `documents.id` cascade; `name` text; `position` integer; `index('document_topics_by_document').on(documentId)`.
- `topic_blocks`: `document_id` references `documents.id` cascade, `block_id` text, `topic_id` references `document_topics.id` cascade; primary key `(document_id, block_id)`.
- `topic_summaries`: `topic_id` primary key references `document_topics.id` cascade; `sentence` text; `computed_at_sequence` integer; all not null.

`insights-repository.ts` follows `DocumentsRepository` (constructor takes `AuthDatabase`, drizzle queries, one transaction per write). `saveTopics` deletes the document's `document_topics` rows whose id is not reused (cascading their blocks and summaries), updates the name and `position` (its index) of reused ones, inserts the others with `randomUUID()`, replaces the document's `topic_blocks`, then upserts `topic_sets` to `Ready` with `failure: null` and the sequence. `markPending` upserts the state only (an insert creates the row with `computedAtSequence: null`). `topics` orders by `position` and groups blocks per topic. `test-server.ts`: `startTestServer` builds `llm: { model: null, apiKey: null, baseUrl: null }` into its environment; `testEnvironment` too.
- [x] **Step 4: Run, expect pass** — the new suites and every slice 1–2 server suite.
- [x] **Step 5: Commit** — `feat(server): store topics, summaries and LLM settings`

---

_Done — evidence: commit 193be43; task review approved_

### Task 6: Projection worker: throttle from `onChange`, compaction, import lane, versions and blocks (G2)

**Files:**
- Create: `apps/server/src/history/projection-throttle.ts`
- Modify: `apps/server/src/history/{projection-messages,projection-worker,projection-scheduler,pending-documents}.ts`, `apps/server/src/collaboration/collaboration-server.ts`, `apps/server/src/server.ts`, `apps/server/src/testing/test-server.ts`
- Test: `apps/server/src/history/{projection-throttle,projection-scheduler}.test.ts`, `apps/server/src/collaboration/collaboration-history.test.ts`

**Interfaces:**
- Consumes: `GcFreeReplays`, `REPLAY_CACHE_SIZE`, `ReadModel.mark`, `compact`, `materialize`, `readMainStoryBlocks`, `readMainStoryText`, `Block`.
- Produces: `PROJECTION_THROTTLE_MS = 1500`, `ProjectionThrottle({ intervalMs, run })` with `request(documentId)` and `stop()`; `SNAPSHOT_EVERY_UPDATES` (moved to `projection-messages.ts`); `ProjectionRequestKind.Version | Blocks`; `VersionReply = { kind: Version; documentId; sequence; serverTime; state: Uint8Array; text: string }`, `BlocksReply = { kind: Blocks; documentId; sequence: number; blocks: Block[] }`; `ProjectionFailedReply` gains `requestKind` and `sequence: number | null`; `ProjectionReply = ProjectionDoneReply | VersionReply | BlocksReply | ProjectionFailedReply`; `findDocumentsWithoutMarks(readModelSqlite): string[]` (a cursor and no `version_marks` row), `ProjectionScheduler.rebuild({ documentId, filePath })` (forget, re-import, project) and `isRebuilding(documentId): boolean`; `ProjectionScheduler.version({ documentId, sequence }): Promise<VersionReply>`, `ProjectionScheduler.blocks(documentId): Promise<BlocksReply>`; `ProjectionDegradedError`, `MissingVersionMarkError`; `createCollaborationServer({ …, onLogged })`; `services.throttle`.

- [ ] **Step 1: Failing tests** — `projection-throttle.test.ts`
```ts
test('requests inside one interval run once, after the interval', () => {
  vi.useFakeTimers();
  const run = vi.fn();
  const throttle = new ProjectionThrottle({ intervalMs: PROJECTION_THROTTLE_MS, run });
  Array.from({ length: 5 }).forEach(() => throttle.request('d1'));
  throttle.request('d2');
  vi.advanceTimersByTime(PROJECTION_THROTTLE_MS - 1);
  expect(run).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(run.mock.calls).toEqual([['d1'], ['d2']]);
  throttle.request('d1');
  vi.advanceTimersByTime(PROJECTION_THROTTLE_MS);
  expect(run).toHaveBeenCalledTimes(3);
  vi.useRealTimers();
});
```
`projection-scheduler.test.ts` adds:
```ts
test('a hanging import does not delay the projection of another document', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const fifo = join(server.databaseDirectory, 'never-written.docx');
  execFileSync('mkfifo', [fifo]);
  server.services.scheduler.importRevisions({ documentId: randomUUID(), filePath: fifo });
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: ['a'] });
  commitBootstrap(client.document);
  writeStory({ document: client.document, texts: ['ab'] });
  await expect.poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => event.inserted).join(''), { timeout: IMPORT_TIMEOUT_MS / 3 }).toBe('b');
  client.close();
  await server.stop();
});
```
Also, each input → expected:
- `collaboration-history.test.ts` — `every logged update requests a throttled projection`: `vi.spyOn(server.services.throttle, 'request')` → after one insert, the polled spy calls contain `documentId` (the `onLogged` closure looks `request` up at call time, so the spy sees it). `the worker writes the heavy snapshot`: 1001 single-character inserts → polled `log.latestSnapshot({ documentName: documentId, atOrBefore: Number.MAX_SAFE_INTEGER })?.sequence` is defined within 15 s, and `collaboration-server.ts` no longer imports `compact` (checked by the typecheck after the import is removed).
- `projection-scheduler.test.ts` — `a document projected before marks existed is rebuilt at startup`: project a document with one imported revision and two edits, stop, `DELETE FROM version_marks` on `read-model.sqlite`, restart on the same directory → `isRebuilding(documentId)` is true at first, then polled false; `readModel.marks` holds the bootstrap mark; `/events` returns the same inserted texts and the imported revision once. `a failed version never touches the projection bookkeeping`: a `Version` failure for a document whose `Project` is in flight → the version promise rejects, and the in-flight projection still settles and reruns as before (no `PROJECTION_FAILED_MESSAGE` line). `version requests for the same mark share one worker round trip`: spy `currentWorker.postMessage`, two concurrent `version({ documentId, sequence })` → one `Version` message, both promises resolve to the same `text`. `a version of an unknown mark rejects`: sequence 999999 → rejects with a message naming `MissingVersionMarkError`. `blocks returns the story at the projection cursor`: after `'Hello'` is projected → `blocks[0].text` is `'Hello'`. `a degraded scheduler rejects versions at once`: set `degraded = true` → `version(...)` rejects with `ProjectionDegradedError`. `a terminated worker re-posts a waiting version`: terminate `currentWorker` right after `version(...)` → the promise still resolves.
- [ ] **Step 2: Run, expect failure** — FAIL: cannot find `./projection-throttle`; `scheduler.version` is not a function. Commit the tests alone: `test(server): pin the projection throttle, the import lane and version requests`.
- [ ] **Step 3: Implement** — `projection-throttle.ts`: `ProjectionThrottle` keeps a `Map<string, NodeJS.Timeout>`; `request(documentId)` returns when a timer exists for the document, else sets one for `intervalMs` that deletes itself and calls `run(documentId)`; `stop()` clears every timer. The trailing run is enough because the projection always reads everything after its cursor. `collaboration-server.ts`: `onChange` calls `onLogged(documentId)` after `log.append`; `onStoreDocument` keeps only `onStored(documentId)` (the `compact` call and `SNAPSHOT_EVERY_UPDATES` move to the worker). `server.ts`: `const throttle = new ProjectionThrottle({ intervalMs: PROJECTION_THROTTLE_MS, run: (documentId) => scheduler.schedule(documentId) })`, `onLogged: (documentId) => throttle.request(documentId)`, `onStored: (documentId) => documents.touch(documentId)`; `stop()` calls `throttle.stop()` before `scheduler.stop()`. Worker (`projection-worker.ts`): the log opens with `openSqliteFile({ directory: databaseDirectory, fileName: HISTORY_DATABASE_FILE })` (read-write for snapshots; `busy_timeout` serializes with the main thread's appends); `const replays = new GcFreeReplays(REPLAY_CACHE_SIZE)`; `handle` gains
```ts
  if (request.kind === ProjectionRequestKind.Project) compact({ log, documentName: documentId, everyUpdates: SNAPSHOT_EVERY_UPDATES });
  if (request.kind === ProjectionRequestKind.Version) return versionReply(request);
  if (request.kind === ProjectionRequestKind.Blocks) return blocksReply(documentId);
  if (kind === ProjectionRequestKind.Forget) replays.forget(documentId);
```
before the existing lines, with
```ts
function versionReply({ documentId, sequence }: { documentId: string; sequence: number }): VersionReply {
  const mark = readModel.mark({ documentName: documentId, sequence });
  if (!mark) throw new MissingVersionMarkError({ documentId, sequence });
  const version = replays.version({ log, documentName: documentId, mark });
  return { kind: ProjectionRequestKind.Version, documentId, sequence, serverTime: mark.serverTime, state: Y.encodeStateAsUpdate(version), text: readMainStoryText(version) };
}

function blocksReply(documentId: string): BlocksReply {
  const cursor = readModel.cursor(documentId);
  if (cursor === null) return { kind: ProjectionRequestKind.Blocks, documentId, sequence: 0, blocks: [] };
  return { kind: ProjectionRequestKind.Blocks, documentId, sequence: cursor, blocks: readMainStoryBlocks(materialize({ log, documentName: documentId, untilSequence: cursor })) };
}
```
and the message switch gets an import lane: `Stop` chains `stopWorker` on `queue`; `Import` chains its answer on a separate `importQueue`; `Forget` chains on `Promise.all([queue, importQueue])`, so a deleted document's import cannot land after its rows are gone; every other request chains on `queue`. Each chained step is `async () => port.postMessage(await answer(request))`.
`answer`'s failure reply carries `requestKind: request.kind` and `sequence: request.kind === ProjectionRequestKind.Version ? request.sequence : null`. Scheduler: `private readonly waiting = new Map<string, { request: ProjectionRequest; waiters: { resolve: (reply: VersionReply | BlocksReply) => void; reject: (error: Error) => void }[] }>()` keyed `version:<documentId>@<sequence>` or `blocks:<documentId>`; `version` and `blocks` reject with `ProjectionDegradedError` when `degraded`, else add a waiter and post only for the first; `settleDone` resolves the key's waiters for `Version`/`Blocks` replies; `settleFailure` branches on `requestKind` first: a `Version` or `Blocks` failure rejects that key's waiters with `new Error(message)` and returns, never touching `inFlight`, `rerun` or the once-per-document failure log; every other kind keeps the slice 2 path; `restart` re-posts every waiting request; `degrade` rejects every waiter. `rebuild` adds the document to `rebuilding`, awaits `forget`, posts `Import` for `filePath` and `schedule`s it; the `Project` reply removes it from `rebuilding`. `server.ts` calls `findDocumentsWithoutMarks(readModelSqlite).forEach((documentId) => void scheduler.rebuild({ documentId, filePath: storage.pathOf(documentId) }))` after the scheduler starts. `stopWorker` is unchanged: `Stop` chains on `queue` only, so a hanging import never blocks shutdown, and `process.exit(0)` ends it after the SDK client is disposed.
- [ ] **Step 4: Run, expect pass** — the new tests plus every slice 2 projection, scheduler and collaboration test.
- [ ] **Step 5: Commit** — `feat(server): project on a throttle, compact in the worker and serve versions from it`

---

### Task 7: Paged events and the timeline routes (G2)

**Files:**
- Create: `apps/server/src/history/{resolved-events,timeline-pipeline-cache,timeline-service,timeline-routes}.ts`, `apps/server/src/testing/timeline-client.ts`
- Modify: `apps/server/src/history/history-routes.ts`, `apps/server/src/documents/documents-repository.ts` (`userContacts`), `apps/server/src/http/app.ts` (`AppServices` gains `scheduler` and `timelinePipelines`; mount), `apps/server/src/server.ts`, `apps/server/src/testing/events-client.ts` (`readEvents` follows `nextAfterSequence` across 500-event pages)
- Test: `apps/server/src/history/{history-routes,timeline-routes}.test.ts`

**Interfaces:**
- Consumes: `ReadModel.readPage`, `ReadModel.readWithCursor`, `ReadModel.marks`, `versionSequenceAt`, timeline library (Task 3), `assignBlocks`, `topicBandId`, `InsightsRepository.topics/status`, `UpdateLog.readBatch`, `ProjectionScheduler.degraded`.
- Produces: `resolveEvents({ services, documentId, stored }): DocumentEditEvent[]`; `/events?afterSequence&limit` → `DocumentEditEvents` with `nextAfterSequence`; `DocumentsRepository.userContacts(userIds): Map<string, { name: string; email: string }>`; `TimelinePipeline = { events: TimelineEvent[]; identities: BandIdentity[]; authors: Record<string, EventAuthor>; hasTopics: boolean; unassignedBlockCount: number }`, `TimelinePipelineCache` with `get({ documentId, key, build })` and a `builds` counter (one entry per document, replaced when the key changes), `pipelineKey({ services, documentId }): string` (read-model cursor, identity count and declared count, topic set `updatedAt`), `readTimelinePipeline({ services, documentId }): TimelinePipeline` (through the cache), `buildDocumentTimeline({ services, documentId, filter, binMs }): DocumentTimeline`, `buildBinEdits({ services, documentId, filter, binStart, binMs }): BinEdits`; routes `GET /:id/timeline` and `GET /:id/timeline/edits`; test helpers `readTimeline({ server, documentId, cookie, query? })`, `twoAuthorsInTwoBlocks()`.

- [ ] **Step 1: Failing tests** — `timeline-routes.test.ts`
```ts
test('filters by author name or email and keeps the x axis', async () => {
  const { server, documentId, owner, editor } = await twoAuthorsInTwoBlocks();
  const all = await readTimeline({ server, documentId, cookie: owner.cookie });
  const byEmail = await readTimeline({ server, documentId, cookie: owner.cookie, query: `author=${encodeURIComponent(editor.email.toUpperCase())}` });
  expect(byEmail.bins.map((bin) => bin.start)).toEqual(all.bins.map((bin) => bin.start));
  expect(Object.keys(byEmail.contributorsByBand).flatMap((bandId) => byEmail.contributorsByBand[bandId]!.map((contributor) => contributor.authorKey))).toEqual([editor.id]);
  await server.stop();
});
test('term=a.b*( narrows without a 500', async () => {
  const { server, documentId, owner } = await twoAuthorsInTwoBlocks();
  const response = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Timeline })}?term=${encodeURIComponent('a.b*(')}`, { headers: { cookie: owner.cookie } });
  expect(response.status).toBe(HttpStatus.Ok);
  expect(((await response.json()) as DocumentTimeline).bands.every((band) => band.volume === 0)).toBe(true);
  await server.stop();
});
```
`twoAuthorsInTwoBlocks` (in `testing/timeline-client.ts`): `documentWithOwner`, an editor member, the owner writes `['Budget:', 'Hiring:']` and commits the bootstrap, the owner writes `'Budget: more money'` in `b0`, the editor writes `'Hiring: a designer'` in `b1`, polls `/events` until both texts are projected. Also, each input → expected:
- `without topics the bands are authors`: no LLM → two bands of kind `author` named after the two users; `topics.state` is `failed` once Task 8 lands, and until then the band kind alone is asserted.
- `with stored topics the bands are topics and unassigned blocks fall into Other`: `insightsRepository.saveTopics` names `b0` only → bands `[Budget (topic), Other (other)]`; Other holds the editor's characters.
- `term filters runs case-insensitively`: `term=DESIGNER` → only the editor's band has volume, and the bins keep the same starts.
- `a fixed binMs outside the ladder is 400`: `binMs=61000` → 400; `binMs=120000` → 200 with `binMs: 120000`.
- `bins carry the version of their end`: every non-padding bin's `versionSequence` is a sequence returned by `readModel.marks(documentId)`.
- `projection status reports a lag`: stop the scheduler's worker with `degraded = true` and append a write → `projection.isDegraded` true and `isBehind` true.
- `edits lists the runs of one bin`: `timeline/edits?binStart=<the edit bin>&binMs=60000` → two runs with inserted `' more money'` and `' a designer'`; an empty bin → `runs: []`; a missing `binStart` → 400.
- `a non-member gets the same 404 on timeline and edits` (body equal to a random uuid's).
- `timeline-routes.test.ts` — `ten thousand events answer in under 150 ms with one pipeline build per cursor`: a separate `ReadModel` handle on the server's `read-model.sqlite` commits 10k single-character events over 600 blocks by one observed client id (`log.observeClientIdentity`) → two `/timeline` calls and one `/timeline/edits` call each take under 150 ms (`performance.now()` around `fetch`), and `timelinePipelines.builds` is 1; one more committed event (cursor moves) → the next call builds once more. `two hours of history choose two-minute bins`: the same handle commits events whose `server_time` spans exactly two hours → `binMs` 120000 and `bins.length <= MAX_BINS + 2`; `?binMs=600000` (test-only, documented in the route and the README) → 600000.
- `history-routes.test.ts` — `events default to a 500-event page`: 1200 committed events and no `limit` → 500 events plus the rest of the 500th event's sequence, and `nextAfterSequence` set. `events page on a sequence boundary`: `?limit=1` returns every event of the first sequence and `nextAfterSequence` equal to it; following `nextAfterSequence` until `null` returns every event once; `?limit=0` and `?limit=501` are 400.
- [ ] **Step 2: Run, expect failure** — FAIL: 404 for `/timeline` (no route) and `nextAfterSequence` undefined. Commit the tests alone: `test(server): pin the timeline, bin edits and paged events`.
- [ ] **Step 3: Implement** — move `authorIdsOf`, `authorsOf` and the mapping of `readDocumentEvents` from `history-routes.ts` into `resolved-events.ts` as `resolveEvents({ services, documentId, stored })`; `/events` parses `limit` with `z.coerce.number().int().min(1).max(EVENTS_PAGE_SIZE).optional()` (400 on failure), uses `EVENTS_PAGE_SIZE` through an explicit `if (parsed.data === undefined)` branch when the parameter is absent, and calls `readModel.readPage`. `timeline-service.ts`
```ts
export class AuthorlessEventError extends Error {
  constructor(eventId: number) {
    super(`Edit event ${eventId} has no author.`);
  }
}

function primaryAuthorKey(event: DocumentEditEvent): string {
  const [first] = event.authors.map(authorKey).sort();
  if (!first) throw new AuthorlessEventError(event.id);
  return first;
}

function bandIdentities({ services, documentId, events }: { services: AppServices; documentId: string; events: DocumentEditEvent[] }): { identities: BandIdentity[]; bandOf: (event: DocumentEditEvent) => string; hasTopics: boolean } {
  const topics = services.insightsRepository.topics(documentId);
  if (topics.length === 0) {
    const authors = new Map(events.flatMap((event) => event.authors.map((author): [string, EventAuthor] => [authorKey(author), author])));
    return { identities: [...authors].map(([id, author]) => ({ id, kind: TimelineBandKind.Author, name: author.name })), bandOf: primaryAuthorKey, hasTopics: false };
  }
  const assignment = assignBlocks(topics);
  const identities = [...topics.map((topic) => ({ id: topic.id, kind: TimelineBandKind.Topic, name: topic.name })), { id: OTHER_BAND_ID, kind: TimelineBandKind.Other, name: OTHER_BAND_NAME }];
  return { identities, bandOf: (event) => topicBandId({ assignment, blockId: event.blockId }), hasTopics: true };
}

export function buildDocumentTimeline({ services, documentId, filter, binMs }: { services: AppServices; documentId: string; filter: TimelineFilter; binMs: number | null }): DocumentTimeline {
  const pipeline = readTimelinePipeline({ services, documentId });
  const chosenBinMs = binMs === null ? chooseBinMs(spanOf(pipeline.events)) : binMs;
  const allRuns = groupIntoRuns({ events: pipeline.events, binMs: chosenBinMs });
  const matchedRuns = filterRuns({ runs: allRuns, term: filter.term, authorKeys: matchingAuthorKeys({ services, pipeline, author: filter.author }) });
  const marks = services.readModel.marks(documentId);
  const binStarts = pipeline.events.length === 0 ? [] : binStartsCovering({ firstTime: firstTimeOf(pipeline.events), lastTime: lastTimeOf(pipeline.events), binMs: chosenBinMs });
  return {
    binMs: chosenBinMs,
    bins: buildBins({ runs: matchedRuns, binStarts, binMs: chosenBinMs, versionSequenceAt: (time) => versionSequenceAt({ marks, time }) }),
    bands: buildBands({ identities: pipeline.identities, allRuns, matchedRuns }),
    contributorsByBand: contributorsByBand(matchedRuns),
    authors: pipeline.authors,
    topics: topicStatusOf({ services, documentId }),
    projection: projectionStatus({ services, documentId }),
  };
}
```
Imported events always carry their author, so `AuthorlessEventError` marks a real inconsistency. `readTimelinePipeline` asks `services.timelinePipelines.get({ documentId, key: pipelineKey(...), build })`, where `build` reads `readModel.readWithCursor` + `resolveEvents`, maps each event to a `TimelineEvent` with `bandId: bandOf(event)` and `authorKeys: event.authors.map(authorKey)`, and counts `unassignedBlockCount` as the distinct `blockId`s of non-`removed` events whose band is `OTHER_BAND_ID`. `matchingAuthorKeys` returns `null` without a filter, else the keys whose name, or email from one `documents.userContacts` call, contains the filter case-insensitively (literal `includes`). `topicStatusOf` returns the stored status, or `{ state: TopicState.Pending, failure: null, computedAtSequence: null }` when none exists (Task 8 starts the run). `projectionStatus`: `cursor = readModel.cursor(documentId)`; the first update after it (`log.readBatch({ afterSequence: cursor, limit: 1 })`) gives `isBehind` and `lagMs = Date.now() - serverTime`; no cursor and no updates → `{ isBehind: false, lagMs: null }`; `isDegraded: services.scheduler.degraded`. `timeline-routes.ts` parses `term` and `author` with `z.string().trim().max(FILTER_MAX_LENGTH).optional().transform((value) => (value ? value : null))` and `binMs` with `z.coerce.number().int().refine((value) => BIN_LADDER_MS.includes(value)).optional()` (400 on failure), behind `requireDocumentRole(Reader)`. `buildBinEdits` keeps the matched runs whose `binStart` equals the parameter and maps them to `EditRunView`.
- [ ] **Step 4: Run, expect pass** — timeline and history suites; `pnpm typecheck` clean.
- [ ] **Step 5: Commit** — `feat(server): serve the timeline, bin edits and paged events`

---

### Task 8: LLM client, topics, summaries and their routes (G2)

**Files:**
- Create: `apps/server/src/insights/{prompts,insights-worker,topics-service,summaries-service,insights-routes}.ts`, `apps/server/src/testing/language-model.ts`
- Modify: `apps/server/src/server.ts` (insights wiring, boot reset), `apps/server/src/http/app.ts`, `apps/server/src/history/timeline-routes.ts` (trigger), `apps/server/src/testing/timeline-client.ts` (`storyWithBlocks`, `readTopics`)
- Test: `apps/server/src/insights/{topics-service,summaries-service,insights-routes}.test.ts`, `apps/server/src/insights/topics-llm.smoke.test.ts`

**Interfaces:**
- Consumes: `chooseLanguageModel`, `generateStructured`, `LanguageModelChoice` (Task 5), `InsightsRepository`, `ProjectionScheduler.blocks`, `readTimelinePipeline`, `groupIntoRuns`, topic schemas, `normalizeTopics`.
- Produces: `INSIGHTS_JOB_FAILED_MESSAGE`, `escapeXml(text)`; `TOPICS_SYSTEM_PROMPT`, `SUMMARIES_SYSTEM_PROMPT`, `topicsPrompt(blocks)`, `summariesPrompt(topics)`; `InsightsWorker` with `run({ key, job }): boolean`, `isRunning(key)`, `idle(): Promise<void>`; `TopicsService` with `status(documentId)`, `ensure(documentId)`, `refresh({ documentId, userId }): RefreshOutcome`, `onTimelineRead({ documentId, unassignedBlockCount })`; `RefreshOutcome { Started, AlreadyRunning, TooSoon }`; `SummariesService` with `read(documentId)`, `refreshStale(documentId)`; routes `GET /:id/topics`, `POST /:id/topics/refresh`, `GET /:id/summaries`; `services.insights = { topics, summaries, worker }`; testing `modelAnswering(...answers)`, `failingModel(error)`, `readyModel(model)`.

- [ ] **Step 1: Failing tests** — `testing/language-model.ts`
```ts
const STOP = { unified: 'stop' as const, raw: undefined };
const NO_USAGE = { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } };

export function modelAnswering(...answers: unknown[]): MockLanguageModelV4 {
  return new MockLanguageModelV4({ doGenerate: answers.map((answer) => ({ content: [{ type: 'text', text: typeof answer === 'string' ? answer : JSON.stringify(answer) }], finishReason: STOP, usage: NO_USAGE, warnings: [] })) });
}

export function readyModel(model: LanguageModel): LanguageModelChoice {
  return { availability: LanguageModelAvailability.Ready, model };
}
```
`topics-service.test.ts`
```ts
test('a twelve-topic answer is saved as eight topics and the prompt carries no email', async () => {
  const model = modelAnswering({ topics: Array.from({ length: 12 }, (_, index) => ({ name: `T${index}`, blockIds: [`b${index}`] })) });
  const { server, documentId, owner } = await storyWithBlocks({ languageModel: readyModel(model), texts: Array.from({ length: 12 }, (_, index) => `Paragraph ${index}`) });
  await readTopics({ server, documentId, cookie: owner.cookie });
  await expect.poll(async () => (await readTopics({ server, documentId, cookie: owner.cookie })).status.state).toBe(TopicState.Ready);
  expect((await readTopics({ server, documentId, cookie: owner.cookie })).topics).toHaveLength(MAX_TOPICS);
  expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).not.toContain('@example.com');
  await server.stop();
});
test('unknown block ids are logged once and the topics are saved', async () => {
  const errors = vi.spyOn(console, 'warn');
  const model = modelAnswering({ topics: [{ name: 'Budget', blockIds: ['b0', 'gone-1', 'gone-2'] }] });
  const { server, documentId, owner } = await storyWithBlocks({ languageModel: readyModel(model), texts: ['Budget up'] });
  await readTopics({ server, documentId, cookie: owner.cookie });
  await expect.poll(async () => (await readTopics({ server, documentId, cookie: owner.cookie })).topics.map((topic) => topic.name)).toEqual(['Budget']);
  expect(errors.mock.calls.filter(([line]) => String(line).startsWith(UNKNOWN_TOPIC_BLOCKS_MESSAGE))).toHaveLength(1);
  await server.stop();
});
```
`storyWithBlocks` and `readTopics` live in `testing/timeline-client.ts`: `storyWithBlocks` = `documentWithOwner({ languageModel })`, the owner writes `texts`, commits the bootstrap, edits the last block once, and polls `/events` until projected. Also, each input → expected:
- `topics-service.test.ts` — `a recompute keeps the id of a topic that keeps its blocks`: a first answer `Budget [b0]`, a refresh answering `Costs [b0]` → the same topic id, renamed, and its summary kept. `malformed output fails with the generic message`: `modelAnswering('not json')` → `failed`, `failure` is `TOPICS_FAILED_MESSAGE` (the provider text is logged, never returned). `no LLM fails with the configuration reason`: the default test server → `failed`, `failure` is `LLM_MODEL_MISSING_MESSAGE`; the timeline's bands are `author`. `an empty document is ready with no topics`: blocks all blank → `ready`, `topics: []`. `two concurrent first opens call the model once`: two `GET /topics` at once on a document without topics → both `pending`, then `ready`, and `doGenerateCalls.length` is 1. `refresh without an LLM fails without calling anything`: default test server, `POST /topics/refresh` → 202, then `failed` with `LLM_MODEL_MISSING_MESSAGE`, and a spy on `scheduler.blocks` was never called. `a job whose document is deleted mid-call is logged once`: a model whose answer waits on a promise; `DELETE` the document, then resolve → exactly one `console.error` line starting with `INSIGHTS_JOB_FAILED_MESSAGE`, and a `process.on('unhandledRejection')` spy is never called. `a pending set left by a crash is failed at boot`: `markPending` then `stop()` and restart on the same directory → `failed` with `TOPICS_INTERRUPTED_MESSAGE`. `prompts escape markup and carry no email`: a block `<b>x</b> & y` and an author named `Ana <script>` → the recorded topics and summaries prompts contain `&lt;b&gt;x&lt;/b&gt; &amp; y` and `Ana &lt;script&gt;`, and neither contains `@example.com`. `the key never reaches a log or a response`: `chooseLanguageModel({ model: 'm', apiKey: 'sk-test-secret', baseUrl: <a local server answering 500> })` → after topics, refresh and summaries, no `console.*` call and no response body of those routes contains `sk-test-secret`. `five new unassigned blocks trigger a recompute once`: topics name `b0`; the owner adds `b1`…`b5`; a `/timeline` read → `model.doGenerateCalls` grows by exactly one, and a second read during the run adds none.
- `insights-routes.test.ts` — `refresh is 202 for an editor, 403 for a reader, 404 for a stranger`; `a second refresh by the same user on the same document within the cooldown is 429 with TOPICS_REFRESH_TOO_SOON_MESSAGE`, while the same user on another document gets 202; `a refresh while a run is in flight returns 202 without a second model call` (`modelAnswering` behind a promise the test resolves).
- `summaries-service.test.ts` — `a reader before any topic gets an empty list`: `GET /summaries` as a reader on a fresh document → 200 `{ summaries: [] }` and no model call. `one call summarizes every stale topic`: two topics with edits → one `doGenerateCalls` entry whose prompt holds both topic ids, two stored sentences. `a topic without new edits is not resummarized`: a second `GET /summaries` without edits → no new call. `a new edit inside the minimum interval waits`: an edit right after → no call until `SUMMARY_MIN_INTERVAL_MS` passes (fake `Date` only).
- `topics-llm.smoke.test.ts` — `test.skipIf(!process.env.OPENROUTER_API_KEY)('the real model names the topics of the seed document', …)`: `chooseLanguageModel` from `process.env`, `generateStructured` with `topicsOutputSchema` over 50 seed blocks → parses, at least one topic, every block id known; run only as `scripts/with-env.sh pnpm --filter @superdoc-collab/server exec vitest run src/insights/topics-llm.smoke.test.ts`.
- [ ] **Step 2: Run, expect failure** — FAIL: cannot find `../insights/topics-service` and `/topics` is 404. Commit the tests and `testing/language-model.ts` alone: `test(server): pin topics, summaries and refresh with a mocked model`.
- [ ] **Step 3: Implement** — `prompts.ts` (XML sections, every limit interpolated from a constant, block text escaped with `&lt;`, `&gt;`, `&amp;` and cut at `PROMPT_BLOCK_MAX_CHARACTERS` = 500, at most `PROMPT_MAX_BLOCKS` = 400 non-blank blocks)
```ts
export const TOPICS_SYSTEM_PROMPT = `<role>You name the topics of one document.</role>
<task>Group the blocks into ${MIN_TOPICS} to ${MAX_TOPICS} topics; a short document may have fewer. Give each topic a name of at most ${TOPIC_NAME_MAX_LENGTH} characters and the ids of its blocks.</task>
<rules>
- Use only block ids from the input.
- A block belongs to one topic.
- Names are one to four words in the document's language, without numbers.
</rules>
<examples>
<block id="b1">Budget: the plan costs 10.</block><block id="b2">Hiring: two engineers.</block> → {"topics":[{"name":"Budget","blockIds":["b1"]},{"name":"Hiring","blockIds":["b2"]}]}
</examples>
<output>JSON: {topics: [{name, blockIds}]}</output>`;

export function topicsPrompt(blocks: Block[]): string {
  return `<blocks>\n${blocks.slice(0, PROMPT_MAX_BLOCKS).map((block) => `<block id="${escapeXml(block.blockId)}">${escapeXml(block.text.slice(0, PROMPT_BLOCK_MAX_CHARACTERS))}</block>`).join('\n')}\n</blocks>`;
}
```
`SUMMARIES_SYSTEM_PROMPT` follows the same sections (one sentence of at most `SUMMARY_SENTENCE_MAX_LENGTH` characters per topic id, about what the edits changed, naming people by the names given; output `JSON: {summaries: [{topicId, sentence}]}`), and `summariesPrompt` renders `<topic id="…" name="…">` with one `<edit author="Ana">+inserted −deleted</edit>` per run, newest first, cut at `PROMPT_TOPIC_MAX_CHARACTERS` = 2000. `escapeXml` replaces `&`, `<`, `>` and `"` and is applied to block text, author names, topic names and edit text alike. `insights-worker.ts`: `InsightsWorker` holds `Map<string, Promise<void>>`; `run({ key, job })` returns `false` when the key is running, else stores `job().catch((error) => console.error(\`${INSIGHTS_JOB_FAILED_MESSAGE} ${key}: ${describeError(error)}\`)).finally(() => delete)` and returns `true`, so no job can reject unhandled; `isRunning(key)`; `idle()` awaits every running job. `topics-service.ts`: `compute(documentId)` marks pending, throws `LanguageModelUnavailableError(reason)` without a model, takes `scheduler.blocks(documentId)`, saves `[]` when no block has text, else `generateStructured({ schema: topicsOutputSchema, system: TOPICS_SYSTEM_PROMPT, prompt: topicsPrompt(named) })` → `normalizeTopics` → `matchPreviousTopics({ previous: repository.topics(documentId), next: normalized.topics })` (identity by blocks, never by name) → one `console.warn(\`${UNKNOWN_TOPIC_BLOCKS_MESSAGE} ${documentId}: ${count}\`)` when ids were unknown → `saveTopics`; its `catch` logs one line with `describeError` and stores `TOPICS_FAILED_MESSAGE`, or the unavailable reason for `LanguageModelUnavailableError`. `ensure` computes when `status` is `null`; `onTimelineRead` computes when the state is `ready`, `unassignedBlockCount >= TOPIC_RECOMPUTE_NEW_BLOCKS` and the last run is older than `TOPIC_RECOMPUTE_MIN_INTERVAL_MS` (60 s); `refresh` answers `AlreadyRunning` when `worker.isRunning`, `TooSoon` inside `TOPIC_REFRESH_COOLDOWN_MS` (30 s) for that (user, document) pair, else `Started`. `summaries-service.ts`: `refreshStale` reads the pipeline, groups runs per topic band (Other and authors excluded), keeps topics whose `max(lastSequence)` exceeds their stored `computedAtSequence` (or have no summary), skips inside `SUMMARY_MIN_INTERVAL_MS` (60 s) since the document's last run, then one `generateStructured` with `summariesOutputSchema`; sentences for unknown topic ids are dropped; a failure is logged once per run and old sentences stay. Routes: `GET /:id/topics` (Reader) calls `ensure` then returns `DocumentTopics`; `POST /:id/topics/refresh` (Editor) → 202 `TopicStatus` for `Started` and `AlreadyRunning`, 429 `{ error: TOPICS_REFRESH_TOO_SOON_MESSAGE }` for `TooSoon`; `GET /:id/summaries` (Reader) calls `refreshStale` and returns `read`. `timeline-routes.ts` calls `services.insights.topics.ensure(documentId)` and `onTimelineRead({ documentId, unassignedBlockCount })` after building. `startServer` calls `insightsRepository.failInterrupted(TOPICS_INTERRUPTED_MESSAGE)` before listening; `stop()` awaits `insights.worker.idle()` before the databases close. The schema handed to `Output.object` is `topicsOutputSchema`; if the Step 4 smoke run shows OpenRouter's `json_schema` rejecting `maxItems` or `maxLength`, add `topicsModelSchema` (the same shape without bounds or refinements) for `Output.object` and parse its output with `topicsOutputSchema` right after, and the same for summaries.
- [ ] **Step 4: Run, expect pass** — insights suites; the smoke test reports `skipped` without the key. Then run it once for real: `scripts/with-env.sh pnpm --filter @superdoc-collab/server exec vitest run src/insights/topics-llm.smoke.test.ts`, and record here the topic count, latency and whether the `json_schema` was accepted.
- [ ] **Step 5: Commit** — `feat(server): name topics and summarize them through the AI SDK and OpenRouter`

---

### Task 9: Versions service, routes and per-version collaboration endpoints (G2)

**Files:**
- Create: `apps/server/src/history/{versions-service,versions-routes}.ts`, `apps/server/src/collaboration/{version-rooms,authenticate-member}.ts`
- Modify: `apps/server/src/collaboration/{collaboration-server,attach-collaboration,collaboration-runtime,room-name}.ts` (`room-name.ts` exports `DOCUMENT_ID_PATTERN`), `apps/server/src/http/app.ts`, `apps/server/src/server.ts`, `apps/server/src/testing/{collaboration-client,test-server,timeline-client}.ts`
- Test: `apps/server/src/collaboration/version-rooms.test.ts`, `apps/server/src/history/versions-routes.test.ts`

**Interfaces:**
- Consumes: `clampToMark`, `ReadModel.marks`, `ProjectionScheduler.version`, `ProjectionScheduler.isRebuilding`, `versionCollaborationPath`, `documentIdFromRoomName`, `DOCUMENT_ID_PATTERN`, `LOADING_ORIGIN`, `VERSION_ROOM_IDLE_MS`, `VERSION_ROOMS_LIMIT`, `VERSION_CACHE_SIZE`, `VERSION_CACHE_MAX_BYTES`, `VERSION_FAILURE_TTL_MS`.
- Produces: `authenticateMember({ auth, documents, cookie, documentId }): Promise<{ userId: string; role: DocumentRole }>` (throws `CollaborationAuthenticationError`); `VersionEndpoint = { documentId: string; sequence: number }`, `parseVersionPath(pathname): VersionEndpoint | null`; `VersionRoomPolicy = { idleMs: number; limit: number }`, `DEFAULT_VERSION_ROOM_POLICY = { idleMs: VERSION_ROOM_IDLE_MS, limit: VERSION_ROOMS_LIMIT }`; `VersionRooms({ auth, documents, versions, policy })` with `authorize({ endpoint, request }): Promise<boolean>`, `handle({ endpoint, webSocket, request })`, `size(): number`, `forget(documentId): Promise<void>`, `stop(): Promise<void>`; `attachCollaboration({ httpServer, hocuspocus, versionRooms, path, allowedOrigin })`; `VERSION_MARKS_AROUND = 10`, `RETRY_AFTER_SECONDS = 1`; `LoadedVersion = { sequence; serverTime; state: Uint8Array; text: string }`; `VersionLookupKind { Ready, Pending, Failed }`, `VersionLookup`; `VersionsService({ readModel, scheduler, maxEntries = VERSION_CACHE_SIZE, maxBytes = VERSION_CACHE_MAX_BYTES })` with `resolve({ documentId, sequence }): VersionMarkSummary | null`, `peek({ documentId, sequence }): VersionLookup` (starts a load on a miss; `Failed` while a failure younger than `VERSION_FAILURE_TTL_MS` is cached), `load({ documentId, sequence }): Promise<LoadedVersion>` (resolves to a mark first), `forget(documentId)`; routes `GET /:id/versions?around`, `GET /:id/versions/:sequence`, `GET /:id/versions/:sequence/text`; `services.versions`, `services.versionRooms`; `connectToDocument({ …, path? })`; `startServer({ …, versionRoomPolicy = DEFAULT_VERSION_ROOM_POLICY })` and `startTestServer({ versionRoomPolicy? })`.

- [ ] **Step 1: Failing tests** — `versions-routes.test.ts`
```ts
const MINUTES = 8;
const PROPERTY_SEED = 20261016;
const SAMPLED_SEQUENCES = 20;

test('every version served equals a full replay at its mark', async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 16, 9, 0) });
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: ['Start'] });
  commitBootstrap(client.document);
  await Array.from({ length: MINUTES }).reduce(async (previous, _, minute) => {
    await previous;
    vi.setSystemTime(Date.now() + VERSION_MARK_MS);
    writeStory({ document: client.document, texts: [`Start ${minute}`, minute % 2 === 0 ? `Line ${minute}` : ''] });
    await expect.poll(() => server.services.readModel.marks(documentId).length, { timeout: PROJECTION_TIMEOUT_MS }).toBeGreaterThan(minute + 1);
  }, Promise.resolve());
  const { marks } = await readJson<VersionMarks>({ server, cookie: owner.cookie, path: `${documentApiPath({ documentId, resource: DocumentResource.Versions })}?around=${Number.MAX_SAFE_INTEGER}` });
  const lastSequence = marks.at(-1)!.sequence;
  const random = seededRandom(PROPERTY_SEED);
  const sampled = Array.from({ length: SAMPLED_SEQUENCES }, () => 1 + Math.floor(random() * lastSequence));
  await Promise.all([...marks.map((mark) => mark.sequence), ...sampled].map(async (sequence) => {
    const { sequence: resolved, text } = await readJson<VersionText>({ server, cookie: owner.cookie, path: versionApiPath({ documentId, sequence, resource: VersionResource.Text }) });
    expect(resolved).toBe(clampToMark({ marks: server.services.readModel.marks(documentId), sequence })!.sequence);
    expect(text).toBe(readMainStoryText(replay(server.services.log.read({ documentName: documentId, untilSequence: resolved }))));
  }));
  client.close();
  vi.useRealTimers();
  await server.stop();
});
test('a sequence before the bootstrap resolves to the bootstrap version', async () => {
  const { server, documentId, owner, bootstrapText } = await editedAfterBootstrap();
  const version = await pollVersion({ server, cookie: owner.cookie, documentId, sequence: 1 });
  expect(version.sequence).toBe(server.services.readModel.marks(documentId).find((mark) => mark.isBootstrap)!.sequence);
  const viewer = await connectToDocument({ server, cookie: owner.cookie, documentId, path: version.collaborationPath });
  expect(readMainStoryText(viewer.document)).toBe(bootstrapText);
  viewer.close();
  await server.stop();
});
```
`version-rooms.test.ts` — `two versions of one document load side by side`: `editedAfterBootstrap()`, then providers on `versionCollaborationPath` of the first and the last mark at once → their texts are the bootstrap text and the edited text, and `versionRooms.size()` is 2.
Helpers (`testing/timeline-client.ts`): `seededRandom(seed)` (a mulberry32 generator, so a failing sample replays exactly), `readJson`, `editedAfterBootstrap` (bootstrap `['Original']`, then `'Original edited'` projected; returns both texts), `pollVersion` (polls `GET /versions/:sequence` while 202, asserting `Retry-After` is `'1'`, returns the 200 body). Also, each input → expected:
- `version-rooms.test.ts` — `a refused socket never creates an instance`: a stranger, a member on a sequence that is not a mark, and a socket without a cookie → each refused, and `versionRooms.size()` stays 0. `an instance nobody joins is destroyed`: `authorize` passes but the provider names another document's room → refused in `onAuthenticate`, and `size()` polls back to 0 after `idleMs` (the idle timer starts at creation). `a version endpoint never writes the log, the identities or the room mode`: the owner connects on `collaborationPath`, inserts text and sets awareness `userId` → `log.readBatch` length, `log.clientIdentities(documentId).size`, `version_marks` count and `GET /documents/:id` `roomMode` unchanged after the provider reports synced twice; the viewer's local text differs from the server's (readOnly dropped it). `an idle version instance is destroyed`: `startTestServer({ versionRoomPolicy: { idleMs: 200, limit: 32 } })`, connect then close → `versionRooms.size()` polls to 0. `the limit evicts the least recently used instance`: `limit: 2`, three versions opened in order → `size()` 2 and the first viewer's provider receives a close. `parseVersionPath` accepts `/collaboration/versions/<uuid>/42` and refuses `…/0`, `…/-1`, `…/1.5`, `…/42/x`, `…/abc`, a non-uuid id; an upgrade on a refused path is destroyed like any unknown path. `a room name other than the document's own is refused`: a provider on the version endpoint of document A naming the room of document B → `CollaborationRefusedError`.
- `versions-routes.test.ts` — `versions routes and version endpoints refuse a non-member like a missing document`: a stranger → 404 with the random-uuid body on `?around`, `/:sequence` and `/:sequence/text`; `connectToDocument` on the version endpoint rejects with `CollaborationRefusedError`. `a reader may open a version`: reader member → 200 after polling and the viewer syncs. `an unprojected document has no versions`: fresh document → `GET /versions/1` is 409 `{ error: VERSION_NOT_READY_ERROR }`; `/versions/abc` is 400. `a rebuilding document answers 202`: with `scheduler.isRebuilding` true and no marks → 202 with `Retry-After`. `a failed load is cached and answered with 503`: `vi.spyOn(server.services.scheduler, 'version').mockRejectedValue(new Error('boom'))` → the first `GET` is 202, polling reaches 503 `{ error: VERSION_FAILED_ERROR }` with one logged line, further polls stay 503 without calling the worker again, and after `VERSION_FAILURE_TTL_MS` (fake `Date`) a `GET` is 202 again. `the cache stays under its byte budget`: `VersionsService` built with a 1 KB budget and versions of about 600 bytes → at most one entry is kept. `deleting the document closes its version instances`: a connected viewer's provider receives a close after `DELETE` and `size()` is 0.
- [ ] **Step 2: Run, expect failure** — FAIL: cannot find `./version-rooms`, and `/versions` is 404. Commit the tests alone: `test(server): pin exact versions and per-version read-only endpoints`.
- [ ] **Step 3: Implement** — `authenticate-member.ts` takes the session-and-membership half of `onAuthenticate` out of `collaboration-server.ts`, which now calls it:
```ts
export async function authenticateMember({ auth, documents, cookie, documentId }: { auth: Auth; documents: DocumentsRepository; cookie: string | undefined; documentId: string }): Promise<{ userId: string; role: DocumentRole }> {
  if (!cookie) throw new CollaborationAuthenticationError();
  const user = await readSession({ auth, headers: new Headers({ cookie }) });
  if (!user) throw new CollaborationAuthenticationError();
  const role = documents.findRole({ documentId, userId: user.id });
  if (!role) throw new CollaborationAuthenticationError();
  return { userId: user.id, role };
}
```
`version-rooms.ts`
```ts
const SEQUENCE_PATTERN = /^[1-9]\d{0,15}$/;
const VERSION_PATH_PREFIX = `${ApiPath.Collaboration}/versions/`;
export const DEFAULT_VERSION_ROOM_POLICY: VersionRoomPolicy = { idleMs: VERSION_ROOM_IDLE_MS, limit: VERSION_ROOMS_LIMIT };

export type VersionEndpoint = { documentId: string; sequence: number };
export type VersionRoomPolicy = { idleMs: number; limit: number };
type VersionRoom = { hocuspocus: Hocuspocus; idleTimer: NodeJS.Timeout | null };

export function parseVersionPath(pathname: string): VersionEndpoint | null {
  if (!pathname.startsWith(VERSION_PATH_PREFIX)) return null;
  const [documentId, sequenceText, ...rest] = pathname.slice(VERSION_PATH_PREFIX.length).split('/');
  const isVersionPath = rest.length === 0 && documentId !== undefined && DOCUMENT_ID_PATTERN.test(documentId) && sequenceText !== undefined && SEQUENCE_PATTERN.test(sequenceText);
  if (!isVersionPath) return null;
  return { documentId, sequence: Number(sequenceText) };
}

export class VersionRooms {
  private readonly rooms = new Map<string, VersionRoom>();
  private readonly auth: Auth;
  private readonly documents: DocumentsRepository;
  private readonly versions: VersionsService;
  private readonly policy: VersionRoomPolicy;

  constructor({ auth, documents, versions, policy }: { auth: Auth; documents: DocumentsRepository; versions: VersionsService; policy: VersionRoomPolicy }) {
    this.auth = auth;
    this.documents = documents;
    this.versions = versions;
    this.policy = policy;
  }

  async authorize({ endpoint, request }: { endpoint: VersionEndpoint; request: IncomingMessage }): Promise<boolean> {
    try {
      await authenticateMember({ auth: this.auth, documents: this.documents, cookie: request.headers.cookie, documentId: endpoint.documentId });
    } catch {
      return false;
    }
    const mark = this.versions.resolve(endpoint);
    return mark !== null && mark.sequence === endpoint.sequence;
  }

  handle({ endpoint, webSocket, request }: { endpoint: VersionEndpoint; webSocket: WebSocket; request: IncomingMessage }): void {
    this.roomFor(endpoint).hocuspocus.handleConnection(webSocket, request);
  }

  private roomFor(endpoint: VersionEndpoint): VersionRoom {
    const key = `${endpoint.documentId}/${endpoint.sequence}`;
    const existing = this.rooms.get(key);
    const room = existing ? existing : this.create({ key, endpoint });
    this.rooms.delete(key);
    this.rooms.set(key, room);
    [...this.rooms.keys()].slice(0, Math.max(0, this.rooms.size - this.policy.limit)).forEach((evicted) => void this.destroy(evicted));
    return room;
  }

  private create({ key, endpoint }: { key: string; endpoint: VersionEndpoint }): VersionRoom {
    const { auth, documents, versions } = this;
    const hocuspocus = new Hocuspocus({
      quiet: true,
      timeout: COLLABORATION_SOCKET_TIMEOUT_MS,
      async onAuthenticate({ requestHeaders, documentName, connection }) {
        const { userId } = await authenticateMember({ auth, documents, cookie: requestHeaders.cookie, documentId: endpoint.documentId });
        if (documentIdFromRoomName(documentName) !== endpoint.documentId) throw new CollaborationAuthenticationError();
        connection.readOnly = true;
        return { userId, documentId: endpoint.documentId };
      },
      async onLoadDocument({ document }) {
        Y.applyUpdate(document, (await versions.load(endpoint)).state, LOADING_ORIGIN);
      },
      connected: async () => this.cancelIdle(key),
      afterUnloadDocument: async () => this.scheduleIdle(key),
    });
    return { hocuspocus, idleTimer: setTimeout(() => void this.destroy(key), this.policy.idleMs) };
  }

}
```
`DOCUMENT_ID_PATTERN` is imported from `room-name.ts`. The other members: `size()` returns `rooms.size`; `scheduleIdle(key)` stores a `setTimeout(() => void this.destroy(key), policy.idleMs)` on the room and `cancelIdle(key)` clears it (the `connected` hook runs only after `onAuthenticate` succeeded, so a refused provider leaves the creation timer running); `destroy(key)` removes the entry, clears its timer and awaits `hocuspocus.destroy()`; `forget(documentId)` destroys every key starting with `<documentId>/`; `stop()` destroys all. No `onChange`, `onStoreDocument` or `onAwarenessUpdate` is registered, so nothing a viewer sends can reach the log or the identities. `COLLABORATION_SOCKET_TIMEOUT_MS` is exported from `collaboration-server.ts`. `attach-collaboration.ts`: after the origin check, `const endpoint = parseVersionPath(pathname)`; the upgrade is destroyed when `pathname !== path && !endpoint`; for a version path the upgrade handler first awaits `versionRooms.authorize({ endpoint, request })` and destroys the socket when it is `false`, so a refused client never creates an instance and no frame can arrive before the 101 response; then, inside `handleUpgrade`, `if (endpoint) return versionRooms.handle({ endpoint, webSocket, request });` before the main `hocuspocus.handleConnection`. `versions-service.ts`: `resolve` is `clampToMark({ marks: readModel.marks(documentId), sequence })`; `load` resolves first (throwing `VersionNotReadyError` without marks), then single-flights per `documentId/sequence` through `scheduler.version` and stores `{ sequence, serverTime, state, text }` in a `Map` re-inserted on every hit and trimmed, oldest first, until it holds at most `VERSION_CACHE_SIZE` entries and `VERSION_CACHE_MAX_BYTES` of `state` (both constructor options with those defaults); a rejected load stores `failedAt` per key; `peek` returns `{ kind: Ready, version }` from the cache, `{ kind: Failed }` while `Date.now() - failedAt < VERSION_FAILURE_TTL_MS`, else starts `load` (its `.catch` logs one line and records the failure) and returns `{ kind: Pending }`; `forget` drops the document's keys. `versions-routes.ts` (Reader): `/:sequence` parses `/^\d+$/` (400), resolves (without marks: 202 with `Retry-After` while `scheduler.isRebuilding(documentId)`, else 409 `VERSION_NOT_READY_ERROR`), answers 503 `{ error: VERSION_FAILED_ERROR }` for `Failed`, 200 `{ sequence, serverTime, collaborationPath: versionCollaborationPath({ documentId, sequence }) }` on a cache hit, else 202 with header `Retry-After: RETRY_AFTER_SECONDS` and `{ sequence }`; `/:sequence/text` awaits `load`; `?around=N` returns up to `VERSION_MARKS_AROUND` marks on each side of N. `collaboration-runtime.ts`: `forget` also awaits `versionRooms.forget(documentId)` and calls `versions.forget`. `server.ts` builds `VersionsService` after the scheduler and `VersionRooms` after `auth`, passes `versionRooms` to `attachCollaboration`, and `stop()` awaits `versionRooms.stop()` before `hocuspocus.destroy()`. `testing/collaboration-client.ts`: `connectToDocument` gains `path = ApiPath.Collaboration` and builds the socket URL from it.
- [ ] **Step 4: Run, expect pass** — versions and version-room suites, every collaboration suite.
- [ ] **Step 5: Commit** — `feat(server): serve exact versions on per-version read-only endpoints`

---

### Task 10: Timeline data hooks and URL state (G3)

**Files:**
- Create: `apps/web/src/features/timeline/{timeline-api,timeline-copy,use-timeline-search,use-timeline,use-topics,use-summaries}.ts`
- Test: `apps/web/src/features/timeline/{timeline-api,use-timeline-search}.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts, `apiGet`, `apiSend`, `ApiRequestError`, `DocumentUnavailableError`, `DOCUMENTS_QUERY_KEY`.
- Produces: `TIMELINE_POLL_MS = 3000`; query keys `timelineQueryKey({ documentId, filter })`, `summariesQueryKey(documentId)`, `topicsQueryKey(documentId)`, `binEditsQueryKey({ documentId, binStart, binMs, filter })`, `versionQueryKey({ documentId, sequence })`; `fetchTimeline({ documentId, filter })`, `fetchSummaries(documentId)`, `refreshTopics(documentId): Promise<TopicStatus>`, `fetchBinEdits({ documentId, binStart, binMs, filter })`, `VersionLoadKind { Ready, Pending, Failed }`, `VersionLoad`, `fetchVersion({ documentId, sequence }): Promise<VersionLoad>`; `TimelineSearch = { filter: TimelineFilter; at: number | null; topic: string | null }` (`at` is the selected bin's start in ms), `useTimelineSearch(): { search: TimelineSearch; update({ changes, replace }) }`, `parseFilterInput(value): { kind: TimelineFilterKind; value: string } | null`; `useTimeline({ documentId, filter, isOpen })`, `useRefreshTopics(documentId)`, `useSummaries({ documentId, isOpen })`; copy constants in `timeline-copy.ts`.

- [x] **Step 1: Failing tests** — `use-timeline-search.test.ts`
```ts
test('reads the filter, the moment and the topic from the URL and ignores a malformed at', () => {
  const { result } = renderHookWithRouter(() => useTimelineSearch(), { route: `${documentPagePath(DOCUMENT_ID)}?term=budget&author=ana&at=1792165200000&topic=t1` });
  expect(result.current.search).toEqual({ filter: { term: 'budget', author: 'ana' }, at: 1792165200000, topic: 't1' });
  const malformed = renderHookWithRouter(() => useTimelineSearch(), { route: `${documentPagePath(DOCUMENT_ID)}?at=4x2&term=` });
  expect(malformed.result.current.search).toEqual({ filter: { term: null, author: null }, at: null, topic: null });
});
test('an @ prefix filters by person and anything else by text', () => {
  expect(parseFilterInput('@ Ana ')).toEqual({ kind: TimelineFilterKind.Author, value: 'Ana' });
  expect(parseFilterInput('a.b*(')).toEqual({ kind: TimelineFilterKind.Term, value: 'a.b*(' });
  expect([parseFilterInput('   '), parseFilterInput('@')]).toEqual([null, null]);
});
```
`renderHookWithRouter` is added to `src/test/render-with-providers.tsx` (a `renderHook` wrapped in the same memory router and query client). Also, each input → expected (`timeline-api.test.ts`, `fetch` spied):
- `fetchTimeline` with `{ term: 'a b', author: null }` requests `/api/documents/doc-1/timeline?term=a+b`; a 404 throws `DocumentUnavailableError`.
- `fetchVersion` → 202 with `Retry-After: 2` gives `{ kind: VersionLoadKind.Pending, retryAfterMs: 2000 }`; 200 gives `{ kind: VersionLoadKind.Ready, version }`; 503 gives `{ kind: VersionLoadKind.Failed }`; 404 throws `DocumentUnavailableError`.
- `refreshTopics` → 429 throws `ApiRequestError` with `TOPICS_REFRESH_TOO_SOON_MESSAGE`; 202 returns the status.
- [x] **Step 2: Run, expect failure** — `pnpm --filter @superdoc-collab/web test:unit` → FAIL: cannot find `./use-timeline-search`. Commit the tests alone: `test(web): pin the timeline URL state and API client`.
- [x] **Step 3: Implement** — `use-timeline-search.ts`
```ts
const AUTHOR_PREFIX = '@';

export function parseFilterInput(value: string): { kind: TimelineFilterKind; value: string } | null {
  const trimmed = value.trim();
  const isAuthor = trimmed.startsWith(AUTHOR_PREFIX);
  const content = (isAuthor ? trimmed.slice(AUTHOR_PREFIX.length) : trimmed).trim().slice(0, FILTER_MAX_LENGTH);
  if (!content) return null;
  return { kind: isAuthor ? TimelineFilterKind.Author : TimelineFilterKind.Term, value: content };
}
```
`useTimelineSearch` reads `useSearchParams()`: `term`, `author` and `topic` through `presentOrNull` (`''` → `null`), `at` through `readBinStart` (`/^\d+$/` or `null`); `update({ changes, replace })` copies the current params, deletes each key whose value is `null` (early return inside the `forEach`), sets the others, and calls `setParams(next, { replace })`.
`use-timeline.ts`: `useQuery({ queryKey: timelineQueryKey(...), queryFn, enabled: isOpen, refetchInterval: TIMELINE_POLL_MS, placeholderData: keepPreviousData, retry: false })`; `useSummaries` polls the same interval while open; `useRefreshTopics` is a `useMutation(refreshTopics)` whose `onSuccess` runs `queryClient.invalidateQueries` for `timelineQueryKey` (prefix `[...DOCUMENTS_QUERY_KEY, documentId, DocumentResource.Timeline]`) and `topicsQueryKey`. Every visible string lives in `timeline-copy.ts` (`TIMELINE_HEADING`, `REFRESH_TOPICS_LABEL`, `RETRY_TOPICS_LABEL`, `FILTER_LABEL`, `FILTER_PLACEHOLDER` = `'Filter by text or @person'`, `CLEAR_FILTERS_LABEL`, `REMOVE_FILTER_LABEL`, `TOP_EDITS_LABEL`, `NO_EDITS_YET_MESSAGE`, `NO_EDITS_IN_BIN_MESSAGE`, `STREAMGRAPH_TITLE`, `BACK_TO_LIVE_LABEL`, `LOADING_VERSION_MESSAGE`, `VERSION_FAILED_MESSAGE`, `RESIZE_PANEL_LABEL`).
- [x] **Step 4: Run, expect pass.**
- [x] **Step 5: Commit** — `feat(web): add the timeline data hooks and URL state`

---

_Done — evidence: commits 8ef7165 (tests), f79936b; task review approved (Retry-After clamp folded into the next web commit)_

### Task 11: Streamgraph (G3)

**Files:**
- Create: `apps/web/src/features/timeline/{streamgraph-layout.ts,streamgraph.tsx,band-label.tsx,timeline-tooltip.tsx}`
- Modify: `apps/web/src/styles/globals.css` (topic tokens)
- Test: `apps/web/src/features/timeline/{streamgraph-layout.test.ts,streamgraph.test.tsx}`

**Interfaces:**
- Consumes: `toStackRows` from `@superdoc-collab/history/timeline`, `DocumentTimeline`, `TimelineBandKind`.
- Produces: `CHART_HEIGHT = 240`, `MIN_LABEL_HEIGHT = 16`, `BandShape = { band; path; saturation; label: { x; y } | null }`, `layoutStreamgraph({ timeline, width }): { shapes: BandShape[]; binX(index): number; binAt(x): number }`, `saturationOf({ volume, maxVolume })`; `Streamgraph({ timeline, width, selectedIndex, highlightedBandId, onSelectIndex, onClearSelection })`.

- [x] **Step 1: Failing tests** — `streamgraph-layout.test.ts`
```ts
test('one filled bin renders a closed band with its label hidden', () => {
  const timeline = timelineWith({ volumes: [[0], [5], [0]], names: ['Budget'] });
  const [shape] = layoutStreamgraph({ timeline, width: 420 }).shapes;
  expect(shape!.path.startsWith('M')).toBe(true);
  expect(shape!.path.endsWith('Z')).toBe(true);
  expect(shape!.label).toBeNull();
});
test('labels sit inside thick bands and never overlap', () => {
  const timeline = timelineWith({ volumes: Array.from({ length: 60 }, (_, index) => [400, 300, index === 30 ? 2 : 1]), names: ['Budget', 'Hiring', 'Tiny'] });
  const shapes = layoutStreamgraph({ timeline, width: 600 }).shapes;
  const labels = shapes.filter((shape) => shape.label !== null);
  expect(labels.map((shape) => shape.band.name).sort()).toEqual(['Budget', 'Hiring']);
  expect(Math.abs(labels[0]!.label!.y - labels[1]!.label!.y)).toBeGreaterThanOrEqual(MIN_LABEL_HEIGHT);
});
```
`timelineWith` (in `src/test/timeline-fixtures.ts`) builds a `DocumentTimeline` with one band per name (`kind: topic`, hues 205 → 25) and one bin per row. Also, each input → expected:
- `saturationOf` maps volume 0 → `SATURATION_MIN`, the max → `SATURATION_MAX`, linear between.
- `streamgraph.test.tsx` — the SVG has `<title>` `STREAMGRAPH_TITLE` and a `<desc>` naming the band count and the time range; every band is a `path` with `tabIndex=0` and `aria-label` `"Budget, 340 characters"`; focusing a band and pressing ArrowRight calls `onSelectIndex(selected + 1)`, ArrowLeft at 0 stays at 0, End selects the last bin, Escape calls `onClearSelection`; hovering a bin shows the tooltip with the bin's time range, band name, `+inserted −deleted` and contributor names from `timeline.authors`; a highlighted band keeps full opacity while others get `opacity-40`; the Other band uses class `topic-band-other`, author bands `topic-band`.
- [x] **Step 2: Run, expect failure** — FAIL: cannot find `./streamgraph-layout`. Commit the tests alone: `test(web): pin the streamgraph layout, labels and keyboard`.
- [x] **Step 3: Implement** — `streamgraph-layout.ts`
```ts
export const CHART_HEIGHT = 240;
export const MIN_LABEL_HEIGHT = 16;
const CHART_PADDING = 8;
const LABEL_CHARACTER_WIDTH = 7;
export const SATURATION_MIN = 35;
export const SATURATION_MAX = 85;

export function saturationOf({ volume, maxVolume }: { volume: number; maxVolume: number }): number {
  if (maxVolume === 0) return SATURATION_MIN;
  return Math.round(SATURATION_MIN + ((SATURATION_MAX - SATURATION_MIN) * volume) / maxVolume);
}

export function layoutStreamgraph({ timeline, width }: { timeline: DocumentTimeline; width: number }): StreamgraphLayout {
  const bandIds = timeline.bands.map((band) => band.id);
  const series = stack<StackRow, string>().keys(bandIds).value((row, key) => cellValue({ row, key })).order(stackOrderInsideOut).offset(stackOffsetWiggle)(toStackRows({ bins: timeline.bins, bandIds }));
  const x = scaleLinear().domain([0, Math.max(1, timeline.bins.length - 1)]).range([0, width]);
  const lowest = Math.min(0, ...series.flatMap((points) => points.map((point) => point[0])));
  const highest = Math.max(lowest + 1, ...series.flatMap((points) => points.map((point) => point[1])));
  const y = scaleLinear().domain([lowest, highest]).range([CHART_HEIGHT - CHART_PADDING, CHART_PADDING]);
  const shapeOf = area<SeriesPoint<StackRow>>().x((_, index) => x(index)).y0((point) => y(point[0])).y1((point) => y(point[1])).curve(curveBasis);
  const maxVolume = Math.max(0, ...timeline.bands.map((band) => band.volume));
  const placed: LabelBox[] = [];
  const shapes = [...series].sort((left, right) => bandOf({ timeline, id: right.key }).volume - bandOf({ timeline, id: left.key }).volume).map((points) => {
    const band = bandOf({ timeline, id: points.key });
    const label = placeLabel({ band, points, x, y, placed });
    return { band, path: `${shapeOf(points)}Z`, saturation: saturationOf({ volume: band.volume, maxVolume }), label };
  });
  return { shapes, binX: (index) => x(index), binAt: (position) => Math.min(timeline.bins.length - 1, Math.max(0, Math.round(x.invert(position)))) };
}
```
`cellValue` returns `row.values[key]` and throws `MissingStackValueError` when it is `undefined` (`toStackRows` writes every band id for every row, so absence is a bug, never a zero). `placeLabel` finds the bin of maximum pixel thickness `y(point[0]) - y(point[1])`; it places nothing when that thickness is below `MIN_LABEL_HEIGHT`, when any bin within half the label width (`name.length * LABEL_CHARACTER_WIDTH / 2`) on either side is thinner than `MIN_LABEL_HEIGHT`, or when the label box intersects one in `placed`; otherwise it pushes the box and returns the midpoint. `streamgraph.tsx` renders `<svg width={width} height={CHART_HEIGHT} aria-labelledby aria-describedby>` with `<title>`/`<desc>`, one focusable `path` per shape (`className` `topic-band` or `topic-band-other`, `style={{ '--topic-hue': String(band.hue), '--topic-saturation': `${shape.saturation}%` } as CSSProperties}`), `BandLabel` text for placed labels, a vertical rule at `binX(selectedIndex)`, pointer handlers on the `svg` (press or drag → `onSelectIndex(binAt(offsetX))`, move without buttons → hovered bin for `TimelineTooltip`). `globals.css` adds to `:root` `--topic-lightness: 62%; --topic-other: oklch(0.87 0 0);`, to `.dark` `--topic-lightness: 48%; --topic-other: oklch(0.4 0 0);`, and `@layer components { .topic-band { fill: hsl(var(--topic-hue) var(--topic-saturation) var(--topic-lightness)); } .topic-band-other { fill: var(--topic-other); } .topic-swatch { background-color: hsl(var(--topic-hue) var(--topic-saturation) var(--topic-lightness)); } .topic-swatch-other { background-color: var(--topic-other); } }`. Avatars stay neutral (`bg-muted` initials), so topics and authors never share a palette. Layout and label placement run on every data change (spike §4: 0.7–0.9 ms median at 120 × 8).
- [x] **Step 4: Run, expect pass.**
- [x] **Step 5: Commit** — `feat(web): draw the topic streamgraph with labels and keyboard access`

---

_Done — evidence: commits d7b64d8 (tests), e26232a; task review approved_

### Task 12: Timeline panel: filter, top edits, notices, bin edits, resizing (G3)

**Files:**
- Create: `apps/web/src/features/timeline/{timeline-panel,filter-box,top-edits,topic-chip,contributor-avatars,timeline-notices,bin-edits}.tsx`, `apps/web/src/features/timeline/{use-panel-width,use-element-width}.ts`, `apps/web/src/lib/initials.ts`
- Modify: `apps/web/src/features/editor/{document-page,members}.tsx`, `apps/web/src/test-setup.ts` (`ResizeObserver` test double); delete `apps/web/src/features/editor/timeline-panel-placeholder.tsx`
- Test: `apps/web/src/features/timeline/{timeline-panel,filter-box,top-edits}.test.tsx`

**Interfaces:**
- Consumes: Tasks 10–11.
- Produces: `TimelinePanel({ documentId, role, onTravel })` with `onTravel(binStart: number)`; `MIN_PANEL_WIDTH = 420`, `DEFAULT_PANEL_SHARE = 0.4`, `PANEL_RESIZE_STEP = 24`, `MIN_EDITOR_WIDTH = 360`; `usePanelWidth()`, `useElementWidth(ref)`; `initialsOf(name)` (moved from `members.tsx`).

- [ ] **Step 1: Failing tests** — `filter-box.test.tsx` — `Enter on @bruno filters by person and the chip removes it`: type `@bruno{Enter}` in the box labelled `FILTER_LABEL` → `router.state.location.search` is `?author=bruno`; click the button named `` `${REMOVE_FILTER_LABEL} bruno` `` → the search is empty.
Also, each input → expected:
- `filter-box.test.tsx` — `budget{Enter}` then `@ana{Enter}` → `?term=budget&author=ana`, two chips; Clear filters → empty search; a 300-character entry is cut to `FILTER_MAX_LENGTH`.
- `top-edits.test.tsx` — bands sorted by volume; each row shows the topic chip (class `topic-swatch` with the band's hue), at most three avatars ordered by contribution, `+12 words −3 words`, and the band's sentence from `TopicSummaries`; bands with volume 0 are not listed; clicking a chip sets `topic=<id>` and clicking again removes it.
- `timeline-panel.test.tsx` (fetch mocked) — `failed` topics show `TOPICS_UNAVAILABLE_MESSAGE` with the failure text and `RETRY_TOPICS_LABEL` for an editor, no retry for a reader; Retry POSTs `topicsRefreshApiPath` once and invalidates the timeline query (a second timeline request follows); `pending` without topic bands shows `TOPICS_PENDING_MESSAGE`; `projection.isBehind` with `lagMs` 12000 shows `HISTORY_CATCHING_UP_MESSAGE` and `12 s behind`, while 2000 shows nothing (`PROJECTION_LAG_NOTICE_MS` = 10000); an active filter with every volume 0 shows `NO_MATCHING_EDITS_MESSAGE` and Clear filters; no bins shows `NO_EDITS_YET_MESSAGE`; a selected bin lists its runs from `timeline/edits` (author names, topic chip, `+"…"` and `−"…"` snippets cut at `SNIPPET_MAX_CHARACTERS` = 120) and an empty bin shows `NO_EDITS_IN_BIN_MESSAGE`; collapsing the panel stops the polling (no timeline request after `TIMELINE_POLL_MS` with fake timers); the resize separator has `role="separator"`, `aria-valuenow`, and ArrowLeft widens by `PANEL_RESIZE_STEP` without going below `MIN_PANEL_WIDTH`.
- [ ] **Step 2: Run, expect failure** — FAIL: cannot find `./filter-box`, `./timeline-panel`. Commit the tests alone: `test(web): pin the timeline panel, filter box and top edits`.
- [ ] **Step 3: Implement** — `use-panel-width.ts`: `MIN_PANEL_WIDTH = 420`, `DEFAULT_PANEL_SHARE = 0.4`, `PANEL_RESIZE_STEP = 24`, `MIN_EDITOR_WIDTH = 360`; `clampWidth(width)` keeps the width between `MIN_PANEL_WIDTH` and `window.innerWidth - MIN_EDITOR_WIDTH`; `usePanelWidth()` starts at `clampWidth(innerWidth * DEFAULT_PANEL_SHARE)` and returns `{ width, resizeTo(next), resizeBy(delta) }`, both clamped.
`timeline-panel.tsx`: an `aside` that is `w-full border-t lg:w-[var(--panel-width)] lg:border-t-0 lg:border-l` with `style={{ '--panel-width': `${width}px` }}`; a `div role="separator" aria-orientation="vertical" aria-label={RESIZE_PANEL_LABEL}` (only `lg:block`) dragged with pointer capture and moved with arrow keys; header with `TIMELINE_HEADING`, Refresh topics for owner and editor, the slice 2 collapse toggle (`TIMELINE_TOGGLE_LABEL`); `TimelineNotices`; `Streamgraph` at `useElementWidth` of its container; `FilterBox`; `BinEdits` when a bin is selected, else `TopEdits`. The selection is local state `selectedTime` (the selected bin's start), so it survives a `binMs` change; the index is the bin containing it; on load with `at` it is the bin containing `at`, so a reload reselects the same bin. Selecting a bin calls `onTravel(bin.start)` when its `versionSequence` is not `null`. `document-page.tsx`: the body row becomes `flex min-h-0 flex-1 flex-col lg:flex-row`, `TimelinePanel` replaces `TimelinePanelPlaceholder` (deleted), with `onTravel` a no-op until Task 13. `members.tsx` imports `initialsOf` from `@/lib/initials`.
- [ ] **Step 4: Run, expect pass** — every web suite, including slice 2's `document-page.test.tsx` (the panel's fetches are mocked there with an empty timeline).
- [ ] **Step 5: Commit** — `feat(web): add the timeline panel with filter, top edits and notices`

---

### Task 13: Time travel: iframe viewer, banner, scrubbing (G3)

Two SuperDoc instances on one page were never verified, so the viewer lives in a same-origin iframe: `/documents/:id/versions/:sequence/view` renders only a read-only SuperDoc on the version's endpoint. Cookies flow because it is same-origin; the parent and the frame talk through `postMessage`, each checking `event.origin === window.location.origin` and the expected `event.source`.

**Files:**
- Create: `apps/web/src/features/editor/{version-banner,version-frame,version-viewer}.tsx`, `apps/web/src/features/editor/{collaboration-config,viewer-messages}.ts`, `apps/web/src/features/versions/version-view-page.tsx`, `apps/web/src/features/timeline/use-time-travel.ts`, `apps/web/src/lib/use-debounced-callback.ts`
- Modify: `apps/web/src/features/editor/{superdoc-editor,document-page}.tsx`, `apps/web/src/features/timeline/timeline-panel.tsx`, `apps/web/src/app/router.tsx` (`AppRoute.VersionView` inside `RequireSession`)
- Test: `apps/web/src/features/editor/time-travel.test.tsx`, `apps/web/src/features/versions/version-view-page.test.tsx`, `apps/web/src/lib/use-debounced-callback.test.ts`

**Interfaces:**
- Consumes: `fetchVersion`, `VersionLoadKind`, `useTimelineSearch`, `useTimeline`, `fetchDocumentFile`, `documentFileQueryKey`, `RoomMode.Join`, `DocumentMode.Viewing`, `versionViewPagePath`, `versionCollaborationPath`, `VERSION_FAILED_MESSAGE`.
- Produces: `HOCUSPOCUS_PROVIDER`, `collaborationUrl(path: string)` (moved from `superdoc-editor.tsx`, now taking the socket path); `ViewerMessageKind { Ready, Failed, Highlight, Clear }`, `ViewerMessage` (`{ kind: Ready }`, `{ kind: Failed }`, `{ kind: Highlight; runs: EditRunView[] }`, `{ kind: Clear }`), `readViewerMessage({ event, expectedSource }): ViewerMessage | null`; `SCRUB_DEBOUNCE_MS = 300`; `useDebouncedCallback({ callback, delayMs })`; `TimeTravel = { state: VersionViewerState; requestedBinStart: number | null; requestedSequence: number | null; shown: VersionSummary | null; isLoading: boolean; hasFailed: boolean; travelTo(binStart: number): void; backToLive(): void }`, `useTimeTravel(documentId)`; `VersionViewer({ documentId, sequence, user, onReady, onFailed })`; `VersionViewPage`; `VersionFrame({ documentId, version, runs })`; `VersionBanner({ timeTravel })`; `VERSION_FRAME_TITLE`.

- [ ] **Step 1: Failing tests** — `time-travel.test.tsx` (`vi.mock('superdoc')` as in slice 2's `document-page.test.tsx`; the timeline is mocked with one bin `{ start: BIN_START, versionSequence: 42 }`)
```tsx
test('an at link opens the version in a same-origin frame and Back to live removes it', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Editor, RoomMode.Join), timeline: timelineWithBin({ start: BIN_START, versionSequence: 42 }), versions: [{ status: HttpStatus.Accepted }, { status: HttpStatus.Ok, body: { sequence: 42, serverTime: Date.UTC(2026, 9, 16, 14, 2), collaborationPath: versionCollaborationPath({ documentId: DOCUMENT_ID, sequence: 42 }) } }] });
  const { router } = renderWithProviders(<DocumentPage />, { route: `${documentPagePath(DOCUMENT_ID)}?at=${BIN_START}` });
  const frame = await screen.findByTitle(VERSION_FRAME_TITLE);
  expect(frame).toHaveAttribute('src', versionViewPagePath({ documentId: DOCUMENT_ID, sequence: 42 }));
  expect(await screen.findByText(/Version at/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: BACK_TO_LIVE_LABEL }));
  expect(router.state.location.search).toBe('');
  expect(screen.queryByTitle(VERSION_FRAME_TITLE)).toBeNull();
  expect(SuperDoc).toHaveBeenCalledTimes(1);
  expect(superDocDestroy).not.toHaveBeenCalled();
  expect(screen.getByTestId('document-editor')).not.toHaveAttribute('inert');
});
test('an inaccessible document never requests a version', async () => {
  const fetchSpy = mockDocumentApi({ openedStatus: HttpStatus.NotFound });
  renderWithProviders(<DocumentPage />, { route: `${documentPagePath(DOCUMENT_ID)}?at=${BIN_START}` });
  expect(await screen.findByText(DOCUMENT_UNAVAILABLE_MESSAGE)).toBeVisible();
  expect(fetchSpy.mock.calls.map(([path]) => String(path)).filter((path) => path.includes(`/${DocumentResource.Versions}/`))).toEqual([]);
  expect(screen.queryByTitle(VERSION_FRAME_TITLE)).toBeNull();
});
```
`version-view-page.test.tsx`
```tsx
test('the frame page opens a read-only SuperDoc on the version endpoint and reports readiness to its parent', async () => {
  const postToParent = vi.spyOn(window.parent, 'postMessage');
  mockBlankDocx();
  renderWithProviders(<VersionViewPage />, { route: versionViewPagePath({ documentId: DOCUMENT_ID, sequence: 42 }) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const config = vi.mocked(SuperDoc).mock.calls[0]![0];
  expect(config.documentMode).toBe(DocumentMode.Viewing);
  expect(config.documents[0].v2Collaboration).toMatchObject({ documentId: DOCUMENT_ID, roomMode: RoomMode.Join, serverUrl: `ws://localhost:3000${versionCollaborationPath({ documentId: DOCUMENT_ID, sequence: 42 })}` });
  config.onCollaborationReady();
  expect(postToParent).toHaveBeenCalledWith({ kind: ViewerMessageKind.Ready }, window.location.origin);
});
```
The jsdom origin of the test setup is `http://localhost:3000`, which the `serverUrl` assertion relies on. Also, each input → expected:
- `time-travel.test.tsx` — `a failed version shows the message and stops polling`: versions answer 503 → the banner shows `VERSION_FAILED_MESSAGE`, no frame, and no further `/versions` request after `Retry-After` elapses (fake timers). `the previous frame stays until the next one is ready`: travel from bin A (sequence 42, frame ready) to bin B (sequence 50) → two frames, B hidden (`aria-hidden`, `invisible`) until a `MessageEvent` `{ kind: Ready }` from B's `contentWindow` with the page origin; then A is removed. `a message from another origin or another window is ignored`: the same `Ready` with origin `http://evil.example`, or from A's window for B → B stays hidden. `the selected bin's runs are sent to the ready frame`: the frame's `contentWindow.postMessage` receives `{ kind: Highlight, runs }` with the bin edits of the selected bin and the page origin. `scrubbing commits one URL change per pause`: three ArrowRight presses on a band within 100 ms → no URL change before `SCRUB_DEBOUNCE_MS`, then exactly one, with `at` equal to the third bin's start; entering viewing pushes a history entry, later scrubs replace it (`router.state.historyAction`). `a reload reselects the same bin`: `?at=<bin start>` → the streamgraph's selected rule sits on that bin and the frame shows its version. `the live editor stays mounted and inert while viewing`: the live SuperDoc is never destroyed; its container has `inert`.
- `version-view-page.test.tsx` — `onException` posts `{ kind: Failed }`; a `{ kind: Highlight, runs }` from `window.parent` with the page origin is handed to the highlighter (Task 14), and one from another origin is ignored.
- `use-debounced-callback.test.ts`: calls within the delay collapse into the last one; unmount cancels a pending call.
- [ ] **Step 2: Run, expect failure** — FAIL: cannot find `./version-frame`, `../versions/version-view-page`, `useTimeTravel`. Commit the tests alone: `test(web): pin the iframe version viewer, time travel and scrubbing`.
- [ ] **Step 3: Implement** — `version-viewer.tsx` (spike §2: same document id, version isolated by endpoint, `roomMode: 'join'`, blank DOCX as `data`)
```tsx
export function VersionViewer({ documentId, sequence, user, onReady, onFailed }: { documentId: string; sequence: number; user: SessionUser; onReady: (superdoc: SuperDoc) => void; onFailed: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: blank } = useQuery({ queryKey: documentFileQueryKey({ documentId, roomMode: RoomMode.Join }), queryFn: () => fetchDocumentFile({ documentId, roomMode: RoomMode.Join }), staleTime: Infinity });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !blank) return;
    const superdoc = new SuperDoc({
      selector: container,
      documentMode: DocumentMode.Viewing,
      documents: [{ id: documentId, type: DOCX_MIME_TYPE, data: blank, v2Collaboration: { providerType: HOCUSPOCUS_PROVIDER, documentId, serverUrl: collaborationUrl(versionCollaborationPath({ documentId, sequence })), roomMode: RoomMode.Join, token: COLLABORATION_TOKEN_PLACEHOLDER } }],
      user: { id: user.id, name: user.name, email: user.email },
      onCollaborationReady: () => onReady(superdoc),
      onException: onFailed,
    });
    return () => superdoc.destroy();
  }, [documentId, sequence, blank, user, onReady, onFailed]);

  return <div ref={containerRef} data-testid="version-viewer" className="h-dvh min-w-0 overflow-auto" />;
}
```
`version-view-page.tsx` reads `documentId` and `sequence` with `useRequiredParam`, the user with `useSession`, renders `VersionViewer`, posts `{ kind: Ready }` or `{ kind: Failed }` to `window.parent` with `window.location.origin` as target, and listens for `Highlight` and `Clear` through `readViewerMessage({ event, expectedSource: window.parent })`. `viewer-messages.ts`: `readViewerMessage` returns `null` unless `event.origin === window.location.origin`, `event.source === expectedSource` and `event.data.kind` is a `ViewerMessageKind`. `version-frame.tsx` keeps a list of frames (`{ version, isReady }`): a new `shown` version mounts a second `iframe` (`title={VERSION_FRAME_TITLE}`, `src={versionViewPagePath(...)}`, `absolute inset-0 border-0`) hidden until its `Ready` message, then drops the older one; it posts `{ kind: Highlight, runs }` to the ready frame whenever `runs` change and `{ kind: Clear }` before it unmounts. `use-time-travel.ts`: `at` from `useTimelineSearch` is a bin start; the hook reads the same timeline query as the panel (`useTimeline({ …, isOpen: at !== null })`), finds the bin containing `at` and takes its `versionSequence`; `useQuery({ queryKey: versionQueryKey(...), queryFn: sequence === null ? skipToken : () => fetchVersion(...), refetchInterval: (query) => (query.state.data?.kind === VersionLoadKind.Pending ? query.state.data.retryAfterMs : false), retry: false })`; `VersionLoadKind.Failed` (503) stops polling and sets `hasFailed`; `shown` is state set when the data is `Ready` and cleared by `backToLive`; `travelTo(binStart)` stores `requestedBinStart` and commits `at` through `useDebouncedCallback({ delayMs: SCRUB_DEBOUNCE_MS })` with `replace: state === VersionViewerState.Viewing`; `backToLive` removes `at` with `replace: false`, so Browser Back from a version returns to live. `version-banner.tsx`: `role="status"`, `data-testid="version-banner"` and `data-sequence={shown.sequence}`, "Version at {time}" from `shown.serverTime` (`Intl.DateTimeFormat` with `timeStyle: 'short'`, plus `dateStyle: 'medium'` when not today), `LOADING_VERSION_MESSAGE` with the requested bin's end while loading, `VERSION_FAILED_MESSAGE` when failed, and a `BACK_TO_LIVE_LABEL` button. `document-page.tsx`: the editor area is `relative flex min-h-0 min-w-0 flex-1 flex-col`; the banner sits above; the live `SuperDocEditor` wrapper gets `inert` while viewing and is never unmounted (`useEditorSetup` captured `roomMode` once and a remount in `create` would fail); `VersionFrame` covers it; `TimelinePanel` receives `onTravel={timeTravel.travelTo}`. `superdoc-editor.tsx` calls `collaborationUrl(ApiPath.Collaboration)` from `collaboration-config.ts`. `fetchVersion` maps 503 to `{ kind: VersionLoadKind.Failed }` (Task 10's enum gains `Failed`).
- [ ] **Step 4: Run, expect pass** — every web suite; `pnpm --filter @superdoc-collab/web build` succeeds.
- [ ] **Step 5: Commit** — `feat(web): open any moment of the timeline in a read-only iframe viewer`

---

### Task 14: Highlight the selected bin's edits in the viewer (G3)

Spike §2b: `doc.comments.create({ target })` paints a range in `viewing` mode, stays local (a fresh viewer sees none, the server gets nothing) and is removed with `comments.delete`; `format.highlight` is refused in `viewing` and is never used. Matching is scoped to each run's block, never the whole document. The bin edits list from Task 12 stays as the degraded path. The highlighter runs inside the frame page, driven by the parent's `Highlight` and `Clear` messages.

**Files:**
- Create: `apps/web/src/features/editor/highlight-edits.ts`
- Modify: `apps/web/src/features/versions/version-view-page.tsx`, `apps/web/src/features/editor/editor-copy.ts` (`HIGHLIGHT_COMMENT_TEXT = 'Edited in this period'`)
- Test: `apps/web/src/features/editor/highlight-edits.test.ts`

**Interfaces:**
- Consumes: `EditRunView`, `ViewerMessageKind`, `VersionViewer`'s `onReady(superdoc)`.
- Produces: `MIN_HIGHLIGHT_CHARACTERS = 3`, `MAX_HIGHLIGHTS = 50`, `TEXT_BLOCK_NODE_TYPES = ['paragraph', 'heading', 'listItem']`, `EditorDocument = NonNullable<SuperDoc['activeEditor']>['doc']`, `HighlightTarget = { blockId: string; pattern: string }`, `highlightTargets(runs): HighlightTarget[]`, `highlightEdits({ document, runs }): Promise<string[]>` (the created comment ids), `clearHighlights({ document, commentIds })`.

- [ ] **Step 1: Failing tests** — first the API shape, pinned against SuperDoc 2.23.0's typings (`dist/document-api/src`) and spike §2b, so a SuperDoc upgrade fails here before it fails in a browser:
```ts
test('the comment and match APIs keep the shape the highlighter relies on', () => {
  expectTypeOf<Parameters<EditorDocument['query']['match']>[0]>().toMatchTypeOf<{ select: { type: 'text'; pattern: string; mode?: 'contains' | 'regex' }; within?: { kind: 'block'; nodeType: 'paragraph' | 'heading' | 'listItem'; nodeId: string } }>();
  expectTypeOf<Parameters<EditorDocument['comments']['create']>[0]>().toMatchTypeOf<{ text: string; target?: unknown }>();
  expectTypeOf<Parameters<EditorDocument['comments']['delete']>[0]>().toEqualTypeOf<{ commentId: string }>();
});
```
Then the behaviour, with a stub document whose `query.match` answers per `(nodeId, nodeType, pattern)` a fixed number of `{ matchKind: 'text', target }` items (an unknown key throws) and whose `comments.create` records its input and answers `{ success: true, id: 'c<n>' }`; `run({ blockId, inserted, deleted })` builds an `EditRunView`. `each inserted run gets one local comment per match inside its own block`: runs `{ b1, ' a' }`, `{ b2, ' a designer' }` twice, `{ b3, 'more money' }` (a heading) and a deletion-only run, with one match for `a designer` in paragraph `b2` and two for `more money` in heading `b3` → ids `['c1', 'c2', 'c3']`, every comment text `HIGHLIGHT_COMMENT_TEXT`, every `query.match` call carrying `within: { kind: 'block', nodeId }` and `mode: 'contains'`, and none without `within`. Also: `highlightTargets` keeps inserted texts of at least `MIN_HIGHLIGHT_CHARACTERS` after trimming, one per (block, text), longest first, never deleted text; at most `MAX_HIGHLIGHTS` comments; `clearHighlights` deletes every id once; in `version-view-page`, a new `Highlight` message clears the previous ids before creating new ones, `Clear` deletes them.
- [ ] **Step 2: Run, expect failure;** FAIL: cannot find `./highlight-edits`. Commit alone: `test(web): pin block-scoped local comment highlights`.
- [ ] **Step 3: Implement** — `highlight-edits.ts`
```ts
export const MIN_HIGHLIGHT_CHARACTERS = 3;
export const MAX_HIGHLIGHTS = 50;
export const TEXT_BLOCK_NODE_TYPES = ['paragraph', 'heading', 'listItem'] as const;
const TEXT_MATCH_KIND = 'text';
const CONTAINS_MODE = 'contains';
const BLOCK_ADDRESS_KIND = 'block';

export type EditorDocument = NonNullable<SuperDoc['activeEditor']>['doc'];
export type HighlightTarget = { blockId: string; pattern: string };

export function highlightTargets(runs: EditRunView[]): HighlightTarget[] {
  const targets = runs.map((run) => ({ blockId: run.blockId, pattern: run.inserted.trim() })).filter((target) => target.pattern.length >= MIN_HIGHLIGHT_CHARACTERS);
  const unique = new Map(targets.map((target) => [`${target.blockId}|${target.pattern}`, target]));
  return [...unique.values()].sort((left, right) => right.pattern.length - left.pattern.length);
}

async function matchInBlock({ document, target }: { document: EditorDocument; target: HighlightTarget }) {
  const outputs = await Promise.all(TEXT_BLOCK_NODE_TYPES.map((nodeType) => document.query.match({ select: { type: 'text', pattern: target.pattern, mode: CONTAINS_MODE }, within: { kind: BLOCK_ADDRESS_KIND, nodeType, nodeId: target.blockId } })));
  return outputs.flatMap((output) => output.items.filter((item) => item.matchKind === TEXT_MATCH_KIND).map((item) => item.target));
}

export async function highlightEdits({ document, runs }: { document: EditorDocument; runs: EditRunView[] }): Promise<string[]> {
  const matched = await Promise.all(highlightTargets(runs).map((target) => matchInBlock({ document, target })));
  return matched.flat().slice(0, MAX_HIGHLIGHTS).flatMap((target) => {
    const receipt = document.comments.create({ text: HIGHLIGHT_COMMENT_TEXT, target });
    if (!receipt.success) return [];
    return [receipt.id];
  });
}

export function clearHighlights({ document, commentIds }: { document: EditorDocument; commentIds: string[] }): void {
  commentIds.forEach((commentId) => document.comments.delete({ commentId }));
}
```
The projection's `blockId` is the room's block id, the same scheme `trackChanges.list` returns as `navigationTarget.blockId` (rules: collaboration); a block of another node type returns no items for that type. `version-view-page.tsx` keeps the created ids in a ref, clears them on every new `Highlight` and on `Clear`. Comment text is the fixed copy, never user data.
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `feat(web): highlight the edits of the selected period in the viewer`

---

### Task 15: End-to-end specs with a fake OpenRouter (G4)

**Files:**
- Create: `e2e/fake-openrouter.ts`, `e2e/timeline.spec.ts`, `e2e/time-travel.spec.ts`, `e2e/timeline.ts` (helpers)
- Modify: `playwright.config.ts`, `e2e/editor.ts` (`readEvents` follows `nextAfterSequence` across pages)

**Interfaces:**
- Consumes: every route and screen above; `uploadSeed`, `shareAndAccept`, `typeInParagraph`, `signedInContext`.
- Produces: `FAKE_OPENROUTER_PORT = 3199`; helpers `bandNamed({ page, name })`, `waitForBands({ page, names })`, `viewerFrame(page)` (`page.frameLocator` of the visible `iframe` titled `VERSION_FRAME_TITLE`), `readViewerText(page)` (joins `.superdoc-text-run` inside that frame), `readLiveText(page)` (the same inside `[data-testid="document-editor"]`), `countViewerHighlights(frame)` (elements carrying SuperDoc's comment highlight class, read once from the built CSS with `grep -o 'comment-highlight[a-z-]*' apps/web/dist/assets/*.css` and kept as a constant), `currentAt(page): number` (the bin start in the URL), `shownVersionSequence(page): number` (the banner's `data-sequence`).

- [ ] **Step 1: Fake provider** — `e2e/fake-openrouter.ts` is self-contained (only `node:http`, erasable TypeScript, run by Node 24 directly): `GET /health` → 200; `POST …/chat/completions` reads only the **user** message's content (string or `[{ text }]`), never the system prompt, whose examples carry block tags too, and answers an OpenAI chat completion `{ id, object: 'chat.completion', created: 0, model, choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(answer) }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }`. With `<topic id="…" name="…">` tags the answer is `{ summaries: [{ topicId, sentence: \`Edits about ${name}.\` }] }`; otherwise it groups `<block id="…">text</block>` by the text before the first `:` (blocks without one go to `General`) and answers `{ topics }`; a prompt containing `FAIL-TOPICS` gets HTTP 500. `playwright.config.ts`: `webServer` becomes an array: the fake (`node e2e/fake-openrouter.ts`, `url: http://127.0.0.1:3199/health`) first, then the app with `LLM_MODEL: 'openai/gpt-6-luna'`, `OPENROUTER_API_KEY: 'e2e-fake-key'`, `OPENROUTER_BASE_URL: 'http://127.0.0.1:3199/api/v1'` added to its env.
- [ ] **Step 2: Specs** — `timeline.spec.ts`
```ts
test('two authors type in two topics and the bands appear', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: ['Budget: the plan costs 10.', 'Hiring: we add two people.'] });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  await Promise.all([
    typeInParagraph({ page: ana.page, paragraphText: 'Budget:', text: ' More money' }),
    typeInParagraph({ page: bruno.page, paragraphText: 'Hiring:', text: ' A designer' }),
  ]);
  await waitForBands({ page: ana.page, names: ['Budget', 'Hiring'] });
  const topEdits = ana.page.getByRole('list', { name: TOP_EDITS_LABEL });
  await expect(topEdits.getByRole('listitem').filter({ hasText: 'Budget' })).toContainText('Edits about Budget.');
  await expect(topEdits.getByRole('listitem').filter({ hasText: 'Hiring' }).getByTitle('Bruno')).toBeVisible();
});
```
Same file, each steps → expected: `filter by username hides the other author` (Ana types `@bruno` Enter → URL `author=bruno`; the Budget band's `aria-label` reads 0 characters and Top edits lists only Hiring); `filter by term survives a reload` (`designer` → URL `term=designer`; reload → the chip and the narrowed chart are back); `a band appears while the other author is still typing` (Bruno types 40 characters at 100 ms each; Ana's Hiring band `aria-label` volume increases at least twice before Bruno stops, polled, no reload); `topics unavailable shows author bands` (a seed with `FAIL-TOPICS` → `TOPICS_UNAVAILABLE_MESSAGE`, bands named Ana and Bruno, Retry visible to the owner); `keyboard moves the selected bin` (Tab to the first band, End, ArrowLeft → the vertical rule moves and the URL `at` changes once after the debounce); `narrow viewport stacks the panel` (375×812: the panel's top is below the editor's bottom, `document.documentElement.scrollWidth <= 375`). `time-travel.spec.ts`: `the first bin opens the document as uploaded and Back to live returns` (Ana edits ` More money`; focus the first band, Home → banner "Version at", `readViewerText` equals `GET /versions/<shownVersionSequence>/text` and does not contain `More money`; typing in the viewer changes nothing; Back to live → no `at`, the live editor shows ` More money` and accepts typing); `the edit bin shows the edit and lists it` (End then ArrowLeft to the last filled bin → viewer text contains `More money`; the panel lists Ana's run); `a shared at link opens the same version for another member` (Bruno opens Ana's URL → same banner time and viewer text); `a non-member opening an at link sees the document is unavailable` (Dani, a stranger to the document → `DOCUMENT_UNAVAILABLE_MESSAGE`; `page.on('request')` saw no `/versions/` request); `Browser Back from a version returns to live`; `highlights stay local to one viewer` (Ana selects the edit bin → `countViewerHighlights` in her frame is at least 1; Bruno opens the same version's frame page directly at `versionViewPagePath(...)`, where no parent sends highlights → 0; the `updates` count of `/events` paging and `/versions?around` are unchanged before and after); `the live editor keeps working while the viewer is open` (Ana views a version; Bruno types ` live` → Ana's `readLiveText` contains ` live` while her frame still shows the old version; Back to live, Ana types ` again` → Bruno sees it). Every UI string comes from `libs/types` or the web copy files, never a literal.
- [ ] **Step 3: Run** — `pnpm test:e2e` twice in a row; every spec passes both times with `retries: 0`, slice 1 and 2 specs included.
- [ ] **Step 4: Commit** — `test(e2e): cover the timeline, filters and time travel against a fake OpenRouter`

---

### Task 16: README, Docker check, briefing (G4)

**Files:**
- Modify: `README.md`, `docs/features/README.md` (status → Building), `libs/types/src/documents.ts` (remove `TIMELINE_PLACEHOLDER_MESSAGE`, now unused)
- Create: `docs/features/timeline-and-time-travel/tester-briefing.md`

- [ ] **Step 1: README** — the timeline panel, filters (`@person`), Top edits, time travel; LLM use cited: topics and per-topic sentences through the Vercel AI SDK and OpenRouter (`LLM_MODEL`, `OPENROUTER_API_KEY`, optional `OPENROUTER_BASE_URL`), names only in prompts, the fallback without a key; how to run the smoke test with `scripts/with-env.sh`.
- [ ] **Step 2: Docker** — `scripts/with-env.sh docker compose up --build -d` (compose reads `.env` through `env_file`, so the owner's key reaches the container without anyone opening it); `curl -f localhost:3000/api/health`; sign in, upload a four-section seed, type once, `GET /timeline` until `topics.state` is `ready`; open a version in a browser and see the framed viewer; `docker compose down -v`. Then `ENV_FILE=.env.example scripts/with-env.sh docker compose up --build -d` (no key) → `topics.state` `failed` with `LLM_KEY_MISSING_MESSAGE` and author bands; `docker compose down -v`.
- [ ] **Step 3: Tester briefing** — per the template: what changed per group; how to run (the production-shaped command of `test-plan.md`, with `scripts/with-env.sh` for the LLM walk); red-today/green-after per suite; hypotheses ("a band grows within about 5 s of typing", "no version request leaves a page that cannot open the document", "a version room never writes the log"); known gaps (runs split at bin edges, backspaced text shows reversed in snippets, imported revisions months older than live edits squeeze live edits into one bin, older documents are rebuilt at startup and their versions answer 202 until then; bins under a minute share a per-minute version).
- [ ] **Step 4: Commit** — `docs: add the timeline-and-time-travel briefing and README` and `chore(types): drop the timeline placeholder message`

---

### Z. Prove and ship

- [ ] **Z1:** Developer A hands over `tester-briefing.md`; the orchestrator dispatches the `tester` with `test-plan.md` only.
- [ ] **Z2:** Tester executes `test-plan.md`, ticks with evidence, files defects to the owning group.
- [ ] **Z3:** `reviewer` on `git diff main...HEAD`; findings fixed; refutations recorded in `test-plan.md`.
- [ ] **Z4:** `/check-ui http://localhost:3100/documents timeline-and-time-travel --video` by the `recorder`.
- [ ] **Z5:** ADR 0003 moves to Accepted with an addendum (versions isolated by endpoint, not by room name; the viewer in a same-origin iframe); `spec.md`'s Data flow and Interfaces lines are amended to what was built: in-memory runs over the read model instead of SQL `GROUP BY`, `/timeline/edits?binStart` instead of `/versions/:sequence/edits`, `version_marks` in the read model, `at` as a bin start, the per-version endpoint and the iframe viewer; learnings sweep (ai@7 deprecates `generateObject`; keystroke events need runs for search; a SuperDoc version cannot be renamed into its own room, isolate it by endpoint; version endpoints must skip awareness declarations); `/open-pr timeline-and-time-travel`.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|---|---|---|---|
| 1.0 | `@openrouter/ai-sdk-provider` 3.1.0 peers on a different `ai` than 7.0.142 | `pnpm install` prints an unmet peer warning for `ai` | Keep 7.0.142 (the provider declares `^7.0.0`); a warning naming another major stops the task for the owner |
| 2.4 | A snapshot taken on the gc:true projection doc does not restore on the gc:false replay | `every mark restores the document exactly…` fails on a `content` mismatch | Take the snapshot inside `GcFreeReplays` while it applies the updates one by one, and store that instead |
| 2.5 | The gc:false replay grows past memory for long histories | worker RSS climbs with each opened document | `REPLAY_CACHE_SIZE` 2 evicts; else switch to the `materialize` fallback, already proven exact |
| 3.3 | Runs of a word typed across a bin edge are split, so a term at the edge does not match | `term` test passes but a manual search for a word typed at :59 misses | Documented limit; widening `binMs` with `?binMs=` finds it |
| 6.3 | The worker's read-write history handle collides with the main thread's appends | `SQLITE_BUSY` in the worker log after `busy_timeout` | `openSqliteFile` sets `busy_timeout` 5000; snapshot writes are single statements; if it persists, write snapshots on the main thread from bytes the worker returns |
| 6.1 | `mkfifo` is missing on the CI image | the hanging-import test errors with `ENOENT mkfifo` | Mark the test `skipIf(process.platform === 'win32')`; Linux and macOS ship `mkfifo` |
| 6.3 | Dropping `compact` from `onStoreDocument` while the worker is degraded leaves the log without new snapshots | `latestSnapshot` stays behind the 1000-update boundary | A degraded worker already disables projection; the restart restores both |
| 9.1 | Jumping the faked `Date` by minutes in a server test trips a time-based check (session expiry, a socket timeout) | the property test fails with 401 or a closed provider, not a text mismatch | Fake only `Date` (sockets keep real timers), start the clock at the session's creation and keep the total jump under the session lifetime; if it still trips, move the fake clock into `UpdateLog` through an injected `now` |
| 7.3 | The pipeline key misses a change (a late identity declaration, a topic refresh at the same cursor) | `/timeline` shows the old author or band until the next edit | The key already carries identity counts and the topic set's `updatedAt`; add the missing input to `pipelineKey` and its test |
| 8.3 | `Output.object` over OpenRouter returns prose instead of JSON on a document unlike the spike's | topics `failed` with `NoOutputGeneratedError` in the server log; the smoke test fails | Refresh retries once by hand; if it repeats, change `LLM_MODEL`; the parser and clamp stay |
| 8.3 | The model name in `LLM_MODEL` is wrong | `APICallError` 404 in the log, topics `failed` with the generic message | The owner fixes `.env`; nothing else changes |
| 9.3 | Version instances pile up when viewers never disconnect cleanly | `versionRooms.size()` keeps growing in a long session; memory climbs | `limit` (32) evicts the least recently used instance; lower it in `DEFAULT_VERSION_ROOM_POLICY` |
| 14.3 | A SuperDoc update makes `comments.create` write to the room or show a sidebar in `viewing` | `highlights stay local to one viewer` fails, or a comment panel appears | Drop the highlight call; the bin edits list in the panel is the degraded path |
| 9.3 | The viewer joins before the room finished `onLoadDocument` | blank viewer for one version | Hocuspocus awaits `onLoadDocument` before sync; the route answers 200 only after the cache is warm |
| 11.3 | `curveBasis` pulls the curve inside the points, so a label at the band's edge looks outside it | screenshot shows a label touching the neighbour band | Add `CHART_LABEL_INSET` px to the thickness threshold |
| 13.3 | The frame posts `Ready` before the parent listens, or a `postMessage` is dropped | the new frame stays hidden and the banner says Loading forever | `VersionFrame` adds its `message` listener in an effect that runs before the `iframe` is rendered; the frame re-posts `Ready` on any `Highlight` it receives while ready |
| 14.3 | A block of a node type outside `TEXT_BLOCK_NODE_TYPES`, or a block id SuperDoc does not accept as `nodeId` | no highlight for that run in E2E while the panel lists it | The run stays listed in the panel (the degraded path); add the node type to the list when the E2E shows it |
| 15.1 | The provider sends `response_format` the fake does not expect, or reads a different field | E2E topics `failed` while unit tests pass | Log the fake's request body once, adjust the fake's answer shape; never change product code for the fake |

**Steps with no backout:** none; every step is additive on a feature branch, the new read-model migration only adds a table, and the startup rebuild only touches documents without marks, whose read model is regenerable from the log and the stored file.

## Self-review

- Spec coverage: Goal 1 → Tasks 3, 7, 11; Goal 2 → Tasks 4, 5, 8; Goal 3 → Tasks 3, 7, 10, 12; Goal 4 → Tasks 3, 8, 12; Goal 5 → Tasks 2, 6, 9, 13, 14; Goal 6 → Tasks 6, 7, 10; Goal 7 → Task 0. Failure handling: no key → Tasks 5, 8, 12; unknown block ids → Tasks 4, 8; projection behind → Tasks 7, 12; version not cached → Tasks 9, 13; no match → Task 12; scrubbing → Task 13. Security → Tasks 7–9 (membership on every route), Task 8 (names only, refresh limits), Task 9 (rooms). Deferred slice 2 items → Task 6 (throttle, compaction, import lane), Task 7 (pagination).
- Not turned into tasks: SSE (`/history-stream`; polling is the transport, its server cost bounded by the pipeline cache and pinned by the 10k-event timing test in Task 7, while the spike measured only the chart's render), `/versions/:sequence/edits` (moved to `/timeline/edits`, see Assumptions), `activity_buckets` (aggregation in memory, see Assumptions).
- Placeholders: none; every spike fact held and its branch is written as the only path. Spec corrections carried: the version room name (endpoint isolation), the iframe viewer, `at` as a bin start, topic identity by id; Z5 writes them into the spec.
- Types: `TimelineBand`, `EditRun`, `VersionMark`, `LanguageModelChoice`, `VersionLoad` and their fields are named identically in the tasks that produce and consume them.
