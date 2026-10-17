# Room admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [spec.md](spec.md), Approved, tier 🔴. Decisions in [ADR 0033](../../adr/0033-one-creator-per-room-reservation-with-per-attempt-write-fencing.md) and [ADR 0034](../../adr/0034-collaboration-socket-payload-and-rate-limits.md).

**Goal:** the first editor who opens a fresh document is its only creator, every other editor and reader waits for the commit, and the collaboration socket refuses oversized frames and floods.

**Architecture:** an in-memory `CreatorReservations` record per document, checked by the open route, by socket authentication and by the update fence. A commit snapshot of the live room is the start point of later loads, and commit detection reads the latest committed snapshot first. The attempt and a per-process epoch travel with the socket as URL queries. The `ws` layer caps the frame size and counts frames per socket with one `SlidingWindow`.

**Tech Stack:** Hocuspocus 2.15.3, ws 8.22.0, Yjs 13.6.33, the SQLite update log in `libs/history`, Hono, Vitest, Playwright.

**Tier:** 🔴. Expected merge sensitivity HIGH: collaboration, update log, sockets.

**Seam:** `UpdateLog.append` and `CollaborationContext` (identity and fence), the hooks of `createCollaborationServer`, the open route in `documents-routes.ts`, the agent open in `agent-sessions.ts`, and the `ws` server in `attach-collaboration.ts`.

## Global Constraints

- `CREATOR_RESERVATION_MS = MINUTE_MS` (60 s). `MAX_SOCKET_MESSAGES_PER_SECOND = 120`.
- `MAX_SOCKET_MESSAGE_BYTES = SOCKET_MESSAGE_UPLOAD_MULTIPLE * MAX_UPLOAD_BYTES`, with `SOCKET_MESSAGE_UPLOAD_MULTIPLE = 8` (raised from 4 after Step 0) (40 MiB).
- `POLICY_VIOLATION_CLOSE_CODE = 1008`, `SUPERSEDED_ATTEMPT_CLOSE_CODE = 4403`, `SOCKET_RATE_LIMIT_REASON = 'Too many messages per second'`, `SUPERSEDED_ATTEMPT_REASON = 'This attempt was superseded'`. A payload breach keeps `ws`'s 1009.
- Constants go in `libs/types/src/constants.ts` and `libs/types/src/documents.ts`. Reuse `SECOND_MS` and `MINUTE_MS`; never redeclare them.
- Logs use `console.warn` or `console.error` with a message constant, the document id and `describeError`, as the insights services do. Never log a payload.
- Red first: each red test is its own commit before its implementation. A stub may throw `<name> is not implemented`. Run `pnpm exec prettier --write` on staged files.
- Code: no comments except `// NB ADR` pointers, no `??`, flat `if`s, no `else`, no `.js` in imports, named parameters for more than one argument, array methods over loops.
- Never `git add -A`. Lane branches merge, never rebase. Commit and push only when the owner asks.

## Review Focus

1. A connection whose update reached the in-memory room before takeover leaves its partial there, so the next creator seeds on top of it. Pinned by Step 12.
2. A creator closes its tab and another editor opens at once, so the new attempt must start from an empty room. Hocuspocus 2.15.3 unloads an empty room immediately, so no manual unload exists. Pinned by Step 12.
3. An abandoned client with a higher client id writes `meta.bootstrapState` concurrently, so a from-zero replay hides the winner's commit. Pinned by Steps 5 and 6a.
4. `ws` sends 1009 and then emits `error`, and `terminateOnError` destroys the socket before the close frame is delivered. The early return for CLOSING sockets is pinned by Step 8.
5. A second tab of the holder keeps its attempt and the reservation, while another user gets 409. Pinned by Step 15.
6. A creator that returns after another editor committed carries a stale attempt on a committed room. Pinned by Step 11b.
7. The holder opens two pages within one second and both seed from one attempt. Pinned by Step 21b.

## Assumptions (decided, owner can override)

