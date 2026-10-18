# Tester briefing: Room admission

Written by the developer sub-agents when their steps are done. The developers do not run `test-plan.md` and do not declare the feature works.

## Groups G1 and G2 (core)

### What changed

- `libs/history/src/document-history.ts`: `isBootstrapCommitted({ document })` and `findCommittedSnapshot({ log, documentName })`, the first snapshot whose state is committed.
- `libs/history/src/update-log.ts`: `appendCommitted` (committing update and snapshot in one transaction, snapshot sequence equals the appended sequence) and `snapshotAfter`.
- `libs/history/src/projection.ts`: the projection starts at the first committed snapshot and falls back to the log scan.
- `libs/types`: reservation, rate-limit and close-code constants, `MAX_SOCKET_MESSAGE_BYTES`, and `OpenedDocument.creatorAttempt` and `creatorEpoch`. `apps/web/src/testing/opened-document.ts` returns both as null.
- `apps/server/src/collaboration/creator-reservations.ts`: process `epoch`; `reserve` answers `{ attempt, epoch }`; fence, commit record, `touch` (silence expiry) and `release` (expires at once, `attemptOf` still answers the holder).
- `apps/server/src/collaboration/bootstrap-state.ts`: snapshot-first `isCommitted`, paged log scan only without a snapshot, `commit` (append plus snapshot of the live room). `ROOM_MODE_SCAN_BATCH_SIZE` lives here and is re-exported by the runtime for `documents-routes.test.ts`.
- `apps/server/src/collaboration/collaboration-context.ts`: the `CollaborationContext` type with `creatorAttempt` and `creatorEpoch`. `collaboration-server.ts` still declares its own copy until G3 imports this one.
- `apps/server/src/collaboration/collaboration-runtime.ts`: `reserveCreator` answers the ticket and closes superseded connections; `roomMode` reads `bootstrap.isCommitted`; `forget` clears reservation and bootstrap.
- `apps/server/src/server.ts`: builds `reservations` (server `now` as clock) and `bootstrap`, passes both to the runtime, exposes `services.reservations`.

### Shapes for G3 and G4

```ts
CreatorTicket = { attempt: number; epoch: string }
CreatorReservations: epoch: string
                     reserve({ documentId, userId }): CreatorTicket | null
                     attemptOf({ documentId, userId }): number | null
                     mayWrite({ documentId, attempt, epoch, isCommitted }): boolean
                     commit({ documentId, attempt }): void
                     touch({ documentId, attempt }): void
                     release({ documentId, attempt }): void
                     forget(documentId): void
BootstrapState:      isCommitted(documentId): boolean
                     commit({ documentId, connectionUserId, connectionActor, update, document }): LoggedUpdate
                     forget(documentId): void
runtime.reserveCreator({ documentId, userId }): CreatorTicket | null
services.reservations: CreatorReservations
```

- **`mayWrite` has an extra `isCommitted` argument** beyond the lead's signature. Without it the class cannot tell a Join socket on a committed room (allowed) from a socket with no attempt on an uncommitted room (refused), especially after a restart wiped its memory. G3 passes `bootstrap.isCommitted(documentId)`.
- **G3 order in `onChange`:** fence with `mayWrite`; if the live room is committed (`isBootstrapCommitted` on the room) and the room was not yet, call `bootstrap.commit` instead of `updateLog.append`, then `reservations.commit({ documentId, attempt })`; otherwise `updateLog.append` then `reservations.touch`. `commit` already appends, so G3 must not append that update twice.
- **G3 release:** call `reservations.release` only when no other connection of the room still has that attempt. Hocuspocus removes the closing connection from the document before `onDisconnect`, so count the remaining ones.
- **G3 arguments:** `reservations` and `bootstrap` are already built in `createServices` before the `createCollaborationServer` call. G3 adds the two arguments to that call and imports `CollaborationContext` from `collaboration-context.ts`.
- **G3 manual unload:** dropped as the lead decided. Hocuspocus 2.15.3 unloads on the last close by default.
- **G4:** the open route calls `runtime.reserveCreator` and returns `attempt` and `epoch` as `creatorAttempt` and `creatorEpoch`.

### How to run

