---
paths:
  - "apps/web/**"
  - "apps/server/**"
---

# SuperDoc v2 collaboration

Citations to `poc/...` name files of the proof of concept removed on 2026-10-17; the facts stand, the evidence is summarized in ADR 0001–0004.

SuperDoc facts about the browser UI (editing surface, focus, zoom, iframes) live in `.claude/rules/web-ui.md`.

## Versions
- `superdoc` 2.23.0, `@superdoc/sdk` 2.20.0, `@hocuspocus/server` 2.15.3, `@hocuspocus/provider` ^2.15.3, `yjs` ^13.6.33. (poc/package.json)

## Client configuration
- A document is collaborative through `v2Collaboration: { providerType: 'hocuspocus', documentId, serverUrl, roomMode: 'create' | 'join', token }`. (poc/client/main.ts)
- The first author opens the room with `roomMode: 'create'` and the seed DOCX; the others use `'join'`. (poc/client/main.ts, poc/tests/harness.ts)
- The room name on the server is `sd2/v2.1/<documentId>`. (poc/tests/harness.ts, ADR 0001)
- Readiness is signalled by `onCollaborationReady`; connection changes by `onCollaborationConnectionChange`. (poc/client/main.ts)
- Text is read with `superdoc.activeEditor.doc.getText({})`. (poc/client/main.ts)

## SuperDoc limits
- v2 gives no ProseMirror access and no version-history API. (ADR 0001)
- The `diff.capture/compare/apply` payload is opaque. (ADR 0001)
- `trackChanges.list()` returns author, ISO date, inserted/deleted text, `imported: true` and the room's `blockId` scheme; it works in the browser and in Node via `@superdoc/sdk`. (poc/RESULTS.md, poc/tests/node/t10-imported-tracked-changes.test.ts)
- The room `Y.Doc` is an operation journal. Top-level maps: `meta`, `package`, `operations`, `checkpoints`, `shards`, `content`, `root-op-evidence`. Transactions carry `createdByClient` and `createdAtMs`; `author` is always `headless-kernel`, so identity comes from the transport. (poc/RESULTS.md)
- The room grows about 2.8 KB per keystroke by itself. (poc/RESULTS.md)

## Editing behavior
- A keyboard paragraph merge (Backspace at a paragraph start, Delete at an end) is a no-op in collaborative mode; use `doc.blocks.merge({ first, second })`. (poc/RESULTS.md, poc/tests/e-edge-cases.spec.ts)
- Undo is recorded as a deletion by the undoer; it emits reversed per-character deletions. (poc/RESULTS.md E8; reversed per-character form from the task brief)
- Under concurrent remote edits, a click on a text run occasionally leaves focus on `BODY`; the caret occasionally lands out of order under fast concurrent typing. Neither affects convergence. (poc/RESULTS.md)

## Build
- The client must be built and served with `vite preview`; the dev server fails with SuperDoc's worker (task brief). The POC pins port 5199. (poc/vite.config.ts)

