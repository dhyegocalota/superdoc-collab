# Test plan: Room admission

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path). Unit and server tests run with `pnpm test:unit`, E2E with `pnpm test:e2e`.

## The failing test first

Each line is one red commit, in plan order. The tester records the text the red run printed.

- [ ] `libs/history/src/document-history.test.ts` `isBootstrapCommitted is true only ...` — input: a Y.Doc whose meta marks the bootstrap committed; expected: `true`. Red: `isBootstrapCommitted is not implemented`.
- [ ] `apps/web/src/testing/opened-document.ts` — input: the type gains `creatorAttempt`; expected: `pnpm typecheck` names the fixture. Red: `Property 'creatorAttempt' is missing`.
- [ ] `apps/server/src/collaboration/creator-reservations.test.ts` `test.each` (7 rows) — input: the state table rows below; expected: each row's outcome. Red: `CreatorReservations is not implemented`.
- [ ] `apps/server/src/collaboration/collaboration-runtime.test.ts` `a takeover closes the superseded creator's socket with 4403 and the reason` — input: attempt 1 connected, then takeover by attempt 2; expected: attempt 1's close code is 4403. Red: `runtime.reserveCreator is not a function`.
- [ ] `apps/server/src/collaboration/bootstrap-state.test.ts` (2 tests) — input: a committed Y.Doc; expected: `isCommitted` true, snapshot row at the commit sequence. Red: `createBootstrapState is not implemented`.
- [ ] `apps/server/src/collaboration/socket-message-limit.test.ts` (2 tests) — input: 121 messages at one instant; expected: the 121st breaches. Red: `SocketMessageLimit is not implemented`.
- [ ] `apps/server/src/collaboration/attach-collaboration.test.ts` `a frame over the payload cap closes with 1009 that the client receives` — input: a binary frame of `MAX_SOCKET_MESSAGE_BYTES + 1` bytes; expected: close code 1009. Red: `Test timed out in 15000ms`.
- [ ] `apps/server/src/collaboration/collaboration-server.test.ts` `a member is refused on an uncommitted room with no attempt` and the agent twin — input: a fresh room, no open; expected: `CollaborationRefusedError`. Red: `promise resolved ... instead of rejecting`.
- [ ] `apps/server/src/collaboration/collaboration-server.test.ts` `a superseded attempt's update is not appended to the log` — input: attempt 1 released, attempt 2 reserved, attempt 1's context in `onChange`; expected: 0 log rows for attempt 1. Red: `expected 0 to equal 1`.
- [ ] `apps/server/src/collaboration/collaboration-server.test.ts` `the next attempt starts from an empty room after the creator closes its tab` — input: attempt 1 writes a paragraph, disconnects, attempt 2 connects; expected: room text empty. Red: `expected the room text to be empty, received the abandoned paragraph`.
- [ ] `apps/server/src/collaboration/collaboration-server.test.ts` `a room load after a commit excludes an abandoned partial seed` — input: partial from attempt 1, seed and commit from attempt 2, reload; expected: the partial's text absent. Red: `expected the abandoned partial to be absent, received it`.
- [ ] `apps/server/src/collaboration/collaboration-server.test.ts` `the 121st message in a second closes with 1008 and is not applied` — input: 121 zero-length awareness frames then one insert; expected: close code 1008, 0 log rows for the insert. Red: `Test timed out in 15000ms`.
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
- [ ] Attempt 1 after takeover — input: `mayWrite` with attempt 1 after the row above; expected: `false`; attempt 2 gives `true`.
- [ ] Release by A, editor B reserves — input: `release({ attempt: 1 })` then B reserves; expected: `2`.
- [ ] `forget`, then reserve — input: `forget` then `reserve` by A; expected: `1`.

Fence, authentication and limits:

- [ ] Stale attempt in `onChange` — input: superseded attempt context; expected: no log row, one `console.warn` for the connection, and a second write from it logs nothing.
- [ ] Committed room accepts any attempt — input: a commit, then an update with attempt 1 after takeover; expected: row appended.
- [ ] Member on uncommitted room, no attempt — input: session cookie, no open; expected: `CollaborationRefusedError`.
- [ ] Agent on uncommitted room, no attempt — input: a valid room token, no open; expected: `CollaborationRefusedError`.
- [ ] 120th message in one second — input: 120 messages at `now`; expected: none breached.
- [ ] 121st message in one second — input: a 121st message at `now`; expected: breached, and the socket closes with 1008 and `Too many messages per second`.
- [ ] Rate breach log — input: the 121st message; expected: one `console.warn` with the document id, no payload bytes.
- [ ] Frame over the cap — input: `MAX_SOCKET_MESSAGE_BYTES + 1` bytes; expected: close 1009, and no document id in that log line.
- [ ] Frame at the cap is accepted — input: a frame of exactly `MAX_SOCKET_MESSAGE_BYTES`; expected: not closed.
- [ ] Edge: uncommitted empty room — input: close the last connection of an uncommitted room; expected: `unloadDocument` called.
- [ ] Edge: restart — input: a fresh server, the old attempt reconnects; expected: `CollaborationRefusedError`, as the spec's restart failure mode.

Route answers (`documents-routes.test.ts`):

- [ ] Editor, fresh room — input: GET open; expected: 200, `roomMode` create, `creatorAttempt` 1.
- [ ] Second editor, live reservation — input: GET open; expected: 409 `NOT_READY`.
- [ ] Reader, live reservation — input: GET open; expected: 409 `NOT_READY`.
- [ ] Editor, committed room — input: GET open; expected: 200, `roomMode` join, `creatorAttempt` null.
- [ ] Agent, uncommitted — input: agent open; expected: `NOT_READY`, nothing seeded.

## E2E (`e2e/room-admission.spec.ts`, two browsers)

Assertions use `data-testid` and HTTP answers, not waiting-page text.

- [ ] Two editors open a fresh document at once, at 375 and at 1280 — steps: both sign in and open one new document within one second; expected: one open answers 200 `create`, the other answers 409, and then the other answers 200 `join` once the creator commits.
- [ ] Creator closes its tab mid-create — steps: creator types one paragraph, closes its page before the commit, the next editor opens; expected: the next editor's open answers 200 `create`, and the document holds one paragraph, not two.
- [ ] 10 MB DOCX commits — steps: upload the near-10 MB file from Step 0 and wait for the commit; expected: the second editor's open answers `join`, the banner never stays on reconnecting, and the largest frame is below `MAX_SOCKET_MESSAGE_BYTES`.
- [ ] Expiry takeover (manual dispatch only, about 60 s) — steps: creator stops without closing, second editor opens after 60 s; expected: the old creator's socket closes with 4403 and the second editor's open answers `create` with attempt 2.

## Prove it for real: Playwright MCP

Two authors use the `playwright` and `playwright-second` servers, one browser each (ADR 0023). Every walk checks console and network.

- [ ] Waiting page at 320, 375, 768, 1024, 1280, 1536, 1920 and 2560 px — input: second editor on a fresh document while the first creates; expected: no horizontal scroll, no clipped control, no layout jump; one screenshot per width at `.pr-media/room-admission/waiting-<width>.png`.
- [ ] Upload path at 375 px and 1280 px — input: the near-10 MB DOCX; expected: the upload finishes and the editor opens with the title.
- [ ] Failed banner for a superseded creator — input: the first creator is taken over after expiry; expected: the banner shows failed with Reload, and Reload answers 409 until the new creator commits. Screenshot at `.pr-media/room-admission/failed-banner.png`. This needs the connection-state banner.
- [ ] Console and network clean — expected: zero console errors and zero failed requests during every walk, except the expected 409 answers.

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case, with its input, exact expected outcome and a regression test.

## Adversarial review

- [ ] Claim 1: an uncommitted room with no connections is unloaded, so no partial leaks into the next attempt — attack: a creator writes, disconnects, and a second editor opens within the store debounce; result: refuted | held.
- [ ] Claim 2: `connection.close()` inside `beforeHandleMessage` does not stop the message — attack: call it at the 121st message and check the log; result: refuted | held.
- [ ] Claim 3: a 1009 frame reaches the client as 1009 — attack: send one frame of cap plus one byte through a real socket; result: refuted | held.

## Coverage honesty

- The 60 s expiry path runs only in manual E2E dispatch. Its takeover logic is also covered by the unit state table, not by timing.
- Multi-instance coordination is out of scope. The reservation lives in one process, as the spec decides.
- The waiting page and the failed banner are checked by their own features. This feature checks the network answers and the state, not their text, until those features merge.
- Agents never create a room, so no test covers an agent-first open.
- The rate count is per Hocuspocus connection. A client that opens many sockets multiplies its budget, which is bounded only by authentication.