```bash
pnpm --filter @superdoc-collab/history test:unit
pnpm --filter @superdoc-collab/server test:unit -- collaboration
pnpm typecheck
```

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `document-history.test.ts::isBootstrapCommitted ...` (2 tests) | `Error: isBootstrapCommitted is not implemented` (a13b64d) | 66da02f |
| `pnpm typecheck` (Step 2) | `opened-document.ts(13,3): error TS2741: Property 'creatorAttempt' is missing` (f482490) | 0a93d58 |
| `update-log.test.ts::appendCommitted ...` (2 tests), `::snapshotAfter ...` | `Error: appendCommitted is not implemented`, `Error: snapshotAfter is not implemented` (071c3cf) | 0312442 |
| `document-history.test.ts::findCommittedSnapshot ...` (2 tests) | `Error: findCommittedSnapshot is not implemented` (a190fce) | 9c646ef |
| `projection.test.ts::a commit snapshot starts the projection although a replay of the whole log never sees the commit` | `AssertionError: expected null to be 3` (59746f2) | ac96bf2 |
| `creator-reservations.test.ts` (first 7 rows) | `CreatorReservations is not implemented` (9452149) | ce8e506 |
| `creator-reservations.test.ts` (16 rows after the review changes) | 11 of 16 fail on the old API (23ed472) | f15fb4b |
| `bootstrap-state.test.ts::commit appends ...` and `::isCommitted trusts the snapshot ...` | `TypeError: bootstrap.commit is not a function`, `AssertionError: expected false to be true` (f5baab8) | 135a07d |
| `collaboration-runtime.test.ts::a takeover closes ...` | first red `Error: reserveCreator is not implemented` (a066885); after the review `expected "vi.fn()" to not be called at all, but actually been called 1 times` (bb5fa73) | cccc695, 8e8e46f |
| `documents-routes.test.ts::roomMode stays create ...` and `::roomMode scans a long log in pages ...` | pin: green before and after the wiring (e1b8fc4) | |
| `isCommitted reads a committed room once and caches it` | pin after the rewrite: green when it landed | |

Red commits after the review (23ed472, f5baab8, bb5fa73) change a test against an implementation that still has the old API, so `pnpm typecheck` was red between each red and its green. The lane tip typechecks.

### Hypotheses to attack

1. Hypothesis: an abandoned partial by a higher client id can never hide the winner's commit from `roomMode` or the projection. Break it by: trying other client ids and orders, with and without a snapshot, and checking that without a snapshot the old log scan still decides.
2. Hypothesis: the same user opening twice keeps attempt n without extending the expiry. Break it by: a second open at 30 s, then another editor at 61 s.
3. Hypothesis: a released reservation lets the next editor in at once, while the dropped holder keeps its attempt until that happens. Break it by: release, `attemptOf` for the holder, then another reserve and `attemptOf` again.
4. Hypothesis: after the commit only the committing attempt and attempt-less sockets may write. Break it by: committing attempt 2 after a takeover and writing as attempt 1 and as a foreign epoch.
5. Hypothesis: `appendCommitted` leaves no update row when the snapshot write fails. Break it by: failing the snapshot insert through a constraint instead of a spy.
6. Hypothesis: a takeover closes only the superseded connections of that room. Break it by: two tabs of the new holder and a connection in another room.

### Known gaps

- Step 21 writes the log through the library `UpdateLog` API on a direct handle to `history.sqlite`. It is kept because it is the only deterministic cut.
- The 10 MB test asserts the largest sent frame is below `MAX_SOCKET_MESSAGE_BYTES` and that the connection banner, when present, is not reconnecting. The banner exists only after connection-state merges. The second-editor test runs at 375 and 1280 px and expects the editor to enter without a reload, which needs the waiting page from final-visuals.

- Nothing in production code calls `attemptOf`, `mayWrite`, `commit`, `touch`, `release` or `bootstrap.commit` yet; G3 wires them.
- The runtime test uses a fake room map, not a real socket. The real 4403 close is covered by G3's and G5's tests.
- `services.reservations` shares the server's `now`, so a fake clock passed to `startServer` also moves reservation expiry.
- The projection fallback to the log scan keeps the old trap for documents committed before this feature that have no snapshot before their first projection; only documents with a commit snapshot are immune.
Written by the developer sub-agents when their steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## G5 (developer-5): measurement and E2E

### What changed

- `e2e/room-admission.spec.ts` (new): five tests, one browser context per author through `signedInContext`. They assert HTTP answers on the open route and `data-testid="document-editor"`, never waiting-page copy.
- `docs/features/room-admission/plan.md`: Step 0 evidence and ticks for Steps 19 to 23.

### Step 0 measurement (unchanged tree, built stack with the fake model)