## Hocuspocus server
- Use `new Hocuspocus({...})`; the exported `Server` is a singleton. (poc/RESULTS.md, poc/server/collaboration-server.ts)
- `onAwarenessUpdate` receives the document creator's context, not the sender's; tie awareness clientIds to sockets through `document.connections[*].clients`. (poc/RESULTS.md, ADR 0002)
- `onAuthenticate` returns `{ userId }` as the connection context. (poc/server/collaboration-server.ts)
- In `apps/server` it returns `{ userId, documentId, actor }`. The upgrade path in `request.url` picks the credential: `/collaboration` takes the session cookie only, `/collaboration/agent` takes a room token in the `token` field only and skips the `Origin` check. (apps/server/src/collaboration/collaboration-server.ts, ADR 0025)
- The room token and the read-only flag are fixed when an SDK session opens; replace a cached session when the role, the name or the token age changed. (apps/server/src/agent/agent-sessions.ts, docs/learnings/2026-10-17-a-reused-sdk-session-keeps-the-room-token-and-read-only-flag-from-open.md)
- Load the room with `Y.applyUpdate(document, state, 'update-log-replay')`; `onChange` skips that origin. (poc/server/collaboration-server.ts)
- `onCollaborationConnectionChange` reported `synced -> degraded -> degraded` across a server restart and never a recovery state, though sync resumed; do not rely on it for recovery. (poc/RESULTS.md)
- A document has one creator while it is uncommitted. `CreatorReservations` reserves the first editor who opens it and gives every other editor and reader 409 until the commit; reservations, attempt counters and the process `epoch` live in the memory of the one server process. (apps/server/src/collaboration/creator-reservations.ts, ADR 0033)
- The attempt counter only grows and survives a release. A release (the last connection of the attempt closed) expires the reservation at once but `attemptOf` still answers the holder until another editor reserves, so the creator's own reconnect is accepted. Expiry means silence: each update of the latest attempt refreshes it. (apps/server/src/collaboration/creator-reservations.ts, ADR 0033)
- The write fence is "the attempt is the latest one issued in this epoch", not "the reservation is live". After the commit only the attempt that committed, or a socket that claims no attempt, may write; an abandoned creator that reconnects later is refused. (apps/server/src/collaboration/creator-reservations.ts, ADR 0033)
- A takeover closes every connection of the room whose attempt differs with 4403 and `SUPERSEDED_ATTEMPT_REASON`, including the same user's older tabs when it opens again. (apps/server/src/collaboration/collaboration-runtime.ts, ADR 0033)
- The socket carries its ticket as the `attempt` and `epoch` upgrade queries. `onAuthenticate` refuses a socket on an uncommitted room unless `attemptOf` answers the session user with that attempt and `mayWrite` accepts it, for members and agents alike, so agents never create; the room token carries no attempt. On a committed room a socket with a ticket other than the committing one of this epoch is made read-only and closed with 4403 by the `connected` hook. (apps/server/src/collaboration/collaboration-server.ts, ADR 0033)
- `onChange` fences first: a refused update is dropped and logged once per connection with the document id, never the payload. The first update of the latest attempt whose live room satisfies `isBootstrapCommitted` goes through `bootstrap.commit` (append and snapshot of the live room in one transaction) and then `reservations.commit`; every other update is appended and refreshes the reservation. (apps/server/src/collaboration/collaboration-server.ts, ADR 0033)
- `onDisconnect` releases the reservation only when no other connection of the room carries the same attempt. `onLoadDocument` restores nothing while the room is uncommitted, so a new attempt starts empty and abandoned partials stay in the log only. (apps/server/src/collaboration/collaboration-server.ts, ADR 0033)
- Close codes: 4403 for a superseded or stale attempt, 1008 for a rate breach, 1009 for a frame over `MAX_SOCKET_MESSAGE_BYTES`. `ws` closes with 1009 on its own, and `terminateOnError` returns early on a CLOSING socket so that close frame reaches the client. (apps/server/src/collaboration/attach-collaboration.ts, ADR 0034)
- The rate limit lives at the `ws` layer, not in a Hocuspocus hook, because `connection.close()` inside `beforeHandleMessage` does not stop the message. `SocketMessageLimit` counts every frame per socket from the first one, before authentication, in a rolling second. The frame past `MAX_SOCKET_MESSAGES_PER_SECOND` still reaches the room handler (the emitter runs every listener of that event), then the listeners are removed so nothing after it does, and the socket closes with 1008. Logs carry no payload. (apps/server/src/collaboration/socket-message-limit.ts, ADR 0034)
- The browser upgrade is refused before `handleUpgrade` unless the request carries a session the auth layer reads, so an unauthenticated client cannot queue frames. The agent path cannot be checked there because its room token travels in the first protocol message; it is loopback-only. `onConnect` pins a socket to the first document name it names and closes any other name with 1008 and `SOCKET_SINGLE_DOCUMENT_REASON`, because Hocuspocus queues frames for a document that never authenticates. (apps/server/src/collaboration/attach-collaboration.ts, apps/server/src/collaboration/collaboration-server.ts, ADR 0034)
- An agent is refused on an uncommitted room before any ticket check. A reservation's total lifetime is capped at `CREATOR_RESERVATION_MAX_MS`: `touch` never extends `expiresAt` past `reservedAt` plus the cap. (apps/server/src/collaboration/collaboration-server.ts, apps/server/src/collaboration/creator-reservations.ts, ADR 0033)
- Commit detection is snapshot-first: an abandoned partial and the winner's seed are concurrent Yjs writes, so replaying the whole log can end as "never committed". `isCommitted` and the projection start read the commit snapshot, and fall back to the log scan only when no snapshot exists. (apps/server/src/collaboration/bootstrap-state.ts, libs/history/src/projection.ts, ADR 0033)
- The commit snapshot is `Y.encodeStateAsUpdate` of the live room, never a `materialize` of the log, and it is written in the same SQLite transaction as the committing update (`UpdateLog.appendCommitted`). (apps/server/src/collaboration/bootstrap-state.ts, ADR 0033)
- The fence trusts the server's commit answer as well as the live room marker, because any member can overwrite `meta.bootstrapState` in the live room. `bootstrap.isCommitted` keeps the scan progress of an uncommitted room (rows read plus the partial `Y.Doc`) and resumes after it, so repeated opens and authentications never replay the log from zero. (apps/server/src/collaboration/collaboration-server.ts, apps/server/src/collaboration/bootstrap-state.ts, ADR 0033)
- A reservation stays live while any socket of its attempt is connected: `reserveCreator` refreshes the attempt of every connected socket before it reserves, so a takeover needs the last socket gone and the silence expiry, or the lifetime cap. (apps/server/src/collaboration/collaboration-runtime.ts, ADR 0033)
- Every server-initiated close is bounded by one setting: the socket server is created with `closeTimeout: SOCKET_CLOSE_GRACE_MS`, so a peer that ignores any close frame (1008 breach, one-document, idle, 4403, 1009) loses the socket after one second instead of ws's 30. `@types/ws` does not declare the option, so the options constant adds it by type. (apps/server/src/collaboration/attach-collaboration.ts, ADR 0034)
- The commit-scan progress of uncommitted documents lives in an `LruMap` of `BOOTSTRAP_SCAN_CACHE_ENTRIES`; an evicted document rescans from sequence 0. A holder whose reservation lapsed at the lifetime cap is refused for `CREATOR_RESERVATION_MS` through a `KeyedCooldown` keyed by document and user, so it cannot win every lapse. (apps/server/src/collaboration/bootstrap-state.ts, apps/server/src/collaboration/creator-reservations.ts, ADR 0033)
- A browser whose session expired is let through the upgrade and closed with 4401 and the reason `Session expired`, so the provider treats it as an authentication failure and stops retrying; Hocuspocus never sees the socket. A request with no cookie, or one whose session lookup throws, is destroyed, so the provider retries. (apps/server/src/collaboration/attach-collaboration.ts, ADR 0034)
- The fence branches on the attempt first: a socket with an attempt is checked by `mayWrite` alone, so a creator update never queries the log or the snapshots; only an attempt-less socket consults the live marker and `bootstrap.isCommitted`. (apps/server/src/collaboration/collaboration-server.ts, ADR 0033)
- A user may open at most `OPEN_UNCOMMITTED_PER_MINUTE` (never above `BOOTSTRAP_SCAN_CACHE_ENTRIES`) distinct documents that are not yet known committed per rolling minute; a document counts once per user and minute (`OpenBudget`), so waiting-page polls and reconnects are free. `runtime.roomModeFor` consults the budget before any log scan and is the only way the open route, `onAuthenticate`, the agent room locator and the export tool decide a room mode: 429 with `Retry-After`, access denied, or an agent tool error. A room the process knows is committed (cache or projection cursor) is never limited. So one user cannot thrash the bounded scan cache on any path. (apps/server/src/collaboration/room-modes.ts, apps/server/src/limits/open-budget.ts, ADR 0033)
- A holder who opens the same uncommitted document again is issued a new attempt (the lifetime cap keeps counting from the first reservation) and `reserveCreator` closes the old attempt's sockets with 4403: the newest tab wins, so a reload mid-create restarts the create cleanly. (apps/server/src/collaboration/creator-reservations.ts, apps/server/src/collaboration/collaboration-runtime.ts, ADR 0033)
- The lifetime cap survives a release: a holder that reopens within `CREATOR_RESERVATION_MS` of the release (or while live) keeps the original `reservedAt`, so close and reopen cannot reset it; the lapse cooldown applies only to such a continuation. (apps/server/src/collaboration/creator-reservations.ts, ADR 0033)
