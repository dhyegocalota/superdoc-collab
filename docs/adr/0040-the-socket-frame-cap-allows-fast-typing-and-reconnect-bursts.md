# 0040. The socket frame caps allow fast typing and reconnect bursts

- Status: Accepted
- Date: 2026-10-18
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [ADR 0034](0034-collaboration-socket-payload-and-rate-limits.md) revisit trigger ("legitimate bursts above 120 messages per second"); the frame measurement of 2026-10-18 recorded in [the spec](../features/socket-message-limit/spec.md)

## Context

[ADR 0034](0034-collaboration-socket-payload-and-rate-limits.md) capped a socket at 120 frames in a rolling second, counted from the first frame, awareness included. The figure was copied from the SuperDoc hosted server and never measured against the editor.

Measured on 2026-10-18 with a temporary per-socket per-second log, in two rounds:

- **Typing alone (26 characters, 50 ms apart).** The server's update log advances by exactly 6 for every typed character, so SuperDoc v2 sends about six update frames per keystroke. At 20 keystrokes per second that is 120 frames per second, exactly the old cap; the first socket peaked at 121 and was closed with 1008 after 1.3 s. The provider reconnected within 2 ms, resent 36 update frames and sent a burst of 51 awareness frames in 4 ms.
- **Two authors typing 10 s at 20 ms per key after a 2000-character paste.** Each socket sent a steady 252 to 264 update frames per second (about 5.2 per keystroke) and no awareness while keys were pressed. The provider defers awareness and flushes it in one burst at the next pause, about three frames per keystroke since the last pause: 237 at the paste after 120 keys, and 1239 to 1285 in one second after about 430 keys. That burst crossed a single cap of 1000 within 1.1 s of the typing ending and closed both sockets with 1008.
- With the cap effectively off, the burst is one second of awareness and then silence, and the reconnect handshake is 7 to 8 frames.

## Decision

Two buckets, each a rolling one-second window per socket, counted at the `ws` layer from the first frame, before authentication:

