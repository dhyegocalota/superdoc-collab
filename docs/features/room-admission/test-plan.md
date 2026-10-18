# Test plan: Room admission

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path). Unit and server tests run with `pnpm test:unit`, E2E with `pnpm test:e2e`.

## The failing test first

Each line is one red commit, in plan order. The tester records the text the red run printed.

- [ ] `libs/history/src/document-history.test.ts` `isBootstrapCommitted is true only ...` — input: a Y.Doc whose meta marks the bootstrap committed; expected: `true`. Red: `isBootstrapCommitted is not implemented`.
- [ ] `apps/web/src/testing/opened-document.ts` — input: the type gains `creatorAttempt` and `creatorEpoch`; expected: `pnpm typecheck` names the fixture. Red: `Property 'creatorAttempt' is missing`.
- [ ] `apps/server/src/collaboration/creator-reservations.test.ts` `test.each` — input: the state table rows below; expected: each row's outcome. Red: `CreatorReservations is not implemented`.
- [ ] `apps/server/src/collaboration/collaboration-runtime.test.ts` `a takeover closes the superseded creator's socket with 4403 and the reason` — input: attempt 1 connected, then takeover by attempt 2; expected: attempt 1's close code is 4403. Red: `runtime.reserveCreator is not a function`.
- [ ] `apps/server/src/collaboration/bootstrap-state.test.ts` (3 tests) — input: a committed Y.Doc, and a log where an abandoned client 900 and the winner 100 both wrote `meta.bootstrapState`; expected: `isCommitted` true from the latest committed snapshot, snapshot row at the commit sequence. Red: `createBootstrapState is not implemented` and `expected the commit to be found, received none`.
- [ ] `libs/history/src/projection.test.ts` `a commit hidden by an abandoned client with a higher client id is still found` — input: client ids 900 (abandoned) and 100 (winner); expected: `projectPending` starts from the committed snapshot. Red: `expected the commit to be found, received none`.
- [ ] `apps/server/src/collaboration/socket-message-limit.test.ts` (2 tests) — input: 121 messages at one instant; expected: the 121st breaches. Red: `SocketMessageLimit is not implemented`.
- [ ] `apps/server/src/collaboration/attach-collaboration.test.ts` `a frame over the payload cap closes with 1009 that the client receives` — input: a binary frame of `MAX_SOCKET_MESSAGE_BYTES + 1` bytes; expected: close code 1009. Red: `Test timed out in 15000ms`.
- [ ] `apps/server/src/collaboration/attach-collaboration.test.ts` `121 frames before authentication close with 1008` and `121 valid awareness frames close with 1008 and the reason` — input: 121 frames from the first one; expected: close code 1008. Red: `Test timed out in 15000ms`.
- [ ] `apps/server/src/collaboration/collaboration-server.test.ts` `a member is refused on an uncommitted room with no attempt` and the agent twin — input: a fresh room, no open; expected: `CollaborationRefusedError`. Red: `promise resolved ... instead of rejecting`.
- [ ] `apps/server/src/collaboration/collaboration-server.test.ts` `a superseded attempt's update is not appended to the log` — input: attempt 1 released, attempt 2 reserved, attempt 1's context in `onChange`; expected: 0 log rows for attempt 1. Red: `expected 0 to equal 1`.
- [ ] `apps/server/src/collaboration/collaboration-server.test.ts` `the next attempt starts from an empty room after the creator closes its tab` — input: attempt 1 writes a paragraph, disconnects, attempt 2 connects; expected: room text empty. Red: `expected the room text to be empty, received the abandoned paragraph`.
- [ ] `apps/server/src/collaboration/collaboration-server.test.ts` `a room load after a commit excludes an abandoned partial seed` — input: partial from attempt 1, seed and commit from attempt 2, reload; expected: the partial's text absent. Red: `expected the abandoned partial to be absent, received it`.
- [ ] `apps/server/src/collaboration/collaboration-server.test.ts` `a creator returning after another editor committed is closed with 4403 and writes nothing` — input: attempt 1 offline, attempt 2 commits, attempt 1 returns with its attempt and epoch; expected: close code 4403, 0 new log rows. Red: `expected the socket to close with 4403, received it open`.
- [ ] `apps/server/src/documents/documents-routes.test.ts` `the first editor to open a fresh room is reserved as creator with attempt 1` — input: editor GET open, then holder GET again; expected: `creatorAttempt` 1 both times, status 200. Red: `expected undefined to be 1`.
- [ ] `apps/server/src/documents/documents-routes.test.ts` `a second editor opening a live reservation gets 409 NOT_READY` — input: a second editor GET open; expected: 409 with `{ error: 'NOT_READY' }`. Red: `expected 200 to equal 409`.
- [ ] `apps/server/src/documents/documents-routes.test.ts` `a committed room answers Join with creatorAttempt null` — input: committed room, reader and editor GET open; expected: 200, `roomMode` join, `creatorAttempt` null. Red: `expected undefined to be null`.
- [ ] `apps/server/src/agent/agent-sessions-room.test.ts` `an agent opening an uncommitted room is answered NOT_READY and seeds nothing` — input: uncommitted room, agent open; expected: rejects with `NOT_READY`, no room seeded. Red: `promise resolved instead of rejecting`.