- Limits apply per `ws` socket. One editor socket carries one document.
- The rate count includes every frame from the first one, before authentication and awareness included.
- Expiry means 60 s of silence: every appended update from the latest attempt calls `touch`.
- `reserve` returns `{ attempt, epoch }` with a per-process `epoch`. The web passes both as socket URL queries (`collaboration-config.ts`), and `mayWrite` on a committed room accepts only a socket with no attempt or the attempt that committed in this epoch.
- Release happens when the last connection of the holder's attempt closes. `attemptOf` keeps answering the holder until another editor reserves after expiry.
- The commit snapshot uses the existing `UpdateLog.writeSnapshot`. The spec's new `UpdateLog.snapshot` would duplicate it, so it is not added.
- The commit snapshot holds the live room's state (`Y.encodeStateAsUpdate(document)`), not a `materialize` from the log. The log still holds the abandoned partials, so only the live room is clean.
- `SocketMessageLimit` and `CreatorReservations` take `{ now }`, as `KeyedCooldown` does, so unit tests inject time.
- No manual unload: Hocuspocus 2.15.3 `unloadImmediately` defaults to true.
- `documentWithOwner` reserves the owner's attempt through `services.reservations.reserve`, not the route, and passes the ticket as socket queries.
- `reservations` is exposed on `services` by Step 6, so tests reach it the way they reach `services.hocuspocus`.
- G3 adds `commitBootstrap` in `apps/server/src/testing/`, a committed-room fixture for agent and reader sockets.
- The E2E asserts `data-testid` and HTTP answers, not waiting-page text. final-visuals and connection-state merge later and strengthen assertions (see the test plan).

## Sequencing

G1 runs first. G2 and G3 run in parallel after G1. G2's Step 6 wires the runtime and `services.reservations` now, and the `createCollaborationServer` arguments after G3 merges, because `server.ts` is G2's. G4 runs after G2, since it calls `runtime.reserveCreator`, and adds `staleTime: Infinity` to the open query after final-visuals merges (that lane owns `use-opened-document.ts` today, so the two overlap). G5 runs last. Step 0 runs before Step 8's cap commit.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/constants.ts`, `libs/types/src/documents.ts`, `libs/history/src/document-history.ts`, `libs/history/src/document-history.test.ts` (new), `apps/web/src/testing/opened-document.ts` | `developer-1` |
| G2 | `apps/server/src/collaboration/creator-reservations.ts` and `.test.ts` (new), `bootstrap-state.ts` and `.test.ts` (new), `collaboration-context.ts` (new), `collaboration-runtime.ts` and `.test.ts` (new), `libs/history/src/projection.ts` and `projection.test.ts`, `apps/server/src/server.ts`, the reservation bullets of `.claude/rules/collaboration.md` | `developer-2` |
| G3 | `apps/server/src/collaboration/collaboration-server.ts` and `.test.ts`, `socket-message-limit.ts` and `.test.ts` (new), `attach-collaboration.ts` and `.test.ts`, `apps/web/src/features/editor/collaboration-config.ts`, `apps/server/src/testing/collaboration-client.ts`, `apps/server/src/testing/commit-bootstrap.ts` (new), every existing test whose premise breaks (agent and reader sockets on fresh rooms in `collaboration-server.test.ts`, `collaboration-history.test.ts`, `version-rooms.test.ts`, the insights tests, the agent tests and the history tests, all under `apps/server/src`), the fence, close code and limit bullets of `.claude/rules/collaboration.md` | `developer-3` |
| G4 | `apps/server/src/documents/documents-routes.ts` and `.test.ts`, `apps/server/src/agent/agent-sessions.ts` and `agent-sessions-room.test.ts`, `apps/web/src/features/editor/use-opened-document.ts` (the `staleTime`) | `developer-4` |
| G5 | `e2e/room-admission.spec.ts` (new), `e2e/fixtures/large-docx.ts` (new), the Evidence section of ADR 0034. Step 0's probe is a throwaway spec, never committed | `developer-5` |

## Steps

Red first. Each step names its test file, test name and the failure the red run should print. The tester records the text the run actually printed, not this one. A wrong step is struck through with the reason.

### Step 0 (G5, before Step 8)

- [x] **Step 0:** On the unchanged tree, upload a DOCX between 9.5 and 10 MB through the upload path. Record the largest frame the page sends on the collaboration socket (Playwright `page.on('websocket')`, `framesent`, payload length) and the frame count. Expected: the largest frame is below 41,943,040 bytes. If not, stop and return the number to the owner, because the cap is theirs to change.

### Group G1