Fixture: `e2e/fixtures/large-docx.ts`, 56,800 paragraphs of plain text, no images, a stored zip of 9,987,294 bytes (9.52 MiB). It is the worst case; an image-heavy file of 9.99 MB sent only 9,989,690 bytes in its largest frame.

| Quantity | Value |
|---|---|
| Frames sent / received on the first sync | 37 / 80 |
| Largest frame sent / received | 36,593,816 / 36,593,816 bytes |
| Cap `MAX_SOCKET_MESSAGE_BYTES` | 41,943,040 bytes (the largest frame is 87 percent of it) |
| Peak frames in a rolling second, sent / received | 26 / 42 (rate cap 120) |
| Open to commit | 40.3 s (reservation is 60 s) |
| Server: encode the room state | 0.6 to 1.5 s, 36,602,228 bytes; applying 24 rows 2.9 s |

The Playwright socket listener sees the worker socket, so no server-side measurement was needed.

## G4: the open route, the agent session and the web ticket

### What changed

- `libs/types/src/routes.ts`: `CREATOR_ATTEMPT_QUERY_KEY` and `CREATOR_EPOCH_QUERY_KEY`, the G3 mirror (8405168). The lead keeps one copy.
- `apps/server/src/documents/documents-routes.ts`: the open route answers `Join` with `creatorAttempt: null, creatorEpoch: null` on a committed room. On an uncommitted room a reader gets 409 `NOT_READY`, an editor calls `runtime.reserveCreator` and gets 200 `Create` with the ticket, or 409 when another user holds a live reservation. Every 409 is logged with the document id (`console.warn`).
- `apps/server/src/agent/agent-sessions.ts`: an uncommitted room throws `AgentToolError` with `DOCUMENT_NOT_READY_ERROR` before `connected()`. The `seed` branch is gone.
- `apps/web/src/features/editor/collaboration-config.ts`: `collaborationUrl({ path, creatorTicket })` appends `?attempt=&epoch=`; `creatorTicketOf` builds the ticket from the open answer. `superdoc-options.ts` takes an optional `creatorTicket`. `use-editor-setup.ts` captures `creatorTicket` in `EditorSetup`. `use-opened-document.ts` gets `staleTime: Infinity`.

## Group G3 (collaboration hooks and socket limits)

### What changed

- `apps/server/src/collaboration/socket-message-limit.ts`: one `SlidingWindow` per socket in a `WeakMap`, `breached(socket)` is true from the 121st frame in a rolling second.
- `apps/server/src/collaboration/attach-collaboration.ts`: `maxPayload` is `MAX_SOCKET_MESSAGE_BYTES`; `terminateOnError` logs and returns early on a CLOSING socket so the 1009 frame is delivered; a `message` listener counts every frame from the first one, before authentication, and on a breach logs without payload, removes the message listeners and closes with 1008 and the reason.
- `apps/server/src/collaboration/collaboration-server.ts`: `onAuthenticate` reads `attempt` and `epoch` from the upgrade URL, refuses an uncommitted room without a matching ticket (log with the document id, permission denied), makes a committed-room socket with a foreign ticket read-only; the `connected` hook closes that socket with 4403; `onChange` fences, commits through `bootstrap.commit` plus `reservations.commit` on the first committed update of the latest attempt, appends and `touch`es otherwise; `onDisconnect` releases when no other connection carries the attempt; `onLoadDocument` restores nothing while uncommitted. `CollaborationContext` is re-exported from here because `client-declarations.ts` imports it from this module.
- `libs/types/src/routes.ts`: `CREATOR_ATTEMPT_QUERY_KEY` and `CREATOR_EPOCH_QUERY_KEY`. `apps/server/src/server.ts`: the two new arguments.
- Test support: `testing/collaboration-client.ts` (`reserveOwner`, ticket registry keyed by cookie and document, `ticket` option, `closed` promise with code and reason, `CollaborationRefusedError.closeCode`), `testing/committed-room.ts` (`commitBootstrap` writes a committed snapshot straight into the log, `waitForCommit`), `agent/agent-tool-fixtures.ts` (`seededDocument` seeds a real committed room through a scratch Hocuspocus, then waits for the first projection).
- Existing tests moved: `collaboration-server.test.ts` (agent, reader and removed-member rows), `collaboration-history.test.ts` (reader, restart), `testing/timeline-client.ts` (`bootstrappedDocument` reserves; three helpers wait for the commit before the next write), `topics-service.test.ts`, `versions-routes.test.ts`, `history-routes.test.ts`, `projection-scheduler.test.ts` (a `waitForCommit` after each `commitBootstrap`), and the two agent files through the seeded fixture.
- `.claude/rules/collaboration.md`: fence, post-commit rule, close codes and both limits.