## Unit

Reservation state table (`creator-reservations.test.ts`, one `test.each`):

- [ ] Unreserved, editor A reserves — input: `reserve({ documentId, userId: A })`; expected: `1`.
- [ ] Live holder A, editor B reserves — input: B reserves within the window; expected: `null`.
- [ ] Holder A reserves again — input: A reserves at `now + 10 s`; expected: `1`, and the expiry is unchanged.
- [ ] Expired holder A, editor B reserves — input: B reserves at `now + reservationMs`; expected: `2`.
- [ ] Attempt 1 after takeover — input: `mayWrite` with attempt 1 after the step above; expected: `false`; attempt 2 gives `true`.
- [ ] Release by A, editor B reserves — input: `release({ attempt: 1 })` then B reserves; expected: `2`.
- [ ] `forget`, then reserve — input: `forget` then `reserve` by A; expected: `1`.

Fence, authentication and limits:

- [ ] Stale attempt in `onChange` — input: superseded attempt context; expected: no log row, one `console.warn` for the connection, a second write from it logs nothing.
- [ ] Fenced committing update — input: a superseded attempt sends the committing update; expected: not appended, and the room is not marked committed.
- [ ] Order in `onChange` — input: a committing update from the latest attempt; expected: appended, then `isBootstrapCommitted({ document })`, then `commit` with the appended sequence, the append and snapshot in one transaction, then `reservations.commit` records the committing attempt.
- [ ] Expiry refresh — input: an appended update at 50 s; expected: `expiresAt` moves to 110 s, and a second editor opening at 70 s gets 409.
- [ ] Connected-liveness takeover rule, `collaboration-runtime.test.ts` `a holder with a connected socket is not taken over when the silence timer has run out` — input: the holder's socket is connected, `CREATOR_RESERVATION_MS + 1` passes with no update, a second editor reserves; expected: `null`, and the holder's socket is not closed. Red: tester records.
- [ ] Takeover once the last socket is gone, `collaboration-runtime.test.ts` `a takeover happens once the last socket is gone and the silence timer has run out` — input: no connected socket, `CREATOR_RESERVATION_MS + 1` passes, a second editor reserves; expected: `{ attempt: 2, epoch }`. Red: tester records.
- [ ] ~~A connected socket refreshes its reservation, `collaboration-server.test.ts` — input: the owner connects with its ticket; expected: `touch` called with `{ documentId, attempt: 1 }`. Red: tester records.~~ Struck: the touch moved from the `connected` hook into `reserveCreator`, which touches every connected attempt right before it reserves; the runtime row above covers it.
- [ ] Lifetime cap, `creator-reservations.test.ts` `touches at 59 second intervals stop extending after the lifetime cap and the next editor takes over` — input: one touch every `CREATOR_RESERVATION_MS - SECOND_MS` until `CREATOR_RESERVATION_MAX_MS` has passed, then one more interval, then a second editor reserves; expected: attempt 2. Red: tester records.
- [ ] Lapse cooldown, `creator-reservations.test.ts` `a holder whose reservation lapsed at the lifetime cap is refused for one reservation period while another editor takes over` — input: the holder reserves at 0, tries again at `CREATOR_RESERVATION_MAX_MS + 1` and again `CREATOR_RESERVATION_MS - 1` later, then a second editor reserves; expected: `null`, `null`, then attempt 2. Red: tester records.
- [ ] Lapsed holder reserves again after the cooldown, `creator-reservations.test.ts` `the lapsed holder reserves again once the cooldown has passed and nobody took over` — input: the holder lapses at the cap, `CREATOR_RESERVATION_MS + 1` passes, the holder reserves; expected: attempt 2. Red: tester records.
- [ ] Open limit, `documents-routes.test.ts` `the 61st distinct uncommitted document opened by one user within a minute answers 429 and another user is still served` and `the 61st distinct uncommitted document makes no query to the log` — input: 60 distinct uncommitted documents opened by one user, then a 61st; expected: 429 with `Retry-After`, zero `readBatch` calls, and an editor of the first document still answered 409.
- [ ] Open limit at the socket, `collaboration-server.test.ts` `a user who exhausted the open budget is refused before the log is scanned` — input: the budget of the user spent, then a creator socket with its ticket; expected: refused with the document id logged and zero `readBatch` calls.
- [ ] Distinct-document budget, `documents-routes.test.ts` `a waiting editor polling the same uncommitted document is answered 409 every time, never 429` and `open-budget.test.ts` — input: 61 opens of one uncommitted document by an editor; expected: 409 each time. The budget counts a document once per user and minute.
- [ ] Agent-path guard, `agent-document-tools.test.ts` `export_docx with the open budget spent is refused before any log scan` — input: the budget of the user spent, then `export_docx`; expected: a tool error, zero `readBatch` calls, no save and no recorded action.
- [ ] Known committed by cursor, `bootstrap-state.test.ts` `a room with a projection cursor is known committed without reading the log` — input: a projection cursor exists for the document and the process never scanned it; expected: `isKnownCommitted` true and zero `readBatch` calls.
- [ ] Agent session path, `agent-sessions-room.test.ts` `opening a session with the open budget spent is refused before any log scan and any client open` — input: the budget of a user spent, then `AgentSessions.run` on an uncommitted document; expected: a tool error with the rate-limited message, zero `readBatch` calls and zero `client.open` calls.
- [ ] Expired pairs, `open-budget.test.ts` `a pair past the window is forgotten at the next record` — input: a pair recorded, the window passes, another pair recorded; expected: one pair tracked.
- [ ] Throwing session lookup, `attach-collaboration.test.ts` `a session lookup that throws destroys the connection instead of closing with 4401` — input: `getSession` rejects; expected: close code 1006 and no call to Hocuspocus.
- [ ] Expired-session reason, `attach-collaboration.test.ts` `a browser whose session expired is closed with 4401 and never reaches Hocuspocus` — expected: code 4401 and reason `Session expired`.
- [ ] Scan-drop pin, `bootstrap-state.test.ts` `the scan progress of a document is dropped once a snapshot answers for it` — pin: green when it landed.
- [ ] E2E socket count — input: a creator creates from a 10 MB DOCX with the browser's socket counted; expected: one socket carries the create (45 frames measured in the first sync), the open budget is not exhausted and no 429 shows.
- [ ] Takeover close log after the cap, `collaboration-runtime.test.ts` `a takeover close is logged with the document id and the superseded attempt` — input: attempt 1's socket connected, the first editor reserves, then `CREATOR_RESERVATION_MAX_MS + 1` passes and a second editor reserves; expected: no `console.warn` before the takeover, then one containing the document id and `attempt 1`. Red: tester records.
- [ ] Commit clears the reservation — input: the committing update; expected: the reservation record is gone and the room answers Join.
- [ ] Holder reconnect — input: the holder's socket closes and reconnects with its ticket on the uncommitted room; expected: accepted, also after a 1008 close.
- [ ] Two tabs — input: the holder opens two sockets and closes one; expected: the reservation stays and another editor still gets 409; closing the last releases it.
- [ ] Post-commit fence — input: a socket with attempt 1 after attempt 2 committed; expected: closed 4403. A socket with no attempt is accepted, and so is the committing attempt in this epoch.
- [ ] Logs carry the document id — input: an `onAuthenticate` refusal, a 409 and a takeover close; expected: each logs the document id and no payload.
- [ ] Committed room accepts a Join socket and the committing attempt only — input: a commit by attempt 2, then an update from a socket with no attempt and one from attempt 1; expected: the attempt-less row is appended and the attempt-1 socket is closed with 4403 (post-commit fence). Was: 'accepts any attempt … row appended.
- [ ] Member on uncommitted room, no attempt — input: session cookie, no open; expected: `CollaborationRefusedError`.
- [ ] Agent on uncommitted room, no attempt — input: a valid room token, no open; expected: `CollaborationRefusedError`.
- [ ] Agent refused before any ticket check, `collaboration-server.test.ts` `an agent is refused on an uncommitted room even with the owner's valid ticket` — input: the agent path connects with the owner's `attempt` and `epoch` on an uncommitted room; expected: `CollaborationRefusedError`, logged with the document id. Red: tester records.
- [ ] Creator update never reads the log, `collaboration-server.test.ts` `a creator update on an uncommitted room never queries the log or the snapshots` — input: the latest attempt sends an uncommitted update with `readBatch` and `latestSnapshot` spied; expected: one log row, zero `readBatch` calls and zero `latestSnapshot` calls. Red: tester records.
- [ ] Marker-overwrite fence, `collaboration-server.test.ts` `a member overwriting the room's bootstrap marker does not stop later Join writes` — input: a committed room, one editor sets `meta.bootstrapState` to `pending`, another editor then writes text; expected: the second editor's update is appended, because the fence takes the server's commit answer. Red: tester records.
- [ ] One document per socket, `attach-collaboration.test.ts` `a frame for a second document on one socket closes it with 1008` — input: a valid update frame for document A, then one for document B on the same socket; expected: close code 1008 with reason `One document per socket`, logged with the document id. Red: tester records.
- [ ] Upgrade without a session cookie, `attach-collaboration.test.ts` `a browser upgrade without a session cookie is destroyed before it reaches Hocuspocus` — input: a browser-path upgrade request with no cookie; expected: an empty response and `handleConnection` never called. Red: tester records.
- [ ] Upgrade with an expired session, `attach-collaboration.test.ts` `a browser whose session expired is closed with 4401 and never reaches Hocuspocus` — input: a signed-in cookie whose session row was deleted, then an upgrade; expected: close code 4401 with reason `Unauthorized`, `handleConnection` never called, so no frame reaches Hocuspocus. Red: tester records.
- [ ] Terminate after the grace, `attach-collaboration.test.ts` `a server close that the peer ignores destroys the socket within the grace period` — input: a raw TCP peer completes the upgrade, sends frames for two documents and never answers the close frame; expected: the socket is destroyed within `5 * SOCKET_CLOSE_GRACE_MS`. The same `closeTimeout` bounds every server-initiated close. Red: tester records.
- [ ] Breach frame, `attach-collaboration.test.ts` `the frame that breaches the limit reaches the room handler and nothing after it does` — input: `MAX_SOCKET_MESSAGES_PER_SECOND + 10` one-byte frames sent at once on an authenticated socket; expected: close code 1008 and the room handler called exactly `MAX_SOCKET_MESSAGES_PER_SECOND + 1` times, the breaching frame included and nothing after it. This is a pin. Red: tester records.
- [ ] Commit scan resumes, `bootstrap-state.test.ts` `an uncommitted answer resumes the scan after the rows it already read` — input: three non-committing rows scanned, then a committing row appended at sequence 4; expected: `isCommitted` true and exactly one `readBatch` call with `afterSequence` 3. Red: tester records.
- [ ] LRU eviction, `bootstrap-state.test.ts` `the scan progress of the 33rd uncommitted document evicts the first` — input: 33 uncommitted documents scanned once, then the first and the last asked again; expected: `readBatch` calls `[first, 0]`, `[first, 1]`, `[last, 33]`, so the first rescans from the start and the last resumes. Red: tester records.
- [ ] 120th message in one second — input: 120 messages at `now`; expected: none breached.
- [ ] 121st message in one second — input: a 121st message at `now`; expected: breached, and the socket closes with 1008 and `Too many messages per second`.
- [ ] 121 frames before authentication — input: 121 frames from the first one; expected: the socket closes with 1008.
- [ ] Rate breach log — input: the 121st frame; expected: one `console.warn` with no payload bytes.
- [ ] Frame over the cap — input: `MAX_SOCKET_MESSAGE_BYTES + 1` bytes; expected: close 1009, and no document id in that log line.
- [ ] A valid update padded to the cap is accepted — input: a valid Yjs update padded to exactly `MAX_SOCKET_MESSAGE_BYTES`; expected: not closed and applied.
- [ ] Edge: uncommitted empty room — input: the creator closes its tab, the next attempt connects; expected: the room is empty, the abandoned paragraph is not loaded.
- [ ] Edge: restart — input: a fresh server, the old attempt reconnects; expected: `CollaborationRefusedError`, as the spec's restart failure mode.

