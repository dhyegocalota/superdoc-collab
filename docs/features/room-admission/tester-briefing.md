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
pnpm --filter @superdoc-collab/server exec vitest run src/collaboration/collaboration-server.test.ts
pnpm --filter @superdoc-collab/server exec vitest run src/collaboration/attach-collaboration.test.ts
pnpm --filter @superdoc-collab/server exec vitest run src/collaboration/socket-message-limit.test.ts
pnpm typecheck
```

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
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
- **`onChange` calls `bootstrap.isCommitted` only when the live room is already committed and the socket claims an attempt**, so an uncommitted creator does not trigger a log scan per update. The fence passes `isBootstrapCommitted({ document })` as `isCommitted`.
- **A stale ticket on a committed room is accepted by `onAuthenticate` as read-only and closed in the `connected` hook**, because a throw in `onAuthenticate` sends permission-denied without a close code. The client sees the close 4403 or, if the close races the first sync, an authentication failure.
- **`documents-routes.test.ts` (G4's file) has two tests that break under the new rule and were left alone:** `roomMode scans a long log in pages until the first committed bootstrap` needs a wait for the commit before it counts rows, and `delete removes the row, the file, the log and the events, and closes the room` connects the owner of a blank document without a ticket. The second needs the ticket from the open response after G4 reserves in the route.
- **Takeover close is not logged.** The spec says the takeover close is logged with the document id. That close lives in `collaboration-runtime.ts` (G2's file) and has no log line. The 409 log is the route's (G4).
- **Web.** `collaboration-config.ts` must pass `attempt` and `epoch` as socket URL queries from `OpenedDocument.creatorAttempt` and `creatorEpoch`, using `CREATOR_ATTEMPT_QUERY_KEY` and `CREATOR_EPOCH_QUERY_KEY`. It is not in G3's files.
- **`agent-tool-fixtures.ts` builds an `AgentSessions` against a scratch Hocuspocus.** If G4 changes the `AgentSessions` constructor or its create-mode path, the fixture's `commitSeededRoom` needs the same change.
- **Not run:** the full server suite (the throughput rule). Run: the files under `src/agent`, `src/insights`, `src/history`, `src/collaboration` and `src/testing` together once at the end (458 passed, 2 skipped), and `pnpm typecheck` (clean).