### How to run

```bash
pnpm exec playwright test room-admission
E2E_SLOW=1 pnpm exec playwright test room-admission
```

`pnpm test:e2e -- room-admission` ignores the filter and runs every spec. `E2E_SLOW=1` enables the 60 s expiry test, which is skipped without it. The stack boots through `playwright.config.ts`, so it needs port 3100 and 3299 free.

### Red today, green after

Failure text is what the run printed on commit `ed459e0`, on the tree before G1 to G4.

| Test (`e2e/room-admission.spec.ts::`) | Red before the change because | Green after because |
|---|---|---|
| `two editors open a fresh document at once and only the first is answered Create` | (first open answer per browser context) `Expected length: 1`, `Received length: 2`, array of two `{"roomMode": "create", "status": 200}` | the second concurrent open is answered 409 |
| `the second editor's open is answered 200 Join once the creator commits` | `Expected: 409`, `Received: 200` on the first open response of the second editor's page | the second editor waits, then the poll sees 200 Join and the reload shows the editor |
| `a creator who closes its tab mid-create leaves no duplicated paragraph for the next editor` | `expect(locator).toBeVisible() failed`, the paragraph never renders in 60 s. The page shows the failed editor with "This collaboration room is structurally invalid and was not opened." | the uncommitted room loads empty, the second editor seeds it and the paragraph appears once |
| `the holder opens a fresh document in two pages at once and the room holds one paragraph` | pin: green today (2 s), so the holder's two pages do not duplicate | pin: stays green with the holder keeping its attempt |
| `a 10 MB DOCX commits and reopens as Join` | pin: green today (1.2 min with the text-dense fixture) | pin: stays green after the payload cap of Step 8 |
| `a creator who goes offline mid-create is replaced by the next editor and leaves one paragraph set` | `Expected: 1`, `Received: null`: after the creator comes back online its text and the second editor's text never converge in 60 s. Runs only with `E2E_SLOW=1` | the superseded creator's late updates are fenced and both pages converge on one paragraph |
| `a superseded creator's socket closes with 4403 after the 60 s expiry` | `closeCode`: expected 4403, received null after the 60 s poll | the takeover closes the old socket with 4403 |

### Hypotheses to attack

1. Hypothesis: only one of two simultaneous opens is answered Create. Break it by: fire the two opens from two contexts in `Promise.all` 50 times on one fresh document each, and count Create answers.
2. Hypothesis: the creator's tab closing releases the reservation, so the next editor needs no wait. Break it by: close the creator's tab during the first sync and open as the second editor within 2 s, inside the store debounce.
3. Hypothesis: a 10 MB DOCX syncs below the cap. Break it by: a DOCX of exactly 10 MiB, and one whose room state is larger than the file (many tracked changes).
4. Hypothesis: a takeover after expiry fences the old creator. Break it by: let the old creator type after 4403, and reload it. Expect 409 until the new creator commits.
5. Hypothesis: the E2E would catch a regression that serves Create twice. Break it by: revert only the 409 branch for editors and confirm the first test goes red.

### Known gaps

- The offline test cannot read the close code of the creator's worker socket. It asserts convergence on one paragraph after the creator returns. A premature pass is possible if the late updates arrive after the poll; the failed banner needs connection-state.
- Step 21 uses the log copy described below, not a page closed on its first sent frame: closing the page at a large sent frame still committed in every probe run.