Route answers (`documents-routes.test.ts`):

- [ ] Editor, fresh room — input: GET open; expected: 200, `roomMode` create, `creatorAttempt` 1, `creatorEpoch` set.
- [ ] Second editor, live reservation — input: GET open; expected: 409 `NOT_READY`, and one log line with the document id.
- [ ] Reader, live reservation — input: GET open; expected: 409 `NOT_READY`.
- [ ] Editor, committed room — input: GET open; expected: 200, `roomMode` join, `creatorAttempt` and `creatorEpoch` null.
- [ ] Agent, uncommitted — input: agent open; expected: `NOT_READY`, nothing seeded.

## E2E (`e2e/room-admission.spec.ts`, two browsers)

Assertions use `data-testid` and HTTP answers, not waiting-page text.

- [ ] Two editors open a fresh document at once, at 375 and at 1280 — steps: both sign in and open one new document within one second; expected: counting Create answers per browser context, one open answers 200 `create` and the other answers 409, and then the other answers 200 `join` once the creator commits, polled through the test's request context.
- [ ] Creator closes its tab mid-create — steps: creator types one paragraph, closes its page on the first sent frame of the large fixture before the commit, the next editor opens; expected: the next editor's open answers 200 `create`, and the document holds one paragraph, not two. Without the large fixture this box is a `pin`.
- [ ] Creator offline mid-create, another editor commits, creator returns — steps: creator goes offline after a partial, the next editor takes over after expiry and commits, the creator returns; expected: the creator's socket closes with 4403, the document holds one paragraph set, and the room still opens.
- [ ] Holder opens two pages within one second — steps: the creator opens the same document in two pages; expected: one paragraph. If it duplicates, the rule becomes 409 while a socket of that attempt is connected.
- [ ] 10 MB DOCX commits — steps: upload the near-10 MB file from `e2e/fixtures/large-docx.ts` and wait for the commit; expected: the second editor's open answers `join`, the banner never stays on reconnecting, and the largest frame is below `MAX_SOCKET_MESSAGE_BYTES`.
- [ ] Expiry takeover (manual dispatch only, about 60 s) — steps: creator stops without closing, second editor opens after 60 s; expected: the old creator's socket closes with 4403 and the second editor's open answers `create` with attempt 2.

