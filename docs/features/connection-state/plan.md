# Connection State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the live editor shows the author's connection state in a banner, keeps working through warnings, and goes read-only with a Reload button when the connection fails for good.

**Architecture:** the SuperDoc callback sets lost, reconnecting and failed at once; the members poll says whether the server still sees this user online, and only that confirms recovery; one hook merges both; exceptions are narrowed by payload shape.

**Tech Stack:** TypeScript, SuperDoc 2.23.0, React 19, TanStack Query, Hono, Vitest with fake timers, Playwright (E2E and MCP walk).

**Spec:** `docs/features/connection-state/spec.md` (ADR 0032). Brief: `docs/features/connection-state/brief.md`.

**Tier:** 🟡

**Seam:** `onCollaborationConnectionChange` and `onException` in `apps/web/src/features/editor/superdoc-editor.tsx`, and the members route in `apps/server/src/documents/documents-routes.ts`.

## Global Constraints

- Failed is final until Reload. Recovered shows for `RECOVERED_NOTICE_MS = 3 * SECOND_MS`, then Online.
- Recovery needs the server flag true and the callback not failed. No `navigator.onLine`, no heartbeat.
- A warn diagnostic is logged and changes no state. `collaborationReason` or code `worker-transport-failed` is a connection failure. Everything else is fatal.
- `DocumentMembers` gains `isCurrentUserOnline: boolean`. The web hook exposes `boolean | null`.
- The members poll interval stays `MEMBERS_REFRESH_MS`. The version viewer's inert behaviour is unchanged.
- States, reasons and transport readings are enums. Copy lives in `connection-copy.ts`. No `??` fallbacks, flat ifs, no else, no comments, named parameters above one argument, no `.js` imports.
- Each step is a red commit, then a green commit. Each group's docs edit lands in the same commit as the code it describes.

## Review Focus

1. A warn diagnostic during a remote edit: logged, editor keeps working, no failure text. Pinned by Step 8 and Step 16.
2. Server restart while the author types: edits kept in the browser, dated at sync, reach the other author. Pinned by Step 22.
3. Members poll fails while Lost: flag is `null`, the previous answer is never reused. Pinned by Step 6.
4. Session cookie removed: Failed, editor inert, Reload works after signing in again. Pinned by Step 23.
5. A Lost reading arriving during the Recovered notice: the notice is cancelled and the state is Lost. Pinned by Step 12.

## Assumptions (decided, owner can override)

- The installed SuperDoc 2.23.0 types confirm the callback payload carries `state` and `kind`, and that a diagnostic payload has no `code`. Step 8 relies on both.
- The callback's `detail` strings are not typed. Step 21 records the sequence the E2E actually sees. Any failed reading without an exception shows the Unknown reason.
- `TransportReading` (Clear, Lost, Reconnecting, Failed) is a web-only enum in `use-connection-state.ts`.
- A Recovered result sets the callback reading back to Clear and starts a timer that keeps the Recovered notice on screen. Without the timer, Clear with the server online would read as Online at once.
- `isRecoverableException` stays until Step 17 removes its last caller.
- The agent's list-members tool builds its own output and reaches `DocumentMembers` only through a cast in its test, which still compiles.
- The E2E runs its own server on port 3150 with its own database, so restarting it cannot break other specs.

## E2E outage mechanism