- Step 21 cannot cut a real creator mid-stream. Chromium runs the collaboration socket in a worker, which `routeWebSocket` does not intercept, and closing the page at the large frame still lets the commit land (all 5 completed probe runs committed). The test copies the log rows that precede the commit of a real creator's document into a fresh document, through `history.sqlite` in `E2E_DATABASE_DIR`. It then opens that document as the second editor. The abandoned prefix is genuine creator output, but the cut is simulated.
- The plan predicted duplicated paragraphs for Step 21. On the current tree the second editor instead meets a room that SuperDoc rejects as structurally invalid, most likely because the creator's bootstrap claim in the room meta stays pending. The review focus about seeding on top of an abandoned partial may not occur the way it is written. The test is red either way and goes green only if the uncommitted room loads empty.
- Step 23 holds the creator with a raw in-page WebSocket that sends only the authentication message, so it does not exercise a real editor tab. It checks that the old socket closes with 4403 and does not check the failed banner.
- `SUPERSEDED_ATTEMPT_CLOSE_CODE` is a local constant in the spec because G1 has not landed in this lane. Replace it with the import from `libs/types` after the merge.
- The spec holds the DOCX generator and the raw socket helper. Moving them to `e2e/` helper files is a mechanical follow-up the lead can order.
- The two-window waiting page at 375 and 1280 px from the spec's E2E list is not covered here, because the waiting page belongs to final-visuals.
pnpm --filter @superdoc-collab/server exec vitest run src/documents/documents-routes.test.ts src/agent/agent-sessions-room.test.ts
pnpm --filter @superdoc-collab/web exec vitest run src/features/editor
pnpm --filter @superdoc-collab/server exec vitest run src/collaboration/collaboration-server.test.ts
pnpm --filter @superdoc-collab/server exec vitest run src/collaboration/attach-collaboration.test.ts
pnpm --filter @superdoc-collab/server exec vitest run src/collaboration/socket-message-limit.test.ts
pnpm typecheck
```

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `documents-routes.test.ts` (four new tests, Steps 15 to 17) | `expected [ 'create', undefined, undefined ] to deeply equal [ 'create', 1, ... ]`; `expected undefined to be 1`; `expected [ 200, ... ] to deeply equal [ 409, { error: 'NOT_READY' } ]`; the committed-room test failed on undefined creator fields (9327ca3) | 7ddab71 |
| `agent-sessions-room.test.ts::an agent opening an uncommitted room ...` (Step 18) | `expected { status: 'ok', ... } to be an instance of AgentToolError` (the call resolved) (f2ba41d) | 7faf94b |
| `collaboration-config.test.ts`, `use-editor-setup.test.ts`, `use-opened-document.test.tsx`, `superdoc-options.test.ts::the options put the creator ticket ...` (Step 18a) | `TypeError: creatorTicketOf is not a function`, `expected 'ws://localhost:3000[object Object]' ...`, `expected undefined to deeply equal { attempt: 1, ... }`, stale query (eaaa5b4) | the web green commit after it |

The four open-route tests share one red and one green commit: the editor 409 is only reachable once the ticket exists, so splitting them would have made Step 16 a pin. The web red commit has no stubs, so `typecheck` is red at that commit and green at the lane tip.

### Hypotheses to attack

1. Hypothesis: two editors opening an uncommitted room at once never both get 200. Break it by: firing both requests in the same tick.
2. Hypothesis: the holder's second open returns the same attempt and epoch and does not extend the expiry. Break it by: an open at 30 s, then another editor at 61 s.
3. Hypothesis: a focus refetch never re-reserves. Break it by: blurring and focusing the tab on a Create room and reading the attempt in the socket URL.
4. Hypothesis: an agent on an uncommitted room is refused before any socket opens and writes nothing. Break it by: an MCP call on a fresh upload.

### Known gaps

- Pending G3's committed-room fixture: `agent-sessions-room.test.ts` (its `beforeAll` and `roomCreatedByOwner`) and `mcp-over-oauth.test.ts` build rooms through `seededDocument`, which relied on the agent seeding the room. They fail with `NOT_READY` until they open a committed room, which needs a real creator because the agent toolkit reads the DOCX content.
- `use-opened-document.ts` also sets `refetchOnMount: 'always'`: with `staleTime: Infinity` alone a cached open answer would never be refetched on mount, which broke `document-page.test.tsx::a cached create followed by a fresh join`. The holder's refetch returns the same ticket.
- Follow-up: `superdoc-editor.tsx` and `document-page.tsx` pass the ticket (6fc34d0 red); `LocatedRoom.filePath` and its wiring are removed; `agent-sessions.test.ts` now pins `a document nobody has opened answers NOT_READY and seeds nothing`.
| `socket-message-limit.test.ts` (3 tests) | `Error: SocketMessageLimit is not implemented` (f950884) | 5b292f3 |
| `attach-collaboration.test.ts::a frame over the payload cap closes with 1009 ...` | `AssertionError: expected 4401 to be 1009` after the 10 s idle timeout (7651bdb) | 5e4458d |
| `attach-collaboration.test.ts::a valid update padded to the cap is accepted` | pin: green when it landed | |
| `attach-collaboration.test.ts::121 frames before authentication ...` | `expected { code: 4401, reason: 'Unauthorized' } to deeply equal { code: 1008, ... }` (ec4910f) | 3c397e6 |
| `attach-collaboration.test.ts::121 valid awareness frames ...` | `Test timed out in 20000ms` (ec4910f) | 3c397e6 |
| `collaboration-server.test.ts::a member is refused ...`, `::an agent room token is refused ...` | `promise resolved "{ document: Doc{ ... } }" instead of rejecting` (1bc4c91) | cf04805 |
| `collaboration-server.test.ts` existing rows (7 tests, for example `accepts a valid session cookie`) | `The collaboration server refused the connection.` (CollaborationRefusedError) at cf04805, because the helper sent no ticket | ae0c62f (4 rows needed the committed-room fixture and moved in the same commit and in bf02863) |
| `collaboration-server.test.ts::a superseded attempt's update is not appended ...`, `::a fenced committing update does not mark the room committed` | `expected [ { sequence: 1, ... } ] to have a length of +0 but got 1` (a5263e4) | 21ae0e3 |
| `::a stale attempt's refusal is logged once ...` | `expected "warn" to be called once, but got 0 times` (a5263e4) | 21ae0e3 |
| `::the committing update is appended once with its snapshot ...` | `expected undefined to be 1` (a5263e4) | 21ae0e3 |
| `::a creator returning after another editor committed is closed with 4403 ...` | `promise resolved "{ document: Doc{ ... } }" instead of rejecting` (4d80f9e). The first half (takeover close of 4403 with the reason) already passed, because `reserveCreator` is G2's | 1543d4b |
| `::the next attempt starts from an empty room ...` | `expected null to deeply equal { attempt: 2, ... }`: the reservation was never released (a0b6f4d) | 9121cba |
| `::a room load after a commit excludes an abandoned partial seed` | `The collaboration server refused the connection.`: the second editor could not reserve (a0b6f4d) | 9121cba |
| `::closing the last tab releases the reservation for another editor` | `expected null not to be null` (a0b6f4d) | 9121cba |
| `::the holder's reconnect is accepted`, `::closing one of two tabs keeps the reservation ...` | pins: green when they landed | |

