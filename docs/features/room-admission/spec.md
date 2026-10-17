# Room admission: one creator per room, write fencing, socket limits

**Status:** Approved
**Tier:** 🔴
**Owner approval:** approved 2026-10-17 (brief)
**ADRs:** [0001](../../adr/0001-event-sourcing-over-yjs.md), [0033](../../adr/0033-one-creator-per-room-reservation-with-per-attempt-write-fencing.md), [0034](../../adr/0034-collaboration-socket-payload-and-rate-limits.md)
**Not changing:** the update log format and columns, the projection's output (its bootstrap scan starts from the committed snapshot), share links, the agent room token of [0025](../../adr/0025-mcp-clients-authorize-with-oauth-and-join-rooms-by-room-token.md), the waiting page UI (final-visuals, design 1.15), the connection banner (connection-state).

This is item 2 of the owner brief in `docs/features/connection-state/brief.md`. The waiting page is built by `final-visuals`; this feature only widens who receives the 409.

## Problem

Two editors who open a fresh document within the same seconds both receive `RoomMode.Create`, and both seed the room (brief finding 3). The open route answers 409 `NOT_READY` only to readers. The collaboration socket accepts messages up to the library default of 100 MiB and has no rate limit (brief finding 4), so one client can exhaust memory with one large message or a flood of small ones.

Projection alone does not stop duplicated content. Partial updates from an abandoned creator stay in the log. A later room load replays the whole log, so the next creator would seed on top of them. The room load must skip everything before the commit as well as the projection.

## Goals

| Goal | Rule |
|---|---|
| Reservation | The first editor who opens an uncommitted document is reserved as creator. Every other editor and every reader gets 409 `NOT_READY` until the commit. |
| Fencing | While uncommitted, an update is appended only from the latest attempt. After the commit, a socket that carries an attempt is accepted only when it is the attempt that committed in this process epoch, and a socket with no attempt (Join) is accepted. Every other connection is closed with 4403. |
| Expiry | A reservation expires after `CREATOR_RESERVATION_MS` of silence: every appended update from the latest attempt refreshes it. The next editor who opens takes over with attempt + 1. |
| Commit | A commit clears the reservation and writes a snapshot, so later loads start from the committed state. Commit detection answers from the latest snapshot that satisfies `isBootstrapCommitted`, and scans the paged log only when no snapshot exists. |
| Limits | Socket `maxPayload` is `MAX_SOCKET_MESSAGE_BYTES`. A connection may send `MAX_SOCKET_MESSAGES_PER_SECOND` messages in a rolling second. A breach closes with a reason. |
| Logging | Every refusal, 409, takeover close and breach is logged with the document id, except a frame over the cap, which never reaches a document. The payload is never logged. |
| R | The waiting page stays smooth from 320 to 2560 px: no horizontal scroll, no clipped control, no layout jump. Final-visuals tests the page. This feature's E2E re-checks 375 and 1280. |

## Non-goals

