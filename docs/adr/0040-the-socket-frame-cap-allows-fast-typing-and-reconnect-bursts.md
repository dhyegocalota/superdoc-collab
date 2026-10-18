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
- `MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND = 5000` for awareness frames. An awareness frame sets in-memory state, runs the client declarer (one pass over the room's connections and client ids per update, plus a SQLite upsert only when the declared set changes) and is encoded and sent once per member; it appends nothing to the update log. The provider flushes them in a burst proportional to the keystrokes since the last pause. The figure of 5000 rests on that cost being bounded by the per-connection id cap.

A third limit bounds the cost of an awareness frame: `MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION = 8`. A real provider holds one awareness client id per connection, so eight leaves room for a reconnect overlap, and `onAwarenessUpdate` closes a connection that holds more with 1008 before the declarer runs. Without it one awareness frame (up to the 80 MiB payload cap) can claim about a million client ids, which Hocuspocus adds to the connection, and every later frame then pays a rebuild over all of them.

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
- The caps bound rate, not volume. A client that sends 999 update frames per second is never closed. Each update frame is one synchronous append to the update log (`onChange` in `collaboration-server.ts`) plus a room broadcast, so one socket's sustained ceiling goes from 120 to 1000 log rows per second, multiplied by the sockets a member opens. Awareness adds up to 5000 declarer passes and per-member broadcasts per second per socket, each bounded by eight ids per connection. Bytes were never bounded either, beyond the 80 MiB payload cap per frame.
- A flush larger than 5000 frames, a non-stop run of about 1700 keystrokes without a pause, still closes the socket once and the provider reconnects.
- Each awareness frame drives a declarer pass whose cost a client controls: measured at 0.13 ms with 100 client ids, 5.3 ms with 1,000 and 45 ms with 3,000 per pass, so one socket holding 1,000 ids saturates the event loop at about 190 awareness frames per second (already true under the old cap). The 5000 figure gives a CPU bound only together with the per-connection client id cap of eight and the one-pass contested-id scan introduced here.
- The client picks the bucket label before authentication, and Hocuspocus queues every frame that arrives before authentication for up to `COLLABORATION_SOCKET_TIMEOUT_MS` (10 s). The combined pre-authentication ceiling is therefore 6000 frames per second, about 60,000 in 10 s, up from 1000 per second; bytes stay bound by bandwidth and the queue replay is cut at the cap.
- The payload cap, one document per socket and the same caps on the version-room sockets from ADR 0034 are unchanged.
- Follow-ups for the owner, not part of this decision: no per-user or per-IP cap on concurrent sockets exists (count sockets per user id in `upgradeMember` against a constant in `libs/types`), and the declaration loop in `client-declarations.ts` is quadratic (a separate lane).
- ADR 0034's figure of 120 is superseded by this decision; the rest of 0034 stays Accepted.

## Evidence

The measurements above (`docs/learnings/2026-10-18-the-hocuspocus-provider-defers-awareness-and-flushes-it-in-one-burst-at-the-next-pause.md`); `apps/server/src/collaboration/frame-bucket.test.ts`, `socket-message-limit.test.ts` and `attach-collaboration.test.ts` (an awareness burst of 3000 frames in one second is accepted; the frame past either cap closes with 1008 and nothing after it is read).

## Revisit when

- A legitimate client is measured above about 500 update frames or about 2500 awareness frames in a rolling second.
- About 1700 uninterrupted keystrokes (no pause for the provider to flush) reach 5000 awareness frames at the next pause and close the socket once; a longer measured run than that with real typists moves the awareness cap.
- The update log grows noticeably from one member's sockets.
- A flooding client is seen to cost the server more than one closed socket per second can bound.