The step 12 abandoned-partial test failed at the reservation, not at the "received the abandoned paragraph" assertion the plan predicted, so its last assertion was only seen green. A mutation check is left to the tester: make `onLoadDocument` always restore and confirm that test goes red.

### Hypotheses to attack

1. Hypothesis: a socket without a ticket is refused on every uncommitted room, for members, readers and agents, and accepted on every committed room. Break it by: a reader, an agent and a member on a fresh room, then the same after the creator commits; a ticket query with `attempt=0`, `attempt=1.5`, `attempt=abc` or an empty `epoch` must behave as no ticket.
2. Hypothesis: a ticket for another user's attempt is refused on an uncommitted room. Break it by: user B connecting with user A's `attempt` and `epoch`.
3. Hypothesis: after a restart every old ticket is refused (uncommitted) or closed with 4403 (committed). Break it by: restarting the test server on the same database directory with an old `epoch`.
4. Hypothesis: the frame past 120 per second closes with 1008 before authentication and counts awareness frames. Break it by: 120 frames then a pause of 1.1 s then more, two sockets from one client, and a flood after the breach (the log must show one warning).
5. Hypothesis: a frame one byte over `MAX_SOCKET_MESSAGE_BYTES` closes with 1009 and the client sees 1009, never 1006. Break it by: sending it from a real `HocuspocusProvider` and from raw `ws`.
6. Hypothesis: closing one of two tabs of the holder keeps the reservation and another editor still gets `null` from `reserveCreator`. Break it by: three tabs, closing in every order.
7. Hypothesis: the committing update is appended once. Break it by: counting log rows and snapshots after a creator seeds a room and commits.

### Known gaps and notes for the lead