- Multi-instance coordination. The project runs one server process by design, so reservations and attempt counters live in that process's memory.
- Per-room byte budgets (upstream's 16 MiB per room).
- Persisting reservations. A restart drops them; the next open re-reserves.
- Agent sessions as creators (decided below).
- Any change to the waiting page or the banner. Those belong to final-visuals and connection-state.

## Design

### State machine

The reservation of one document moves through these states. The attempt counter only grows, and it survives a release, so a fenced attempt is never reused.

```
Unreserved ──open by editor──▶ Reserved(n)
Reserved(n) ──open by other, live──▶ Reserved(n)        (other gets 409)
Reserved(n) ──open by same user──▶ Reserved(n)          (same attempt, no extension)
Reserved(n) ──update from n──▶ Reserved(n)              (expiry refreshed: 60 s of silence)
Reserved(n) ──last connection of n closes──▶ Unreserved (attempt counter kept at n)
Reserved(n) ──silence for 60 s──▶ Expired(n)            (still the latest attempt, fence intact)
Expired(n) ──open by any editor──▶ Reserved(n+1)        (n is fenced and its sockets closed)
Expired(n) ──last connection of n closes──▶ Unreserved
Reserved(n) or Expired(n) ──commit by n──▶ Committed(n) (reservation cleared, room is Join)
Committed(n) ──socket with an attempt other than n, or from another epoch──▶ closed 4403
Unreserved ──open──▶ Reserved(latest + 1), or Reserved(1) when nothing was ever issued
```

The fence is "the attempt is the latest one issued", not "the attempt still holds a live reservation". So a creator whose reservation expired may still commit while nobody else has opened the document. Commit wins until someone takes over. `attemptOf` keeps answering the holder until another editor reserves after expiry, so the holder's reconnect, a 1008 reconnect and a second tab are all accepted on the uncommitted room. After a commit, `mayWrite` accepts a socket with no attempt or the attempt that committed in this epoch, so an abandoned creator that returns after another editor committed is closed with 4403 and cannot write on top of the committed room.

Two editors opening at once:

```
editor A  GET open ─▶ roomMode Create, reserve → Reserved(1) for A ─▶ 200 creatorAttempt 1, creatorEpoch
editor B  GET open ─▶ roomMode Create, reserve → A holds it live   ─▶ 409 NOT_READY
editor A  socket   ─▶ onAuthenticate attempt 1 and epoch from the URL ─▶ seed appended ─▶ commit ─▶ snapshot, Committed
editor B  GET open ─▶ Join ─▶ 200 roomMode Join
```

The open route is synchronous, and so is reservation. Node's single thread therefore serialises two opens, and no lock is needed.

### Data flow

- **Open** (`GET /api/documents/:id`). Role check first (Reader minimum). If the room is committed, answer Join with `creatorAttempt: null`. Otherwise a reader gets 409. An editor calls `runtime.reserveCreator`. A `null` answer (another user holds a live reservation) is 409 and is logged with the document id. An attempt is 200 with `RoomMode.Create`, `creatorAttempt` and `creatorEpoch`. The holder's second open answers Create with the same attempt. The web's open query gets `staleTime: Infinity` (`use-opened-document.ts`, added by connection-state's lane G4 after final-visuals merges, which owns that file today).
- **Socket authentication.** The attempt travels with the socket: the web passes `attempt` and `epoch` from the open response as socket URL queries (`collaboration-config.ts`), and `onAuthenticate` stores them in the context. On an uncommitted room the connection is accepted only when `attemptOf` answers the session user with that attempt in this epoch. Anything else is refused and logged with the document id, for members and agents alike. Agents therefore never create. The room token carries no attempt. On a committed room, a socket with an attempt that is not the committing attempt of this epoch is closed with 4403.
- **Update.** `onChange` runs after Hocuspocus applied the update, in this order: fence, append, `isBootstrapCommitted({ document })`, `markCommitted` with the appended sequence. The fence is `mayWrite`: a committed room accepts a socket with no attempt or the committing attempt, an uncommitted room accepts the latest attempt of this epoch. A refused update is dropped and logged once per connection, and a fenced committing update never marks the room committed. Every appended update from the latest attempt calls `touch`, which refreshes `expiresAt`. The log keeps everything appended before the takeover.
- **Commit.** On the first committed update, the append and the snapshot happen in one SQLite transaction at the appended sequence. `markCommitted` then records the committing attempt and clears the reservation. A snapshot slightly ahead of the appended sequence is harmless, because `onChange` runs after the update was applied and Yjs updates are idempotent.
- **Commit detection.** `isCommitted` answers from the latest snapshot whose state satisfies `isBootstrapCommitted`, and falls back to the paged log scan only when no snapshot exists. The projection's bootstrap scan (`projectPending` in `libs/history/src/projection.ts`) does the same. A from-zero replay is unreliable: an abandoned client with a higher client id can write `meta.bootstrapState` concurrently, and Yjs resolves the conflict in its favour, which hides the winner's commit.
- **Takeover.** `reserveCreator` closes every connection whose attempt is not the new one with `SUPERSEDED_ATTEMPT_CLOSE_CODE` and the reason.
- **Release.** `onDisconnect` releases the reservation only when the last connection of the holder's attempt closes. Closing one of two tabs keeps the reservation, and another editor still gets 409. The takeover close is logged with the document id.
- **Room load.** While uncommitted, `onLoadDocument` restores nothing, so a new attempt starts empty and abandoned partials stay out of the live room. Once committed, it materializes as today, starting from the commit snapshot.
- **Room unload.** Hocuspocus 2.15.3 unloads a room when its last connection closes (`unloadImmediately` defaults to true), so the next attempt loads an empty room through the uncommitted rule above. No manual unload is added.
- **Commit snapshot.** The snapshot holds the live room's state (`Y.encodeStateAsUpdate(document)`), never a `materialize` of the log, because the log still holds the abandoned partials. It is written through the existing `UpdateLog.writeSnapshot`; no new `snapshot` method is added.
- **Socket limits.** The socket server caps frames at `MAX_SOCKET_MESSAGE_BYTES`. The `ws` layer in `attach-collaboration.ts` counts frames per socket from the first frame, before authentication too, with one `SlidingWindow` per socket. The frame that exceeds the rate closes the socket with `POLICY_VIOLATION_CLOSE_CODE` and `SOCKET_RATE_LIMIT_REASON`. The Hocuspocus `beforeHandleMessage` hook is not used.

### Interfaces

**`libs/types/src/constants.ts`**

- `CREATOR_RESERVATION_MS = MINUTE_MS` (60 s of silence).
- `MAX_SOCKET_MESSAGES_PER_SECOND = 120`.
- `POLICY_VIOLATION_CLOSE_CODE = 1008`.
- `SUPERSEDED_ATTEMPT_CLOSE_CODE = 4403`, the same code upstream uses for access denied, so the client maps it to `failed` without retries.
- `SOCKET_RATE_LIMIT_REASON = 'Too many messages per second'`.
- `SUPERSEDED_ATTEMPT_REASON = 'This attempt was superseded'`.

**`libs/types/src/documents.ts`**

- `SOCKET_MESSAGE_UPLOAD_MULTIPLE = 8`. Raised from 4 on 2026-10-17 after Step 0: a text-dense 9.52 MiB DOCX syncs a 36,593,816-byte frame (3.7× its file size), 87% of a 40 MiB cap; 80 MiB leaves 2.2× over the worst measured frame and stays under the `ws` default of 100 MiB.
- `MAX_SOCKET_MESSAGE_BYTES = SOCKET_MESSAGE_UPLOAD_MULTIPLE * MAX_UPLOAD_BYTES`.
- `OpenedDocument = { document: DocumentSummary; role: DocumentRole; roomMode: RoomMode; creatorAttempt: number | null; creatorEpoch: string | null }`. The web reads both new fields for the socket URL, and the web fixtures change.

**`apps/server/src/collaboration/creator-reservations.ts`** (new)

```ts
export type CreatorReservation = { documentId: string; userId: string; attempt: number; expiresAt: number };
export type CreatorTicket = { attempt: number; epoch: string };
export class CreatorReservations {
  reserve({ documentId, userId }: { documentId: string; userId: string }): CreatorTicket | null;
  attemptOf({ documentId, userId }: { documentId: string; userId: string }): CreatorTicket | null;
  mayWrite({ documentId, attempt, epoch, committed }: { documentId: string; attempt: number | null; epoch: string | null; committed: boolean }): boolean;
  touch({ documentId, attempt }: { documentId: string; attempt: number }): void;
  markCommitted({ documentId, attempt }: { documentId: string; attempt: number }): void;
  release({ documentId, attempt }: { documentId: string; attempt: number }): void;
  forget(documentId: string): void;
}
```

`reserve` returns the new attempt, the same attempt for the holder, or `null` for a live holder. Every ticket carries a per-process `epoch`, so an attempt from before a restart never matches. The constructor takes `{ reservationMs, now }`, following `KeyedCooldown`.

**`apps/server/src/collaboration/bootstrap-state.ts`** (new)

`createBootstrapState({ updateLog, readModel })` returns `isCommitted(documentId)`, `markCommitted({ documentId, sequence, document })` and `forget(documentId)`. It moves `findCommittedBootstrap` and `hasCommittedBootstrap` out of `collaboration-runtime.ts` and keeps the cache. `isCommitted` is snapshot-first, as described under Commit detection.

**`apps/server/src/collaboration/collaboration-runtime.ts`**

`DocumentRuntime` gains `reserveCreator({ documentId, userId }): CreatorTicket | null`, which closes superseded connections on takeover. The runtime and `services.reservations` are wired in `server.ts` first; the arguments of `createCollaborationServer` follow once the server lands. `roomMode` stays a pure read from `bootstrap.isCommitted`. `forget` also clears the reservation and the bootstrap cache.

**`apps/server/src/collaboration/collaboration-server.ts`**

- `CollaborationContext = { userId: string; documentId: string; actor: ClientActor; creatorAttempt: number | null; creatorEpoch: string | null }`, moved to `apps/server/src/collaboration/collaboration-context.ts`.
- `createCollaborationServer` gains `reservations: CreatorReservations` and `bootstrap: BootstrapState`.
- `onAuthenticate` stores the attempt and epoch from the URL queries and refuses, with a log line, an uncommitted room without a matching attempt, for members and agents alike.
- `onLoadDocument` restores nothing while uncommitted.
- `onChange` applies the fence, appends, detects the commit, and logs refusals once per connection through a `WeakSet` of contexts.
- `onDisconnect` releases the reservation when the last connection of the attempt closes.

**`apps/server/src/collaboration/socket-message-limit.ts`** (new)

`SocketMessageLimit.breached(socket: object): boolean`, the per-socket helper that `attach-collaboration.ts` calls. It keeps one `SlidingWindow` per socket in a `WeakMap`, with `windowMs: SECOND_MS`.

**`apps/server/src/collaboration/attach-collaboration.ts`**

`new WebSocketServer({ noServer: true, maxPayload: MAX_SOCKET_MESSAGE_BYTES })`. A frame over the cap makes `ws` close with 1009 on its own, and this feature keeps that code. The frame never reaches Hocuspocus, so that breach is logged with a `console.warn` that carries no payload and no document id. `terminateOnError` returns early when the socket is already CLOSING, so the 1009 close frame is delivered. The rate limit counts frames here from the first frame and closes with 1008.

**`libs/history`**

- `isBootstrapCommitted({ document }: { document: Y.Doc }): boolean` is exported from `document-history.ts`, and `findBootstrapSequence` uses it.
- `projectPending` in `projection.ts` starts its bootstrap scan from the committed snapshot.
- The commit snapshot goes through the existing `UpdateLog.writeSnapshot`. The log format does not change.

**`apps/server/src/documents/documents-routes.ts`** implements the open route described under Data flow. **`agent-sessions`** answers `DOCUMENT_NOT_READY_ERROR` through `AgentToolError` when the room is uncommitted, and never reserves.

### Failure handling

- **The creator's first sync exceeds the payload cap.** The socket cap is eight times the upload cap, which is 80 MB. The POC measured a 204-paragraph room state at 4.45 MB, and the plan measures a room state from a 10 MB DOCX before the cap is trusted. If a sync still exceeds the cap, `ws` closes with 1009 and the provider never reconnects after 1009. The creator sees the failed banner and Reload re-reserves. Step 0 sizes the cap from a measured 10 MB DOCX, so this is the residual risk, and the human checklist covers it. A test uploads a 10 MB DOCX and asserts commit.
- **The reservation expires while the creator is still syncing a large DOCX.** Expiry means 60 s of silence, so a creator that keeps appending is not expired. The commit wins if it lands before anyone else opens. If someone opens after expiry, the old attempt is fenced and its socket is closed with 4403. The creator's page shows the failed banner with Reload. Reload returns 409 and the page waits for the new creator.
- **A rate breach during a burst paste.** The socket closes with 1008 and the provider reconnects once. `attemptOf` still answers the holder, so the reconnect is accepted on the uncommitted room, re-syncs missed updates, and the banner goes lost, reconnecting, then recovered. Awareness frames count toward the 120. If the same paste breaches again on reconnect, the human checklist catches it.
- **The creator goes offline mid-create and another editor commits.** The creator's reservation expired and the other editor took over with attempt + 1. When the creator returns, its socket carries the old attempt on a committed room and is closed with 4403. The document keeps one paragraph set and the room still opens.
- **The holder opens the document twice within a second.** The second open answers Create with the same attempt, so both pages seed from one attempt. If an E2E shows duplicated paragraphs, the rule becomes 409 while a socket of that attempt is connected.
- **A server restart mid-create.** Reservations and counters vanish. The creator's reconnect is refused at authentication because no reservation exists, so the page shows failed with Reload. Reload reserves attempt 1, and the room loads empty because it is uncommitted. The abandoned partial seed stays in the log and is not loaded, so nothing duplicates. Editors who open during the downtime see the open error and retry. A creator that committed before the restart and reconnects after it carries an old epoch, is closed with 4403, and Reload opens the committed room as Join.
- **A stale connection writes after takeover.** `onChange` refuses it and logs once. Hocuspocus has already applied the update to the in-memory room, so the close on takeover is the actual fence. The refusal is the second line.

## Alternatives

| Option | Why not |
|---|---|
| No reservation, first write wins | Two creators seed the room and duplicate content (brief finding 3). |
| Mark the document failed and require the owner to retry | The waiting page must enter on its own, which the owner asked for. |
| Only the original creator may create | The creator may have left. Expiry lets the next editor proceed. |
| A fixed 1 MiB cap, as upstream | The creator's first sync carries the whole seeded room in one message, so create would break. |
| A message cap without a rate cap | A flood of small messages within the cap still exhausts the server. |
| A spike before the decision | Done as a plan step: measure a 10 MB DOCX room state before trusting the cap. |

## Rollback

Revert the lane with `git revert`. There is no feature flag, as decided. Reservations and counters are in memory, so nothing persists and a restart clears them. The log keeps the abandoned partials and the commit snapshots. Both are harmless after revert, because the older load path picks the latest snapshot, and that is the committed state. A document that was mid-create at the moment of revert may load its abandoned partials again, so its content could duplicate. No data is lost and no migration runs.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|---|---|---|---|
| Reservation expiry | 30 s, 60 s, 120 s | Recommendation: 60 s (`CREATOR_RESERVATION_MS`). Expiry only matters for takeover, so a longer sync never loses its commit. | Recommendation, 2026-10-17 |
| Payload cap multiple | 1×, 4×, 16× `MAX_UPLOAD_BYTES` | Decided 8× on 2026-10-17 from the Step 0 numbers (36.6 MB worst frame for a text-dense 10 MB DOCX); the recommendation had been 4× (`MAX_SOCKET_MESSAGE_BYTES`), after the plan measures a 10 MB DOCX room state. | Recommendation, 2026-10-17 |
| Close code on rate breach | 1008, 1013, 4429 | Recommendation: 1008 (policy violation). A payload breach keeps `ws`'s 1009. | Recommendation, 2026-10-17 |
| Agents create rooms | Yes, no | Recommendation: no. Agents join committed rooms only, and the agent path answers `NOT_READY` while uncommitted. | Recommendation, 2026-10-17 |
| Commit detection | Replay the log from zero, or read the committed snapshot first | Snapshot-first, with the paged log scan as fallback, for the concurrent client id reason under Commit detection. Decided by the lead on 2026-10-17. | Lead, 2026-10-17 |
| Partials reload after commit | Replay the log, or cut at a commit snapshot | Recommendation: write the commit snapshot and skip uncommitted loads, so abandoned partials never reach a live room. Approved by the lead on 2026-10-17 under the owner's instruction to decide alone within the brief: without it finding 3 is not closed. | Recommendation, 2026-10-17 |

## Test strategy summary

**Unit (Vitest).**

- `CreatorReservations` state table: Unreserved to Reserved(1); a live holder gets `null`; an expired reservation is taken over with n+1; release by the creator; the old attempt cannot write after takeover; forget.
- `onChange` fence: a stale attempt is not appended and is logged once per connection; a committed room accepts every attempt.
- `onAuthenticate`: an uncommitted room without an attempt is refused for a member and for an agent.
- Limits: the 120th frame in a second is accepted and the 121st closes with 1008 and the reason, also when all 121 arrive before authentication; a valid update padded to the cap is accepted; a frame over the cap closes with 1009 and the client receives it; valid awareness updates drive the 1008 case; no log line carries the payload.
- Commit cut: after a commit snapshot, a materialize from the log excludes an abandoned partial seed.
- Commit detection: with client ids 900 (abandoned, concurrent `meta.bootstrapState` write) and 100 (winner), `isCommitted` and `projectPending` still see the commit, in `bootstrap-state.test.ts` and `projection.test.ts`.
- Post-commit fence: a socket with an attempt other than the committing one is closed with 4403; a socket with no attempt is accepted; a fenced committing update does not mark the room committed.
- Expiry refresh: an update at 50 s extends the expiry. A commit clears the reservation.
- Release: the holder's reconnect is accepted; closing one of two tabs keeps the reservation and another editor still gets 409.
- Logs: the `onAuthenticate` refusal, the 409 and the takeover close each carry the document id.
- Route: first editor gets `Create` with an attempt; second editor and every reader get 409 until commit.

**E2E (Playwright, one browser per author, `playwright` and `playwright-second`).**

- Two editors open a fresh document at once: one creates, the other shows "Preparing the document…" and enters on its own. Run at 375 and 1280.
- The creator closes the tab mid-create: the next editor enters without waiting, with no duplicated paragraphs. This exercises release, which needs no expiry wait.
- The expiry path with a real 60 s wait runs only in manual E2E dispatch.
- A 10 MB DOCX commits without the banner going to failed.
- The creator goes offline mid-create, another editor commits, the creator returns: closed with 4403, one paragraph set, the room still opens.
- The holder opens two pages within one second: one paragraph.

**Playwright MCP walk.** Two windows, the waiting page at 320, 375, 1280 and 2560, and the upload path at 375. Screenshots of the waiting page and of the failed banner.

**Human checklist** (a sensitive PR, merge sensitivity HIGH):

- [ ] Open one new document in two windows at once. Exactly one creates, and the other waits and then enters on its own.
- [ ] Close the creator's tab during creation. The next editor enters with no duplicated paragraphs.
- [ ] Upload a DOCX near 10 MB. It opens and commits without the banner staying on reconnecting.
- [ ] Paste a large block. The banner shows at most one reconnect, then recovered.
- [ ] Restart the server during a create. The creator sees failed, and Reload opens the document.