## Prove it for real: Playwright MCP

Two authors use the `playwright` and `playwright-second` servers, one browser each (ADR 0023). Every walk checks console and network.

- [ ] Waiting page at 320 px, 375 px, 768 px, 1024 px, 1280 px, 1536 px, 1920 px and 2560 px — input: second editor on a fresh document while the first creates; expected: no horizontal scroll, no clipped control, no layout jump; screenshot per width at `.pr-media/room-admission/waiting-<width>.png`.
- [ ] Upload path at 375 px and 1280 px — input: the near-10 MB DOCX; expected: the upload finishes and the editor opens with the title.
- [ ] Failed banner for a superseded creator — input: the first creator is taken over after expiry; expected: the banner shows failed with Reload, and Reload answers 409 until the new creator commits. Screenshot at `.pr-media/room-admission/failed-banner.png`. This needs the connection-state banner.
- [ ] Console and network clean — expected: zero console errors and zero failed requests during every walk, except the expected 409 answers.

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case, with its input, exact expected outcome and a regression test.

## Adversarial review

- [ ] Claim 1: the next attempt starts from an empty room, so no partial leaks — attack: a creator writes, disconnects, and a second editor opens at once; result: refuted | held.
- [ ] Claim 2: snapshot-first commit detection survives a concurrent write of `meta.bootstrapState` from a higher client id — attack: client ids 900 and 100 in the log; result: refuted | held.
- [ ] Claim 3: a 1009 frame reaches the client as 1009 — attack: send one frame of cap plus one bytes through a real socket; result: refuted | held.

## Coverage honesty

- The 60 s expiry path runs only in manual E2E dispatch. Its takeover logic is also covered by the unit state table, not by timing.
- Multi-instance coordination is out of scope. The reservation lives in one process, as the spec decides.
- The waiting page and the failed banner are checked by their own features. This feature checks the network answers and the state, not their text, until those features merge.
- Agents never create a room, so no test covers an agent-first open.
- The rate count is per Hocuspocus connection. A client that opens many sockets multiplies its budget, which is bounded by the session check at the upgrade, authentication and one document per socket.