- **Snapshot can be ahead of the commit.** `bootstrap.commit` snapshots the live room when `onChange` runs. If the creator's next edit reaches the server in the same tick as the commit, the snapshot already holds that edit, so the bootstrap version shows it and the projection sees no event for it. The spec accepts a snapshot slightly ahead; I moved the test helpers to `waitForCommit` before the next write. A real creator cannot edit in the same tick as the seed commit.
- **The 121st frame still reaches Hocuspocus.** Node's emitter runs every listener of the breaching `message` event. Later frames are dropped because the listeners are removed. The 121st is a normal frame, so one extra frame can be applied.
- **`onChange` branches on the attempt first.** A socket with an attempt is fenced by `mayWrite` alone; `bootstrap.isCommitted` is reached for an attempt-ful socket only on the update that turns the live marker committed. An attempt-less socket consults the live marker and then the server's answer.
- **A stale ticket on a committed room is accepted by `onAuthenticate` as read-only and closed in the `connected` hook**, because a throw in `onAuthenticate` sends permission-denied without a close code. The client sees the close 4403 or, if the close races the first sync, an authentication failure.
- **`documents-routes.test.ts` (G4's file) has two tests that break under the new rule and were left alone:** `roomMode scans a long log in pages until the first committed bootstrap` needs a wait for the commit before it counts rows, and `delete removes the row, the file, the log and the events, and closes the room` connects the owner of a blank document without a ticket. The second needs the ticket from the open response after G4 reserves in the route.
- **Takeover close is not logged.** The spec says the takeover close is logged with the document id. That close lives in `collaboration-runtime.ts` (G2's file) and has no log line. The 409 log is the route's (G4).
- **Web.** `collaboration-config.ts` must pass `attempt` and `epoch` as socket URL queries from `OpenedDocument.creatorAttempt` and `creatorEpoch`, using `CREATOR_ATTEMPT_QUERY_KEY` and `CREATOR_EPOCH_QUERY_KEY`. It is not in G3's files.
- **`agent-tool-fixtures.ts` builds an `AgentSessions` against a scratch Hocuspocus.** If G4 changes the `AgentSessions` constructor or its create-mode path, the fixture's `commitSeededRoom` needs the same change.
- **Not run:** the full server suite (the throughput rule). Run: the files under `src/agent`, `src/insights`, `src/history`, `src/collaboration` and `src/testing` together once at the end (458 passed, 2 skipped), and `pnpm typecheck` (clean).

### G3 security round (after the security reviewer's findings)

- **One document per socket:** `onConnect` remembers the first document name per upgrade request and throws 1008 with `SOCKET_SINGLE_DOCUMENT_REASON` for any other. The web code never shares a socket between rooms: `collaboration-config.ts` hands SuperDoc one `serverUrl` and one `documentId`, and nothing in `apps/web` builds a shared provider socket. I did not read inside SuperDoc to confirm it opens one socket per room. The version viewer rooms use their own handler. Hypothesis: a second room name on one socket is closed with 1008 before it queues frames.
- **Session check at upgrade:** the browser path calls `readSession` on the request cookie before `handleUpgrade` and destroys the socket without a session. The agent path is not checked there: its room token travels in the first Hocuspocus message, not in an HTTP header, and the path is loopback-only. `attachCollaboration` now takes `auth`, one line added in `server.ts`. Existing raw-socket tests in `attach-collaboration.test.ts` now carry a cookie.
- **Terminate after breach or 1009:** `terminateAfterGrace` terminates a socket still open `SOCKET_CLOSE_GRACE_MS` after `close()`. Unit-tested with fake timers; not tested against a real peer that ignores the close frame. The 121st frame reaches the room handler and none after it does (pinned by a test with a stand-in room handler counting 121 frames).
- **Agent refusal:** an agent on an uncommitted room is refused before any ticket check, also with the owner's valid ticket.
- **Reservation lifetime cap:** `CREATOR_RESERVATION_MAX_MS` is 5 minutes. The constructor takes it as an optional argument defaulting to the constant, so `server.ts` needs no change. Hypothesis: touches every 59 s stop extending at five minutes and the next editor takes over.

### G3 review round

- **Agent seed fixture:** `commitSeededRoom` opens a scratch Hocuspocus with the SDK client in create mode, no `AgentSessions`. `agent-sessions-room.test.ts` and `mcp-over-oauth.test.ts` run green. G4's "uncommitted room seeds nothing" test compares log counts before and after, because the fixture leaves one committed row.
- **Fence:** `isCommitted` for the fence is the live marker or the server's answer. Hypothesis: a member that overwrites `meta.bootstrapState` on a committed room does not stop other members' writes.
- **Scan cache:** `bootstrap.isCommitted` resumes an uncommitted scan after the rows already read. The partial `Y.Doc` of every uncommitted document stays in memory until it commits or is forgotten; the memory is as large as the partial seed. Hypothesis: repeated opens of an uncommitted room read only the new rows.
- **Reservation liveness:** `reserveCreator` calls `touch` for the attempts of connected sockets right before it reserves. The lifetime cap still bounds it, so a holder with a connected socket can be taken over after `CREATOR_RESERVATION_MAX_MS`. The real-socket takeover close is no longer reachable inside the silence window; the takeover close is covered by the runtime unit test with fake connections.
- **Refactor:** `isWriteAllowed` carries the fence pointer, `isAdmittedCreator` names the admission condition, and `CreatorTicket` is imported from `libs/types` on the server.

### G3 second security pass

- **One close timeout:** the socket server now has `closeTimeout: SOCKET_CLOSE_GRACE_MS` and `terminate-after-grace.ts` with its test is deleted. The raw-TCP test sends a first-document frame and a second-document frame with masked frames, never answers the close, and expects the socket gone within five grace periods. Hypothesis: every server close (1008 rate, 1008 one-document, idle 4401, 4403, 1009) frees the socket after about one second. Not tested: the idle close and 4403 against a raw peer.
- **Scan cache budget:** `BOOTSTRAP_SCAN_CACHE_ENTRIES` is 32. Hypothesis: the 33rd uncommitted document evicts the first; an evicted document rescans from sequence 0, the others resume.
- **Lapse cooldown:** a holder whose reservation reached `CREATOR_RESERVATION_MAX_MS` is refused for `CREATOR_RESERVATION_MS`; its held entry is dropped at the lapse, so `attemptOf` no longer answers it. Another editor reserves at once. Hypothesis: the lapsed holder cannot re-open for 60 s but can afterwards, with a new attempt.

### G3 second review round

- **Expired session at the upgrade:** the socket completes the upgrade and is closed with 4401 and `Unauthorized`; Hocuspocus never sees it. A request with no cookie is still destroyed. Hypothesis: the provider reports an authentication failure, not a network drop.
- **Fence cost:** a creator update on an uncommitted room makes no `readBatch` or `latestSnapshot` call (test with spies). The earlier line that said `isCommitted` was reached only for a committed live room was wrong and is replaced above.
- **Connect hook:** no longer touches the reservation; the touch lives in `reserveCreator`.
- **Scan cache:** the entry of a document is dropped once a snapshot answers for it.

### G3 open-route rate limit

- The open route counts, per user, every open of a document whose room is not committed (readers and refused editors included) in a one-minute window; the 61st answers 429 with `Retry-After` and logs the document id. Committed rooms are not counted. Hypothesis: an editor can open a committed room at any rate while 60 uncommitted opens in a minute exhaust the budget; another user is unaffected. The windows live in the route's memory and are never pruned per user.

### G3 third review round

- **Open limit before the scan:** `services.openLimits` is one `KeyedSlidingWindow` (60 per minute) shared by the open route and `onAuthenticate`. Both consult it before any scan unless `isKnownCommitted` says the process already knows the room is committed, and record only after a scan that found the room uncommitted. A creator's open plus its socket authentication costs two entries, and each reconnect costs one. Hypothesis: the 61st uncommitted open or socket of one user in a minute makes no `readBatch` call; another user is unaffected. Gap: the E2E socket count (a create from 10 MB opens one socket, 45 frames) is in the test plan and not run here.
- **MCP rate limit** uses the same `KeyedSlidingWindow`; its tests are unchanged and green. The impossible empty-window default is gone.
- **Session lookup at the upgrade:** a lookup that throws destroys the connection (the provider retries); only a null session closes with 4401 and the reason `Session expired`.
- **Scan cache:** a pin test shows the scan progress is dropped when a snapshot answers.

### G3 fourth review round

- **Distinct-document budget:** `OpenBudget` (in `limits/`) counts a document once per user and minute and replaces `services.openLimits` with `services.openBudget`. `runtime.roomModeFor` (built from `createRoomModes`) is the only way the open route, `onAuthenticate`, the agent room locator (`locateRoom` now takes `{ documentId, userId }`) and the export tool decide a room mode; a spent budget is 429, access denied, or an `AgentToolError` with `OPEN_RATE_LIMITED_MESSAGE`. Hypotheses: 61 opens of one uncommitted document are all 409; the 61st distinct document makes no `readBatch` call on the route, the socket or the export tool. Gap: `runtime.roomMode` (the raw scan) still exists for tests and `waitForCommit`; production code outside `roomModeFor` does not call it.
- **Known committed:** also true when the projection cursor exists, so a restart with a spent budget does not refuse committed rooms.
- **Tests tightened:** the throwing lookup asserts close code 1006; the budget refusal asserts the exact log text.