- **Chosen:** a dedicated server that the spec stops with SIGTERM, the server's own shutdown path, which closes its sockets, and starts again on the same port and database. Both authors open against that origin.
- **Trade-off:** a restart needs its own port and database, so the spec runs serially. A graceful stop may wait on open sockets; the failure table says how to back out.
- **Rejected:** a test-only route that closes a room's sockets. It adds a production route, reaches into `apps/server` outside this lane, and does not prove a process restart.
- **Rejected:** SIGSTOP. The socket stays open and the presence flag stays true, so Lost never shows and the poll hangs.
- **Rejected:** `context.setOffline`. Chromium does not reliably close an open socket, and the server never goes away, so recovery is untested.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/connection.ts` (new), `libs/types/src/connection.test.ts` (new), `libs/types/src/index.ts`, `libs/types/src/constants.ts`, `libs/types/src/documents.ts`, `apps/server/src/documents/documents-routes.ts`, `apps/server/src/documents/documents-routes.test.ts`, `apps/web/src/features/editor/use-members.ts`, `apps/web/src/features/editor/use-members.test.ts` (new), `.claude/rules/collaboration.md` (members flag paragraph) | `developer-1` |
| G2 | `apps/web/src/features/editor/superdoc-exceptions.ts`, `apps/web/src/features/editor/superdoc-exceptions.test.ts`, `apps/web/src/features/versions/version-viewer.tsx`, `apps/web/src/features/versions/version-viewer.test.tsx` (new), `.claude/rules/collaboration.md` (exception paragraph) | `developer-2` |
| G3 | `apps/web/src/features/editor/use-connection-state.ts` (new), its test (new), `apps/web/src/features/editor/connection-banner.tsx` (new), its test (new), `apps/web/src/features/editor/connection-copy.ts` (new), `apps/web/src/features/editor/document-page.tsx`, `apps/web/src/features/editor/document-page.test.tsx`, `apps/web/src/features/editor/superdoc-editor.tsx`, `.claude/rules/web-ui.md` (banner pattern), `.claude/rules/collaboration.md` (states and Reload) | `developer-3` |
| G4 | `e2e/connection-state.spec.ts` (new), `e2e/restartable-stack.ts` (new), `e2e/stack.ts` (receives `assertPortFree`), `e2e/scenario-stack.ts` (imports it), `e2e/fixtures.ts` (optional origin on the context helpers) | `developer-4` |

**Overlap with final-visuals:** `final-visuals` also edits `document-page.tsx`, `superdoc-editor.tsx`, `members.tsx` and `use-members.ts`. G3 keeps its changes additive: new props, new hook calls, new JSX siblings, and no reordering of existing props. G1 adds one return field to `use-members.ts` and changes no existing field. The lead merges the lanes.

**Interfaces:**
- G1 produces `ConnectionState` and `ConnectionFailureReason` from `@superdoc-collab/types`, `RECOVERED_NOTICE_MS`, `DocumentMembers.isCurrentUserOnline: boolean`, and `useMembers` returning `isCurrentUserOnline: boolean | null`.
- G2 produces `ExceptionOutcome`, `exceptionOutcome(payload)`, `failureReasonOf(payload)`, and `SuperDocExceptionCode.WorkerTransportFailed`.
- G3 produces `TransportReading`, `TransportReport`, `mergeConnectionState({ reading, isCurrentUserOnline })`, `useConnectionState({ documentId, isCurrentUserOnline })`, and `ConnectionBanner({ state, failureReason, onReload })`.
- G4 produces `startRestartableStack`, `stopServer` and `startServer`.

## Sequencing

G1 and G2 start together. G2's green step imports `ConnectionFailureReason` from G1 Step 2, so G2 writes its red steps first and merges after G1 Step 2 lands. G3 starts after G1 and G2 are merged. G4's infrastructure (Steps 18 and 19) runs alongside G3, but its spec steps need the banner, so G4 Steps 20 to 24 start after G3 is merged.

## Steps

Author this list with every box empty. A sub-agent ticks its own line. A wrong step is struck through with the reason, not deleted.

### G1: types, members flag, `use-members`

- [ ] **Step 1:** red. `libs/types/src/connection.test.ts` `the connection states are the five values the banner names`: input `Object.values(ConnectionState)`; expected `['online', 'lost', 'reconnecting', 'recovered', 'failed']`. Red text: the import fails with `Failed to load url ./connection`.
- [ ] **Step 2:** green. Create `libs/types/src/connection.ts` with `ConnectionState` and `ConnectionFailureReason` (values from spec Interfaces), export it from `index.ts`, add `RECOVERED_NOTICE_MS = 3 * SECOND_MS` to `constants.ts`. Expected: Step 1 green; `pnpm --filter @superdoc-collab/types typecheck` clean.
- [ ] **Step 3:** red. `apps/server/src/documents/documents-routes.test.ts` `members reports whether the current user is online`: input: owner connected through `connectToDocument`, reader with no socket, both request members; expected: owner `isCurrentUserOnline` true, reader false. Red text: `expected undefined to be true`.
- [ ] **Step 4:** green. In `documents-routes.ts` the members handler adds `isCurrentUserOnline: online.has(context.var.user.id)` beside `members`. `documents.ts` types `DocumentMembers` as `{ members: DocumentMember[]; isCurrentUserOnline: boolean }`. Expected: Step 3 green; server typecheck clean.
- [ ] **Step 5:** red. `apps/web/src/features/editor/use-members.test.ts`, using `renderHook`, a `QueryClient` wrapper and `jsonResponse` to stub `fetch`: `isCurrentUserOnline is null before the first answer` (input: pending request; expected `null`), `isCurrentUserOnline follows the latest answer` (input: answers true, then false; expected true, then false), `isCurrentUserOnline is null after a failed poll` (input: true, then a 500; expected `null`, never true). Red text: `expected undefined to be null`.
- [ ] **Step 6:** green. `use-members.ts` returns `isCurrentUserOnline: boolean | null`: `null` when there is no data or `error` is set, otherwise the data flag. `.claude/rules/collaboration.md` gets one sentence on the members flag in this commit. Expected: Step 5 green.

### G2: exception narrowing and the version viewer

- [ ] **Step 7:** red. `superdoc-exceptions.test.ts` gains: `a warn diagnostic is logged, not failed` (input: `{ diagnosticCode: 'RENDER_ERROR', severity: 'warn', internalCode, message, error, diagnosticStage }`; expected `ExceptionOutcome.Logged`), `an error diagnostic is fatal` (same, severity `error`; expected `Fatal`), `edit-rejected is recoverable` (expected `Recoverable`), `each collaboration reason is a connection failure` (rows `access-denied`, `connection-failed`, `sync-timeout` with `collaborationReason`; expected `ConnectionFailed`), `worker-transport-failed is a connection failure` (input `{ code: 'worker-transport-failed' }`; expected `ConnectionFailed`), `failureReasonOf maps each reason and the worker code, Unknown otherwise` (expected enum values; `{ error, editor: null }` gives `Unknown`). The existing fatal-code rows stay `Fatal`. Red text: `exceptionOutcome is not a function`.
- [ ] **Step 8:** green. `superdoc-exceptions.ts` adds `SuperDocExceptionCode.WorkerTransportFailed`, `ExceptionOutcome`, `exceptionOutcome(payload)` and `failureReasonOf(payload)` with an explicit `Unknown` branch. `isRecoverableException` stays for now. Expected: Step 7 green.
- [ ] **Step 9:** red. `apps/web/src/features/versions/version-viewer.test.tsx` (new), mocking `superdoc` as `document-page.test.tsx` does and stubbing `fetchDocumentFile`: `a warn diagnostic calls neither onFailed nor onConnectionFailed` (expected both zero), `a collaboration reason calls onConnectionFailed and not onFailed` (expected 1 and 0), `a fatal payload calls onFailed` (expected 1), `edit-rejected calls neither` (expected zero). Red text: `expected "onFailed" to not be called at all, but actually been called 1 times`.
- [ ] **Step 10:** green. `version-viewer.tsx` maps `onException` through `exceptionOutcome`: Logged and Recoverable do nothing, ConnectionFailed calls `onConnectionFailed`, Fatal calls `onFailed`. The local `ConnectionState` enum becomes `ViewerConnectionState`. `.claude/rules/collaboration.md` gets the narrowing rule in this commit. Expected: Step 9 green; `version-view-page.test.tsx` and `time-travel.test.tsx` still green.

### G3: hook, banner and page wiring (after G1 and G2 are merged)

- [ ] **Step 11:** red. `apps/web/src/features/editor/use-connection-state.test.ts`, `mergeConnectionState` as a test.each over every row of spec Merge plus `Clear` with `false` and `null`: input e.g. `{ reading: Lost, isCurrentUserOnline: true }`; expected `Recovered`. Red text: `mergeConnectionState is not a function`.
- [ ] **Step 12:** red. Same file, fake timers, `useConnectionState` with `renderHook`: `Lost, Reconnecting, Recovered, then Online after RECOVERED_NOTICE_MS` (expected states at 0 ms, 0 ms, the server reply, 2999 ms still Recovered, 3000 ms Online), `Failed is sticky until reset` (expected Failed after a later Clear), `two readings in one tick fold in arrival order` (lost then reconnecting gives Reconnecting; the reverse gives Lost), `reset returns to Online` (expected Online, reading Clear), `a Lost during Recovered cancels the notice` (expected Lost and still Lost at 3500 ms with the server flag false), `a synced reading refetches members and changes nothing else` (spy on `invalidateQueries` with `membersQueryKey`; expected state unchanged), `a recovered reading refetches members`, `the notice timer is cleared on unmount` (`vi.getTimerCount()` is 0). Red text: `useConnectionState is not a function`.
- [ ] **Step 13:** green. `use-connection-state.ts` exports `TransportReading`, `TransportReport`, `mergeConnectionState`, and `useConnectionState` returning `{ state, failureReason, reportTransport, resetConnection }`. When the merge yields Recovered, the hook sets the reading to Clear and starts the timer. A Lost during the notice clears the timer. `reportTransport` calls `invalidateQueries` on `membersQueryKey` when `hasSynced`. Expected: Steps 11 and 12 green.
- [ ] **Step 14:** red. `connection-banner.test.tsx`: `each state renders its title` (input: Lost, Reconnecting, Recovered, Failed; expected the copy title, with `KEPT_AND_DATED_DETAIL` in Lost and Reconnecting), `Failed uses role alert and the others role status` (expected `alert` and `status`), `an Unknown reason shows the generic failure line` (expected `FAILURE_REASON_COPY[Unknown]`), `Online renders nothing` (expected no `connection-banner`), `Reload calls onReload once`. Red text: `Failed to load url ./connection-banner`.
- [ ] **Step 15:** green. `connection-copy.ts` and `connection-banner.tsx` follow `version-banner.tsx`: `data-testid="connection-banner"`, `data-state`, the enum drives the role. Expected: Step 14 green.
- [ ] **Step 16:** red. `document-page.test.tsx` gains, using the existing `superdoc` config capture: `a lost callback shows the banner above the version banner` (input: callback `{ state: 'degraded', kind: 'lost' }` while a past version is shown; expected `data-state="lost"` precedes `version-banner` in document order), `a warn diagnostic keeps the editor usable and logs with console.warn` (input: warn diagnostic; expected no `EDITOR_FAILED_MESSAGE`, no banner, `console.warn` called with the diagnostic message), `a failed callback makes the editor inert, dims it and names the reason` (input: `{ state: 'failed', kind: 'failed' }`; expected `inert` on `document-editor`, `opacity-60` on the editor area, role `alert`), `Reload remounts the editor with a new SuperDoc instance` (expected two constructions, one `superDocDestroy`, no banner). The existing fatal-exception test stays. Red text: `Unable to find an element by: [data-testid="connection-banner"]`.
- [ ] **Step 17:** green. `superdoc-editor.tsx` gains `onTransportReport`; its `onCollaborationConnectionChange` maps kind and state to a reading and calls the report inside an `isActive` guard that its effect cleanup clears; its `onException` uses `exceptionOutcome` and calls `console.warn` for Logged; `isRecoverableException` is deleted. `document-page.tsx` holds `editorGeneration` as the editor's `key`, calls `useConnectionState`, renders `ConnectionBanner` between the top bar and the flex row, sets `isInert` to viewing or Failed, and on Reload invalidates `openedDocumentQueryKey` and `DOCUMENT_FILE_QUERY_KEY` before bumping the generation. `.claude/rules/web-ui.md` and `collaboration.md` describe the states and Reload in this commit. The page test fixtures gain `isCurrentUserOnline`. Expected: Step 16 green; `apps/web` typecheck clean.

### G4: E2E on a restartable server (Steps 18 and 19 alongside G3; 20 to 24 after G3)

- [ ] **Step 18:** red. `e2e/connection-state.spec.ts` `the restartable server answers health after a stop and a start`: input: `startRestartableStack`, `stopServer`, `startServer`, then fetch `SERVER_HEALTH_PATH`; expected `200`. Red text: `Cannot find module './restartable-stack'`.
- [ ] **Step 19:** green. Move `assertPortFree` from `scenario-stack.ts` into `stack.ts` (scenario-stack imports it, behaviour unchanged). `e2e/restartable-stack.ts` runs `node apps/server/dist/seed.js` on a fresh database directory, starts `node apps/server/dist/main.js` on `RESTARTABLE_PORT = 3150` through `stackEnvironment`, waits for health, and exposes `stopServer` (SIGTERM, awaits exit) and `startServer` (same port and database). `fixtures.ts`: `signedInContext` and `openedContext` take an optional `origin` passed as `baseURL`. Expected: Step 18 green.
- [ ] **Step 20:** red. `a server restart shows lost, reconnecting, then clears`: input: Ana and Bruno on the restartable server, shared with edit rights, then `stopServer`, wait, `startServer`; expected: `connection-banner` `data-state="lost"` visible within 30 s of the stop, `reconnecting` observed before clear, no banner within 30 s of the restart. Red against main without G3: `expect(locator).toBeVisible()` fails on `getByTestId('connection-banner')`.
- [ ] **Step 21:** green. Same test after G3 is merged. Evidence: the banner sequence the test observed, and the callback `kind` values recorded from the page.
- [ ] **Step 22:** red then green. `an edit typed while the server is down reaches the other author after reconnect`: input: `stopServer`, Ana types `' <ANA-OFFLINE>'` into her paragraph, `startServer`; expected: Bruno's text contains the marker within 60 s, and the event for Ana's marker in `GET` events has `serverTime` no earlier than the moment `startServer` resolved.
- [ ] **Step 23:** red then green. `the session cookie removed shows failed, an inert editor and a working Reload`: input: `clearCookies` on Ana's context, `stopServer`, `startServer`; expected: `connection-banner` with `data-state="failed"` and role `alert` within 60 s, `document-editor` has `inert`. Then Ana signs in again on a second page in the same context, clicks Reload on the first; expected: banner gone and typing works.
- [ ] **Step 24:** regression. `e2e/collaboration.spec.ts` `two authors converge and each marker is attributed to its author`, `identities are declared from awareness` and `an edit rejected under a concurrent delete does not stop the editor` stay green. Expected: all three pass against the merged G3.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 4 | the flag reads the wrong user id | Step 3 shows the reader as online with no socket | revert the one route line; `context.var.user.id` is the only id source |
| 6 | a failed poll reuses the last answer | Step 5 "null after a failed poll" fails | return `null` whenever `error` is set |
| 8 | a real fatal failure is logged | the collaboration suite's fatal checks hide a dead editor | keep only `diagnosticCode` with `severity: 'warn'` as Logged |
| 10 | a viewer failure no longer ends time travel | `version-view-page.test.tsx` shows no `Failed` message | restore `onFailed` for every non-ignored payload |
| 13 | a stale server flag shows Recovered during a client-side drop | not reproduced by the E2E; seen only in a manual walk while the browser is offline | accepted by the spec; a change needs an owner decision |
| 17 | Reload leaves the old SuperDoc alive | Step 16 "remounts" counts destroys below constructions | confirm the effect cleanup destroys the instance; keep the `key` remount |
| 19 | port 3150 is busy | `Port 3150 is busy` from the helper at start | move `RESTARTABLE_PORT` |
| 19 | graceful stop waits on open sockets | `stopServer` exceeds its wait | send SIGKILL after the wait; the sockets close the same way |
| 21 | the refused reconnect reports lost, not failed | Step 23 never reaches `failed` and the recorded sequence has no failed kind | report to the lead; the spec's failed trigger needs an owner decision |
| 23 | the placeholder token still reconnects after the cookie is removed | no `failed` within 60 s | same as above; record the socket close codes |

**Steps with no backout:** none. The members field is additive, the E2E stack is local, and every web change reverts by file.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on the members route change and the E2E port.
- [ ] **/check-ui:** screenshots of every banner state at the eight widths, light and dark, uploaded.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
