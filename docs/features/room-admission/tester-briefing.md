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

- Nothing in production code calls `attemptOf`, `mayWrite`, `commit`, `touch`, `release` or `bootstrap.commit` yet; G3 wires them.
- The runtime test uses a fake room map, not a real socket. The real 4403 close is covered by G3's and G5's tests.
- `services.reservations` shares the server's `now`, so a fake clock passed to `startServer` also moves reservation expiry.
- The projection fallback to the log scan keeps the old trap for documents committed before this feature that have no snapshot before their first projection; only documents with a commit snapshot are immune.

## G4: the open route, the agent session and the web ticket

### What changed

- `libs/types/src/routes.ts`: `CREATOR_ATTEMPT_QUERY_KEY` and `CREATOR_EPOCH_QUERY_KEY`, the G3 mirror (8405168). The lead keeps one copy.
- `apps/server/src/documents/documents-routes.ts`: the open route answers `Join` with `creatorAttempt: null, creatorEpoch: null` on a committed room. On an uncommitted room a reader gets 409 `NOT_READY`, an editor calls `runtime.reserveCreator` and gets 200 `Create` with the ticket, or 409 when another user holds a live reservation. Every 409 is logged with the document id (`console.warn`).
- `apps/server/src/agent/agent-sessions.ts`: an uncommitted room throws `AgentToolError` with `DOCUMENT_NOT_READY_ERROR` before `connected()`. The `seed` branch is gone.
- `apps/web/src/features/editor/collaboration-config.ts`: `collaborationUrl({ path, creatorTicket })` appends `?attempt=&epoch=`; `creatorTicketOf` builds the ticket from the open answer. `superdoc-options.ts` takes an optional `creatorTicket`. `use-editor-setup.ts` captures `creatorTicket` in `EditorSetup`. `use-opened-document.ts` gets `staleTime: Infinity`.

### How to run

```bash
pnpm --filter @superdoc-collab/server exec vitest run src/documents/documents-routes.test.ts src/agent/agent-sessions-room.test.ts
pnpm --filter @superdoc-collab/web exec vitest run src/features/editor
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