- [x] **Step 1 (G1, a13b64d red, 66da02f green):** `libs/history/src/document-history.test.ts`, `isBootstrapCommitted is true only for a document whose meta marks the bootstrap committed` and `isBootstrapCommitted is false for a document with no meta marker`. Red: `isBootstrapCommitted is not implemented`. Export `isBootstrapCommitted({ document })` and use it inside `findBootstrapSequence`.
- [x] **Step 2 (G1, f482490 red, 0a93d58 green; `creatorEpoch` added in b31f2a9):** Add `creatorAttempt: number | null` to `OpenedDocument`, `SOCKET_MESSAGE_UPLOAD_MULTIPLE`, `MAX_SOCKET_MESSAGE_BYTES`, and the constants listed under Global Constraints. Red: `pnpm typecheck` fails with `Property 'creatorAttempt' is missing` at `apps/web/src/testing/opened-document.ts`. Green: `openedAs` returns `creatorAttempt: null`.

### Group G2

- [x] **Step 3 (G2, 9452149 red, ce8e506 green; revised: 23ed472 red, f15fb4b green for epoch, commit, touch, release-as-silence):** `creator-reservations.test.ts`, a `test.each` table over the state machine. Rows: `reserves attempt 1 for the first editor`; `refuses a second editor while the reservation is live`; `keeps the holder's attempt on a second open without extending the expiry`; `passes an expired reservation to the next editor with the next attempt`; `refuses writes from the superseded attempt after takeover`; `gives the next attempt number after a release`; `starts again at attempt 1 after forget`. Red: `CreatorReservations is not implemented`. Implement the class from the spec.
- [x] **Step 4 (G2, a066885 red, cccc695 green; revised: bb5fa73 red, 8e8e46f green, returns a ticket):** `collaboration-runtime.test.ts`, `a takeover closes the superseded creator's socket with 4403 and the reason`. Red: `runtime.reserveCreator is not a function`. Implement `reserveCreator`: reserve, then close each connection whose attempt differs with `connection.close({ code: SUPERSEDED_ATTEMPT_CLOSE_CODE, reason: SUPERSEDED_ATTEMPT_REASON })`.
- [x] **Step 5 (G2, db60480 red, cc98525 green; revised by the lead's review: f5baab8 red, 135a07d green, `markCommitted` became `commit`):** `bootstrap-state.test.ts`, `markCommitted writes a snapshot of the live room at the commit sequence` and `isCommitted reads a committed room once and caches it`. Red: `createBootstrapState is not implemented`. Move `findCommittedBootstrap` out of the runtime. `markCommitted` calls `writeSnapshot` with `Y.encodeStateAsUpdate(document)`.
- [x] **Step 6 (G2, e1b8fc4; `createCollaborationServer` arguments wait for G3):** Wire `apps/server/src/server.ts`: build `reservations` and `bootstrap`, pass both to `createCollaborationServer` and `createCollaborationRuntime`, expose `reservations` on `services`, and make `roomMode` read `bootstrap.isCommitted`. Pin: the existing `roomMode stays create until the bootstrap commits` and `roomMode scans a long log in pages` tests stay green.
- [ ] **Step 6a (G2):** `libs/history/src/projection.test.ts`, the same client id 900 and 100 test for `projectPending`. Red: `expected the commit to be found, received none`.

### Group G3

- [ ] **Step 7 (G3):** `socket-message-limit.test.ts`, `the 120th message in a second is accepted and the 121st breaches` and `messages older than a second stop counting`. Red: `SocketMessageLimit is not implemented`. Implement `breached(socket)` over one `SlidingWindow` per socket in a `WeakMap`.
- [ ] **Step 8 (G3):** `attach-collaboration.test.ts`, `a frame over the payload cap closes with 1009 that the client receives` and `a valid update padded to the cap is accepted`. Red: `Test timed out in 15000ms` (under the 100 MiB default no close arrives). Implement `maxPayload: MAX_SOCKET_MESSAGE_BYTES`, make `terminateOnError` return early when the socket is already CLOSING, and add a `console.warn` with no payload and no document id (Review Focus 4). Requires Step 0 recorded.
- [ ] **Step 9 (G3):** `collaboration-server.test.ts`, `a member is refused on an uncommitted room with no attempt` and `an agent room token is refused on an uncommitted room with no attempt`. Red: `promise resolved ... instead of rejecting`. Implement the check in `onAuthenticate`: read `attempt` and `epoch` from the socket URL queries, accept an uncommitted room only when `reservations.attemptOf` answers the user with that ticket, store both in the context, log every refusal with the document id, and close a committed-room socket whose attempt is not the committing one with 4403. Add the two queries in `collaboration-config.ts` from the open response. Box: the refusal is logged with the document id.
- [ ] **Step 10 (G3):** `testing/collaboration-client.ts`: `documentWithOwner` reserves through `services.reservations.reserve` (not the route) and passes the ticket as socket queries. Add `commitBootstrap` in `apps/server/src/testing/` and move every test whose premise breaks onto it: agent and reader sockets on fresh rooms. Red: the existing `accepts a valid session cookie` fails with `CollaborationRefusedError`. Green: the owner's attempt is reserved first.
- [ ] **Step 11 (G3):** `collaboration-server.test.ts`, `a superseded attempt's update is not appended to the log` and `a stale attempt's refusal is logged once per connection`. Red: `expected 0 to equal 1` on the log row count. Drive `services.hocuspocus.configuration.onChange` with the superseded attempt's context after `release` and a new `reserve`. Implement `onChange` in the order fence, append, `isBootstrapCommitted({ document })`, `markCommitted` with the appended sequence, with the append and the snapshot in one SQLite transaction. The fence uses `reservations.mayWrite` and `bootstrap.isCommitted`, logs through a `WeakSet` of contexts, and calls `touch` on every appended update. Boxes: a fenced committing update does not mark the room committed.
- [ ] **Step 11b (G3):** `collaboration-server.test.ts`, `a creator returning after another editor committed is closed with 4403 and writes nothing`. Red: `expected the socket to close with 4403, received it open`. Implement the post-commit rule in `mayWrite` and `onAuthenticate`.
- [ ] **Step 12 (G3):** `collaboration-server.test.ts`, `the next attempt starts from an empty room after the creator closes its tab`. Red: `expected the room text to be empty, received the abandoned paragraph`. Same file, `a room load after a commit excludes an abandoned partial seed`. Red: `expected the abandoned partial to be absent, received it`. Also `the holder's reconnect is accepted`, `closing one of two tabs keeps the reservation and another editor still gets 409`, `the 409 and the takeover close are logged with the document id`. Implement `onDisconnect`: release the reservation only when the last connection of the holder's attempt closes; `onLoadDocument` restores nothing while uncommitted; `onChange` calls `bootstrap.markCommitted` and `reservations.markCommitted` on the first committed update. No manual unload.
- [ ] **Step 13 (G3):** `attach-collaboration.test.ts`, `121 valid awareness frames close the socket with 1008 and the reason` and `121 frames before authentication close the socket with 1008`. Red: `Test timed out in 15000ms` (no close arrives). Implement the count in `attach-collaboration.ts` from the first frame, with one `SlidingWindow` per socket through `socket-message-limit.ts`, closing with `POLICY_VIOLATION_CLOSE_CODE` and `SOCKET_RATE_LIMIT_REASON`, and a `console.warn` with no payload. No Hocuspocus `beforeHandleMessage` hook.
- [ ] **Step 14 (G3, docs):** `.claude/rules/collaboration.md`, fence, post-commit rule, epoch, close codes 1008, 4403 and 1009, and both limits. Pinned by the tests above, so no box of its own.

### Group G4

- [x] **Step 15 (G4, 9327ca3 red, 7ddab71 green; the web `staleTime` in eaaa5b4 red, 10d1b22 green):** `documents-routes.test.ts`, `the first editor to open a fresh room is reserved as creator with attempt 1`, and `a second open by the holder keeps attempt 1`. Red: `expected undefined to be 1`. Implement `runtime.reserveCreator` in the editor branch of the open route, and return `creatorAttempt` and `creatorEpoch`. Add `staleTime: Infinity` to the open query after final-visuals merges.
- [x] **Step 16 (G4, 9327ca3 red, 7ddab71 green):** `documents-routes.test.ts`, `a second editor opening a live reservation gets 409 NOT_READY`. Red: `expected 200 to equal 409`. Implement the 409 for editors, with readers unchanged, and log it with the document id.
- [x] **Step 17 (G4, 9327ca3 red, 7ddab71 green):** `documents-routes.test.ts`, `a committed room answers Join with creatorAttempt null for a reader and an editor`. Red: `expected undefined to be null`.
- [x] **Step 18 (G4, f2ba41d red, 7faf94b green):** `agent-sessions-room.test.ts`, `an agent opening an uncommitted room is answered NOT_READY and seeds nothing`. Red: `promise resolved instead of rejecting`. Implement the check before `connected()`, throwing `AgentToolError` with `DOCUMENT_NOT_READY_ERROR`, and remove the now-dead `seed` branch in the same commit.

### Group G5

- [x] **Step 19 (G5, counted per browser context):** `e2e/room-admission.spec.ts`, `two editors open a fresh document at once and only the first is answered Create`. Red until G2 to G4 merge: `expected 1 Create, received 2`.
- [x] **Step 20 (G5):** same spec, `the second editor's open is answered 200 Join once the creator commits`, asserted on the network response and not on text. Red: the poll times out with no 200.
- [x] **Step 21 (G5):** same spec, `a creator who closes its tab mid-create leaves no duplicated paragraph for the next editor`. Red: `expected 1 paragraph, received 2`. Actual red (commit ed459e0): bruno's editor never shows the paragraph, because the room replayed from the abandoned prefix is rejected as structurally invalid; the partial is copied from a real creator's log into the history database, see the tester briefing.
- [ ] **Step 21b (G5):** same spec, `the holder opens two pages within one second and the document holds one paragraph`. If it duplicates, the rule becomes 409 while a socket of that attempt is connected.
- [x] **Step 22 (G5):** same spec, `a 10 MB DOCX commits and reopens as Join`. Pin: green on the current tree, and it must stay green after Step 8.
- [x] **Step 23 (G5):** same spec, `a superseded creator's socket closes with 4403 after the 60 s expiry`. Runs in manual E2E dispatch only. Red: the takeover never happens and the poll times out.
- [ ] **Step 24 (G5):** same spec, `a creator offline mid-create returns after another editor committed: closed with 4403, one paragraph set, the room still opens`. Red: `expected close 4403, received the socket open`. Red: the takeover never happens and the poll times out.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 0 | Largest frame reaches the cap | Probe frame size at or above the cap (83,886,080 bytes after the multiple became 8) | Stop; the lead decides the multiple |
| 3 | Reservation rules differ from the state table | Unit table row fails | Revert G2 reservation files |
| 4 | Takeover leaves a stale socket writing | Close code test fails; writes still logged | Revert `reserveCreator` |
| 6 | Wiring changes `roomMode` | Existing roomMode tests fail | Revert `server.ts` |
| 5 | Snapshot-first misses a commit | Step 5 client id 900 vs 100 test fails | Revert `bootstrap-state.ts` scan order |
| 8 | A 10 MB DOCX is refused, or 1009 reaches the client as 1006 | Step 22 shows the socket closing with 1009 or 1006 | Revert `maxPayload` and the CLOSING return |
| 9 | A returning creator is refused on a valid committed room | Step 11b case with no attempt fails | Revert the post-commit check |
| 10 | Helper change hides a real refusal | `accepts a valid session cookie` passes for the wrong reason | Revert helper |
| 12 | Release on a non-last connection frees the room | A second editor opens while a tab is still connected and gets 200 | Revert `onDisconnect` |
| 13 | Rate count misses frames before authentication | The 121-frame test times out | Revert the `ws` count |
| 15 | Route reserves for readers | Reader case of the 409 test changes | Revert route change |
| 18 | Agent path still seeds | Agent tool test resolves | Revert `agent-sessions.ts` |

**Steps with no backout:** none. Every step reverts as code. The log and snapshot rows are additive and stay correct after a revert (see the spec's rollback section).

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict. The three riskiest claims are refuted in `test-plan.md`.
- [ ] **/check-ui:** the waiting page and failed banner recorded at all widths.
- [ ] **/open-pr:** gates passed, learnings sweep stated, `Merge sensitivity: HIGH` in the PR body.

## Blast radius

If the fence or the reservation is wrong, a second editor loses its own typing or an editor is refused on a fresh document. Seventeen files under `apps/server/src` connect to rooms and rely on `documentWithOwner`, and G3 owns every one whose premise breaks. Agent sessions on an uncommitted room now answer NOT_READY. `e2e/documents.spec.ts` asserts the current 409 text, which final-visuals replaces. The creator notices first, through the failed banner. Rollback is `git revert`. It needs no migration and loses no data. A document that was mid-create may load its abandoned partials again and duplicate content, as the spec says.

## Human checklist (for the PR body)

- [ ] Open one new document in two windows at once. Exactly one creates, and the other waits and then enters on its own.
- [ ] Close the creator's tab during creation. The next editor enters with no duplicated paragraphs.
- [ ] Upload a DOCX near 10 MB. It opens and commits without the banner staying on reconnecting.
- [ ] Paste a large block. The banner shows at most one reconnect, then recovered.
- [ ] Restart the server during a create. The creator sees failed, and Reload opens the document.