- `MAX_SOCKET_UPDATE_FRAMES_PER_SECOND = 1000` for every frame that is not awareness: updates, sync steps, auth and any frame that cannot be parsed. Updates peak near 264 per second at 50 keys per second.
- `MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND = 5000` for awareness frames. An awareness frame sets in-memory state, runs the client declarer (one pass over the room's connections and client ids per update, plus a SQLite upsert only when the declared set changes) and is encoded and sent once per member; it appends nothing to the update log. The provider flushes them in a burst proportional to the keystrokes since the last pause. The figure of 5000 rests on that cost being bounded by the frame entry cap.

Two further limits bound the cost of an awareness frame. `MAX_AWARENESS_ENTRIES_PER_FRAME = 64` bounds the entries one frame may claim, and `MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION = 8` bounds the ids a connection may hold. A real provider holds one awareness client id per connection, so eight leaves room for a provider that holds a few ids. The stock provider relays every change it applies, one entry per changed peer, so a join into a room holding N states, or N peers leaving at once, sends N entries; 64 leaves room for those relays and still stops a frame that claims a million.

- **Frame entry cap, at the `ws` layer.** A wrapper around the socket's event dispatch (it intercepts `emit`, so it also runs before the listeners Hocuspocus adds later; version-room sockets are wrapped too, harmlessly) reads an awareness frame as far as its entry count (the two varints after the message type: the payload length, then the entry count; each varint is read at most six bytes deep, and a frame whose room name length or message type is still continuing at its sixth byte, or whose payload length or entry count is longer than five bytes or truncated, counts as claiming an unbounded entry count, because the decoder behind this layer accepts padding of any length while scanning for its end would cost a whole 80 MiB frame twice) and closes the socket with 1008 and `SOCKET_AWARENESS_ENTRIES_REASON` when the count exceeds 64, before Hocuspocus decodes anything. A check in `onAwarenessUpdate` alone runs too late: by then Hocuspocus has decoded every claimed id, stored every state, added the ids to `connection.clients` and broadcast all of them to every member, and the close broadcasts the removals again, so one frame up to the 80 MiB payload cap cost its size times the members twice.
- **Hook-level cap and origin check.** `onAwarenessUpdate` closes a connection that holds more than eight ids over several frames with `SOCKET_AWARENESS_IDS_REASON`, before the declarer runs. An awareness `update` listener, registered when a document loads, closes with 1008 and `SOCKET_AWARENESS_ORIGIN_REASON` a sender that updates an id another connection holds. A removal never closes its sender, and an update of an id held by another socket of the same user moves the id to the sender instead of closing it, because the provider keeps its client id across reconnects while the server may still hold the old half-open socket for about 20 s. The stock provider relays removals of every remote state when it closes and flushes them after it reconnects, so a legitimate peer sends removals of ids others hold. Hocuspocus keeps `awareness.meta` for a remote id after removing its state, so a second connection that resends the ids of a closed one at a higher clock has them filed under `updated`, never `added`; they never joined its `clients`, the cap never tripped and the states outlived that connection for the 30 s outdated window, refreshable with one frame every 25 s. The same listener adopts an id no connection holds into the sender's `clients`: the cap then counts it and the close removes its state. A relay of a peer's state at the clock the room already holds is filed as neither added, updated nor removed, so the listener never sees it and the relays of the stock provider are spared. Closing a sender merely for an id outside its own `clients` was built first and rejected, because the same filing happens to a provider that reconnects while the room stays loaded.

The kind is read from the two leading varints every frame carries (the room name length, then the message type), which is available before authentication. A breach of either bucket closes with 1008, as in ADR 0034, and the rest of 0034 stays.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Two buckets: 1000 for everything else, 5000 for awareness (chosen) | typing and the pause flush both fit with room; both stay hard caps; awareness costs no log append | a ten-line parse of the frame kind at the `ws` layer | n/a |
| One higher cap | one constant | the awareness flush grows with the keystrokes since the last pause, so any fixed value breaks on a long enough run; 1000 broke at about 350 keys | moves the line, does not remove it |
| Count bytes per second instead | follows the real cost | a flood of tiny frames costs the server almost no bytes and still burns CPU | does not bound the flood it exists for |
| Exempt awareness frames | awareness bursts never trip it | an unbounded flood of awareness frames | no cap at all on a kind a client controls |
| Coalesce awareness on the server | fewer frames to handle | changes frame semantics and adds state per room | more machinery than the problem needs |
| Batch frames in the client | fewer frames | the batching lives in the provider inside `node_modules` | not ours to change |
| Keep 120 and let the provider reconnect | no change | ordinary typing reconnects the editor every second and the log line floods | the measured case is normal use |

## Consequences

- Typing at any realistic speed, the paste and the pause flush stay under the caps with room. Updates have about four times headroom over 264 per second; awareness has about four times headroom over the largest flush measured (1285).
- The caps bound rate, not volume. A client that sends 999 update frames per second is never closed. Each update frame is one synchronous append to the update log (`onChange` in `collaboration-server.ts`) plus a room broadcast, so one socket's sustained ceiling goes from 120 to 1000 log rows per second, multiplied by the sockets a member opens. Awareness adds up to 5000 declarer passes and per-member broadcasts per second per socket. The `ws` layer decodes an awareness frame only to its entry count before Hocuspocus sees it, so the per-frame cost is bounded by 64 entries parsed at the `ws` layer before Hocuspocus decodes, the replay of ids that a closed connection left behind is closed by the origin check (a replayed id is adopted by its sender and removed at its close), though canonical frames of fresh ids with a null state still grow `awareness.meta` (follow-ups), and the hook-level cap of eight bounds only what a connection holds over several frames. Each close writes one warn line without payload, and a socket closed for an overclaim drops every later message silently. The origin check rests on the server being the clock source: a state that changes the room carries a clock above the one the server holds, which is what files it under `updated` and attributes it to its sender. Bytes were never bounded either, beyond the 80 MiB payload cap per frame.
- A flush larger than 5000 frames, a non-stop run of about 1700 keystrokes without a pause, still closes the socket once and the provider reconnects.
- The declarer before 2f58f467 measured 0.13 ms per pass with 100 client ids, 5.3 ms with 1,000 and 45 ms with 3,000, so one socket holding 1,000 ids saturated the event loop at about 190 awareness frames per second. The 5000 figure gives a CPU bound only together with the frame entry cap of 64 and the one-pass contested-id scan introduced here.
- The stock provider relays every awareness change it applies back to the server, other peers' ids included. The server ignores a relayed state at the clock it already holds, but the frame still carries one entry per peer, so a provider that joins a room already holding more than 64 awareness states, or that sees more than 64 peers leave at once, is closed with `SOCKET_AWARENESS_ENTRIES_REASON`. Rooms of up to 64 simultaneous providers are unaffected. Raising the frame cap for larger rooms is an owner decision.
- The client picks the bucket label before authentication, and Hocuspocus queues every frame that arrives before authentication for up to `COLLABORATION_SOCKET_TIMEOUT_MS` (10 s). The combined pre-authentication ceiling is therefore 6000 frames per second, about 60,000 in 10 s, up from 1000 per second; bytes stay bound by bandwidth and the queue replay is cut at the cap.
- The payload cap, one document per socket and the same caps on the version-room sockets from ADR 0034 are unchanged.
- Follow-ups for the owner, not part of this decision: no per-user or per-IP cap on concurrent sockets exists (count sockets per user id in `upgradeMember` against a constant in `libs/types`). A `ws`-layer check of the client ids in an awareness frame against the ids of the socket that sent it would also close two known gaps: a forged update of a live peer's id at clock plus one is stored and broadcast before its sender is closed, and canonical frames of 64 fresh ids with a null state add about 320,001 `awareness.meta` entries and 32.7 MB of heap per second with no event for the checks.
- ADR 0034's figure of 120 is superseded by this decision; the rest of 0034 stays Accepted.

## Evidence

The measurements above (`docs/learnings/2026-10-18-the-hocuspocus-provider-defers-awareness-and-flushes-it-in-one-burst-at-the-next-pause.md`); `apps/server/src/collaboration/frame-bucket.test.ts`, `socket-message-limit.test.ts` and `attach-collaboration.test.ts` (an awareness burst of 3000 frames in one second is accepted; the frame past either cap closes with 1008 and nothing after it is read; a frame claiming 65 entries closes with the entries reason and one claiming 64 does not before the room records any of them; ids replayed by a second connection leave with it; touching an id another live connection holds closes with the origin reason; a relay at the held clock stays open), and [the frame entry cap feature](../features/awareness-frame-entry-cap/spec.md).

## Revisit when

- A legitimate client is measured above about 500 update frames or about 2500 awareness frames in a rolling second.
- About 1700 uninterrupted keystrokes (no pause for the provider to flush) reach 5000 awareness frames at the next pause and close the socket once; a longer measured run than that with real typists moves the awareness cap.
- The update log grows noticeably from one member's sockets.
- A flooding client is seen to cost the server more than one closed socket per second can bound.
- Typing runs of about 15 s followed by a pause keep closing sockets with the update-bucket breach: the tester saw it in 2 of 3 runs, about 1344 frames in the next second, at the edge of the 1000 per second cap. The provider reconnects at once; raising the cap is an owner follow-up.
