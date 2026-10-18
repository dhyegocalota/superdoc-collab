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
| Expiry | A reservation is live while any socket of its attempt is connected. After the last socket closes, silence (no appended update) expires it after `CREATOR_RESERVATION_MS`, and every appended update from the latest attempt refreshes that timer. Its total lifetime is capped at `CREATOR_RESERVATION_MAX_MS`, after which it lapses even with a socket connected. A holder that lapsed at the cap waits one `CREATOR_RESERVATION_MS` cooldown before it can reserve the same document again. The next editor who opens an expired or lapsed reservation takes over with attempt + 1. |
| Commit | A commit clears the reservation and writes a snapshot, so later loads start from the committed state. Commit detection answers from the latest snapshot that satisfies `isBootstrapCommitted`, and scans the paged log only when no snapshot exists. |
| Limits | Socket `maxPayload` is `MAX_SOCKET_MESSAGE_BYTES`. A connection may send `MAX_SOCKET_MESSAGES_PER_SECOND` messages in a rolling second. A breach closes with a reason. |
| Logging | A fence refusal, a takeover close, a 409 and a single-document close are logged with the document id. A frame over the payload cap and a rate breach are closed at the ws layer before any document name is known, so their lines carry no document id. The payload is never logged. |
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
Reserved(n) ──open by same user──▶ Reserved(n+1)        (newest tab wins: n is fenced and its sockets closed 4403; the lifetime cap carries over)
Reserved(n) or Expired(n) ──same user reopens within the release window──▶ Reserved(n+1), cap carried over
Released(n) ──same user reopens after the window──▶ Reserved(n+1), fresh lifetime
Reserved(n) ──update from n──▶ Reserved(n)              (silence timer refreshed, never past reservedAt + 5 min)
Reserved(n) ──socket of n connected──▶ Reserved(n)      (live while any socket of n is connected)
Reserved(n) ──last connection of n closes──▶ Unreserved (attempt counter kept at n)
Reserved(n) ──no socket and 60 s of silence──▶ Expired(n) (still the latest attempt, fence intact)
Reserved(n) ──5 min since reserved──▶ Lapsed(n)         (even with a socket connected; the holder waits 60 s before it can reserve again)
Expired(n) or Lapsed(n) ──open by any editor──▶ Reserved(n+1) (n is fenced and its sockets closed)
Expired(n) ──last connection of n closes──▶ Unreserved
Reserved(n) or Expired(n) ──commit by n──▶ Committed(n) (reservation cleared, room is Join)
Committed(n) ──socket with an attempt other than n in this epoch──▶ closed 4403
Committed(n) ──socket with a ticket from another epoch (a restart)──▶ admitted as an ordinary editor; a ticket is only read for another epoch while the room is uncommitted
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

- **Open** (`GET /api/documents/:id`). Role check first (Reader minimum). If the room is committed, answer Join with `creatorAttempt: null`. Otherwise a reader gets 409. An editor calls `runtime.reserveCreator`. A `null` answer (another user holds a live reservation) is 409 and is logged with the document id. An attempt is 200 with `RoomMode.Create`, `creatorAttempt` and `creatorEpoch`. The holder's second open answers Create with a new attempt: the newest tab wins, the old attempt is fenced and its sockets are closed with 4403, and the lifetime cap keeps counting from the first reservation, also when the holder released and reopened within `CREATOR_RESERVATION_MS` of the release. A holder returning later starts a fresh lifetime. The web's open query gets `staleTime: Infinity` (`use-opened-document.ts`, added by connection-state's lane G4 after final-visuals merges, which owns that file today).
- **Socket authentication.** The attempt travels with the socket: the web passes `attempt` and `epoch` from the open response as socket URL queries (`collaboration-config.ts`), and `onAuthenticate` stores them in the context. On an uncommitted room the connection is accepted only when `attemptOf` answers the session user with that attempt in this epoch. Anything else is refused and logged with the document id, for members and agents alike. The agent path is loopback-only, its room token is checked in the first protocol message, and an agent is refused on an uncommitted room before any ticket check, so agents never create. The room token carries no attempt. On a committed room, a socket with an attempt that is not the committing attempt of this epoch is closed with 4403.
- **Update.** `onChange` runs after Hocuspocus applied the update, in this order: fence, append, `isBootstrapCommitted({ document })`, `commit` with the appended sequence. The fence is `mayWrite`: a committed room accepts a socket with no attempt or the committing attempt, an uncommitted room accepts the latest attempt of this epoch. An update from a socket that carries an attempt never calls `readBatch` or `latestSnapshot`: the fence reads the reservation, not the log. A refused update is dropped and logged once per connection, and a fenced committing update never commits the room. Every appended update from the latest attempt calls `touch`, which refreshes `expiresAt` up to `reservedAt + CREATOR_RESERVATION_MAX_MS`. The log keeps everything appended before the takeover.
- **Commit.** On the first committed update, the append and the snapshot happen in one SQLite transaction at the appended sequence. `commit(documentId)` then clears the reservation; the latest attempt is the committing one, so nothing else is recorded. A snapshot slightly ahead of the appended sequence is harmless, because `onChange` runs after the update was applied and Yjs updates are idempotent.
- **Commit detection.** `isCommitted` answers from the latest snapshot whose state satisfies `isBootstrapCommitted`, and falls back to the paged log scan only when no snapshot exists. The projection's bootstrap scan (`projectPending` in `libs/history/src/projection.ts`) does the same. A from-zero replay is unreliable: an abandoned client with a higher client id can write `meta.bootstrapState` concurrently, and Yjs resolves the conflict in its favour, which hides the winner's commit.
- **Session at the upgrade.** The browser path verifies the session cookie before `handleUpgrade`. A failed check completes the upgrade and closes the socket with `UNAUTHORIZED_CLOSE_CODE` (4401) and `UNAUTHORIZED_CLOSE_REASON`, so the client maps it to `failed` without retries, and no frame reaches Hocuspocus. A request without a cookie is destroyed before the upgrade, and so is one whose session lookup throws, so the provider treats it as a network drop and retries.
- **One document per socket.** The first frame names the document. A frame for a second document name on the same socket closes it with `POLICY_VIOLATION_CLOSE_CODE` (1008) and `SOCKET_SINGLE_DOCUMENT_REASON`, and the close is logged with the document id.
- **Close grace.** Every server-initiated close uses one `closeTimeout` of `SOCKET_CLOSE_GRACE_MS`, so a peer that ignores the close frame is terminated after that grace.
- **Open limit.** A user may open at most `OPEN_UNCOMMITTED_PER_MINUTE` (30, never above `BOOTSTRAP_SCAN_CACHE_ENTRIES`, so one user cannot evict every other document's scan progress) distinct documents that are not yet known committed in a rolling minute. A document counts once per user and minute (an `OpenBudget`: a `KeyedSlidingWindow` per user plus a `KeyedCooldown` per user and document), so a waiting page polling every 2 s, a reconnect, or a creator's open plus socket cost one entry. One budget, held in `services.openBudget`, is consulted before any log scan through `runtime.roomModeFor` on every path that decides a room mode: the open route (429 with `Retry-After`), `onAuthenticate` (access denied), the agent room locator and the export tool (a tool error with a rate-limited message). A room the process already knows is committed (cached or with a projection cursor) is never limited. Each refusal is logged with the document id.
- **Takeover.** `reserveCreator` first refreshes the reservation from the sockets still connected, so a holder with a connected socket is not taken over when the silence timer has run out. It then closes every connection whose attempt is not the new one with `SUPERSEDED_ATTEMPT_CLOSE_CODE` and the reason.
- **Release.** `onDisconnect` releases the reservation of the closing connection's attempt, and `reserveCreator` refreshes the attempt of every connected socket before it reserves. So closing one of two tabs keeps the reservation in effect, and another editor still gets 409 until the last socket is gone. The takeover close is logged with the document id.
- **Room load.** While uncommitted, `onLoadDocument` restores nothing, so a new attempt starts empty and abandoned partials stay out of the live room. Once committed, it materializes as today, starting from the commit snapshot.
- **Room unload.** Hocuspocus 2.15.3 unloads a room when its last connection closes (`unloadImmediately` defaults to true), so the next attempt loads an empty room through the uncommitted rule above. No manual unload is added.
- **Commit snapshot.** The snapshot holds the live room's state (`Y.encodeStateAsUpdate(document)`), never a `materialize` of the log, because the log still holds the abandoned partials. It is written through the existing `UpdateLog.writeSnapshot`; no new `snapshot` method is added.
- **Socket limits.** The socket server caps frames at `MAX_SOCKET_MESSAGE_BYTES`. The `ws` layer in `attach-collaboration.ts` counts frames per socket from the first frame, before authentication too, with one `SlidingWindow` per socket. The frame that exceeds the rate closes the socket with `POLICY_VIOLATION_CLOSE_CODE` and `SOCKET_RATE_LIMIT_REASON`. The Hocuspocus `beforeHandleMessage` hook is not used.

### Interfaces

**`libs/types/src/constants.ts`**

- `CREATOR_RESERVATION_MS = MINUTE_MS` (60 s of silence).
- `CREATOR_RESERVATION_MAX_MS = 5 * MINUTE_MS`, the cap on a reservation's total lifetime.
- `SOCKET_CLOSE_GRACE_MS = SECOND_MS`, the `closeTimeout` of the socket server.
- `BOOTSTRAP_SCAN_CACHE_ENTRIES = 32`, the entries of the commit scan progress map.
- `MAX_SOCKET_MESSAGES_PER_SECOND = 120`.
- `POLICY_VIOLATION_CLOSE_CODE = 1008`.
- `SUPERSEDED_ATTEMPT_CLOSE_CODE = 4403`, the same code upstream uses for access denied, so the client maps it to `failed` without retries.
- `UNAUTHORIZED_CLOSE_CODE = 4401` and `UNAUTHORIZED_CLOSE_REASON = 'Session expired'`, for a session that fails at the upgrade.
- `SOCKET_RATE_LIMIT_REASON = 'Too many messages per second'`.
- `SOCKET_SINGLE_DOCUMENT_REASON = 'One document per socket'`.
- `SUPERSEDED_ATTEMPT_REASON = 'This attempt was superseded'`.

**`libs/types/src/documents.ts`**

- `SOCKET_MESSAGE_UPLOAD_MULTIPLE = 8`. Raised from 4 on 2026-10-17 after Step 0: a text-dense 9.52 MiB DOCX syncs a 36,593,816-byte frame (3.7× its file size), 87% of a 40 MiB cap; 80 MiB leaves 2.2× over the worst measured frame and stays under the `ws` default of 100 MiB.
- `MAX_SOCKET_MESSAGE_BYTES = SOCKET_MESSAGE_UPLOAD_MULTIPLE * MAX_UPLOAD_BYTES`, which is 80 MiB (83,886,080 bytes).
- `CreatorTicket = { attempt: number; epoch: string }`, shared by the server and the web.
- `OpenedDocument = { document: DocumentSummary; role: DocumentRole; roomMode: RoomMode; creatorAttempt: number | null; creatorEpoch: string | null }`. The web reads both new fields for the socket URL, and the web fixtures change.

**`apps/server/src/collaboration/creator-reservations.ts`** (new)

```ts
export type CreatorReservation = { documentId: string; userId: string; attempt: number; reservedAt: number; expiresAt: number };
export class CreatorReservations {
  readonly epoch: string;
  constructor({ reservationMs, maxLifetimeMs, now }: { reservationMs: number; maxLifetimeMs?: number; now?: () => number });
  reserve({ documentId, userId }: { documentId: string; userId: string }): CreatorTicket | null;
  attemptOf({ documentId, userId }: { documentId: string; userId: string }): number | null;
  mayWrite({ documentId, attempt, epoch, isCommitted }: { documentId: string; attempt: number | null; epoch: string | null; isCommitted: boolean }): boolean;
  commit(documentId: string): void;
  touch({ documentId, attempt }: { documentId: string; attempt: number }): void;
  release({ documentId, attempt }: { documentId: string; attempt: number }): void;
  forget(documentId: string): void;
}
```

`CreatorTicket` is declared in `libs/types/src/documents.ts`. `reserve` returns a ticket with the new attempt (also for the holder, who supersedes its own live attempt), or `null` for a live holder and for a holder that lapsed at the cap and is still in its cooldown. Every ticket carries the per-process `epoch`, so an attempt from before a restart never matches. The constructor takes `reservationMs`, `maxLifetimeMs` (default `CREATOR_RESERVATION_MAX_MS`) and `now`, following `KeyedCooldown`, which also times the lapse cooldown. `commit` clears the reservation. `touch` never moves `expiresAt` past `reservedAt + maxLifetimeMs`.

**`apps/server/src/collaboration/bootstrap-state.ts`** (new)

`createBootstrapState({ updateLog, readModel })` returns `isCommitted(documentId)`, `commit({ documentId, connectionUserId, connectionActor, update, document })` (the append and the snapshot in one transaction; it replaced `markCommitted({ documentId, sequence, document })`) and `forget(documentId)`. It moves `findCommittedBootstrap` and `hasCommittedBootstrap` out of `collaboration-runtime.ts` and keeps the cache. `isCommitted` is snapshot-first, as described under Commit detection. When no snapshot exists, the paged scan resumes from the last row it read, and that progress lives in an LRU map of `BOOTSTRAP_SCAN_CACHE_ENTRIES` documents, so the 33rd uncommitted document evicts the first.

**`apps/server/src/collaboration/collaboration-runtime.ts`**

`DocumentRuntime` gains `reserveCreator({ documentId, userId }): CreatorTicket | null`, which closes superseded connections on takeover. The runtime and `services.reservations` are wired in `server.ts` first; the arguments of `createCollaborationServer` follow once the server lands. `roomMode` stays a pure read from `bootstrap.isCommitted`. `forget` also clears the reservation and the bootstrap cache.

**`apps/server/src/collaboration/collaboration-server.ts`**

- `CollaborationContext = { userId: string; documentId: string; actor: ClientActor; creatorAttempt: number | null; creatorEpoch: string | null }`, moved to `apps/server/src/collaboration/collaboration-context.ts`.
- `createCollaborationServer` gains `reservations: CreatorReservations` and `bootstrap: BootstrapState`.
- `onAuthenticate` stores the attempt and epoch from the URL queries (`CREATOR_ATTEMPT_QUERY_KEY` and `CREATOR_EPOCH_QUERY_KEY` in `libs/types/src/routes.ts`) and refuses, with a log line, an uncommitted room without a matching attempt, for members and agents alike.
- `onLoadDocument` restores nothing while uncommitted.
- `onChange` applies the fence, appends, detects the commit, and logs refusals once per connection through a `WeakSet` of contexts.
- `onDisconnect` releases the reservation of the closing connection's attempt; a connected sibling keeps it live through `reserveCreator`.

**`apps/server/src/collaboration/socket-message-limit.ts`** (new)

`SocketMessageLimit.breached(socket: object): boolean`, the per-socket helper that `attach-collaboration.ts` calls. It keeps one `SlidingWindow` per socket in a `WeakMap`, with `windowMs: SECOND_MS`.

**`apps/server/src/collaboration/attach-collaboration.ts`**

`new WebSocketServer({ noServer: true, maxPayload: MAX_SOCKET_MESSAGE_BYTES })`. A frame over the cap makes `ws` close with 1009 on its own, and this feature keeps that code. The frame never reaches Hocuspocus, so that breach is logged with a `console.warn` that carries no payload and no document id. `terminateOnError` returns early when the socket is already CLOSING, so the 1009 close frame is delivered. It is true again at c9c7745, together with the close timeout: the server is created with `closeTimeout: SOCKET_CLOSE_GRACE_MS`, so a peer that ignores a close frame is terminated after one second instead of holding the socket. The rate limit counts frames here from the first frame and closes with 1008. The same layer holds the one-document-per-socket check and the session check at the browser upgrade.

**`libs/history`**

- `isBootstrapCommitted({ document }: { document: Y.Doc }): boolean` is exported from `document-history.ts`, and `findBootstrapSequence` uses it.
- `projectPending` in `projection.ts` starts its bootstrap scan from the committed snapshot.
- The commit snapshot goes through the existing `UpdateLog.writeSnapshot`. The log format does not change.

**`apps/server/src/documents/documents-routes.ts`** implements the open route described under Data flow. **`agent-sessions`** answers `DOCUMENT_NOT_READY_ERROR` through `AgentToolError` when the room is uncommitted, and never reserves.

### Failure handling

- **The creator's first sync exceeds the payload cap.** The socket cap is eight times the upload cap, which is 80 MiB (83,886,080 bytes). The POC measured a 204-paragraph room state at 4.45 MB, and the plan measures a room state from a 10 MB DOCX before the cap is trusted. If a sync still exceeds the cap, `ws` closes with 1009 and the provider never reconnects after 1009. The creator sees the failed banner and Reload re-reserves. Step 0 sizes the cap from a measured 10 MB DOCX, so this is the residual risk, and the human checklist covers it. A test uploads a 10 MB DOCX and asserts commit.
- **The reservation expires while the creator is still syncing a large DOCX.** While a socket of the creator's attempt is connected the reservation stays live, so a creator that is syncing is not taken over, up to the lifetime cap of `CREATOR_RESERVATION_MAX_MS`. After the cap the reservation lapses even with a socket connected, and the lapsed holder waits one `CREATOR_RESERVATION_MS` cooldown before it can reserve the same document again. The commit wins if it lands before anyone else opens. If someone opens after expiry or the lapse, the old attempt is fenced and its socket is closed with 4403. The creator's page shows the failed banner with Reload. Reload returns 409 and the page waits for the new creator.
- **One socket names a second document.** The socket closes with 1008 and `SOCKET_SINGLE_DOCUMENT_REASON`, logged with the document id. A peer that ignores the close frame is terminated after `SOCKET_CLOSE_GRACE_MS`.
- **The session expired before the upgrade.** The socket closes with 4401, the client shows failed, and no frame reaches Hocuspocus.
- **A rate breach during a burst paste.** The socket closes with 1008 and the provider reconnects once. `attemptOf` still answers the holder, so the reconnect is accepted on the uncommitted room, re-syncs missed updates, and the banner goes lost, reconnecting, then recovered. Awareness frames count toward the 120. If the same paste breaches again on reconnect, the human checklist catches it.
- **The creator goes offline mid-create and another editor commits.** The creator's reservation expired and the other editor took over with attempt + 1. When the creator returns, its socket carries the old attempt on a committed room and is closed with 4403. The document keeps one paragraph set and the room still opens.
- **The holder opens the document twice (two tabs, or a reload in the middle of a create).** The second open answers Create with the next attempt and `reserveCreator` closes the first tab's sockets with 4403, so the old page shows the failed banner when it had already synced, or the editor failure notice (`EDITOR_FAILED_MESSAGE`) when it was still loading, and the new page restarts the create from an empty room. The abandoned partial stays in the log and is never loaded. A reload 8 s into a 10 MB create therefore ends with one committed bootstrap, not a stuck page. A superseded creator that was already ready sees the Failed banner only when the provider's refusal surfaces, measured at about 40 to 60 seconds after the takeover because SuperDoc reports the 4403 late. That delay is a known limit.
- **A server restart mid-create.** Reservations and counters vanish. The creator's reconnect is refused at authentication because no reservation exists, so the page shows failed with Reload. Reload reserves attempt 1, and the room loads empty because it is uncommitted. The abandoned partial seed stays in the log and is not loaded, so nothing duplicates. Editors who open during the downtime see the open error and retry. A creator that committed before the restart and reconnects after it carries an old epoch, is closed with 4403, and Reload opens the committed room as Join.
- **A refused socket before the first sync.** No connection report reaches the page before the first sync, so a page still on "Loading document…" would show nothing. Before the editor is ready, only a `failed` report or a connection exception (any reason) ends the load with the editor failure notice, which tells the user to reload. `lost` and `reconnecting` before ready are ignored, so a network blip while a creator streams a large DOCX keeps reconnecting. The banner applies only after the first sync, and after it every connection exception reaches the banner with its reason.
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
| Reservation expiry | 30 s, 60 s, 120 s | Recommendation: 60 s (`CREATOR_RESERVATION_MS`). Expiry only matters for takeover, so a longer sync never loses its commit. A connected socket keeps the reservation live, and the security review capped its total lifetime at 5 min (`CREATOR_RESERVATION_MAX_MS`). | Recommendation, 2026-10-17 |
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
- Lifetime cap: touches every 59 s stop extending after `CREATOR_RESERVATION_MAX_MS` and the next editor takes over; the lapsed holder is refused for one `CREATOR_RESERVATION_MS` and reserves again after it.
- Liveness: a holder with a connected socket is not taken over after the silence timer ran out; with no socket it is.
- Sockets: a second document name on one socket closes it with 1008; a peer that ignores a server close is destroyed within the grace; a browser upgrade without a session cookie never reaches Hocuspocus; an expired session closes with 4401.
- Commit scan: the scan resumes after the rows it already read; the 33rd uncommitted document evicts the first scan progress; a creator update never calls `readBatch` or `latestSnapshot`.
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
