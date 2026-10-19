# The socket frame caps allow fast typing and reconnect bursts

**Status:** Shipped 2026-10-18
**Lane:** product
**Tier:** 🟡
**Owner approval:** approved 2026-10-18
**ADRs:** [0040](../../adr/0040-the-socket-frame-cap-allows-fast-typing-and-reconnect-bursts.md) (supersedes the 120 figure of [0034](../../adr/0034-collaboration-socket-payload-and-rate-limits.md))
**Not changing:** the payload cap, the per-socket counter from the first frame, one document per socket, close code 1008, the same cap on the version-room sockets (`closeOnBreach` attaches in the upgrade handler for both endpoint kinds), and the limiter's behaviour (only its prune is rewritten to drop the stale prefix instead of rebuilding the array on every frame).

## Problem

Every E2E stack logs "Collaboration socket closed for sending too many messages" when a user types into a new document. The cap is 120 frames per second per socket.

## Evidence

Measured on 2026-10-18 on this lane with a temporary per-second log, typing 26 characters 50 ms apart into a new document:

- The update log advances by 6 per typed character: six update frames per keystroke. At 20 keys per second that is 120 per second.
- The first socket received 154 frames (145 updates, 5 awareness, 1 auth, 2 syncStep1, 1 syncStep2), peaked at 121 in a one-second window and was closed with 1008 after 1.3 s.
- The provider reconnected in 2 ms, resent 36 update frames and sent 51 awareness frames in 4 ms. All 26 characters survived in the editor and in the events API.
- The E2E helper types at 20 ms per key, about 300 frames per second.

- Round two, on a stack of the lane with a per-socket per-second log: two authors typing 10 s at 20 ms per key after a 2000-character paste send 252 to 264 update frames per second each and no awareness while typing. The provider flushes awareness in one burst at the next pause, about three frames per keystroke since the last pause (237 after 120 keys, 1239 to 1285 after about 430), which crossed the single cap of 1000 within 1.1 s of the typing ending.

## Goals

- Ordinary typing, the paste, the awareness flush at the next pause and the reconnect burst never close the socket.
- A flooding client is still closed.

## Non-goals

- Reducing the frames SuperDoc sends, counting bytes, coalescing awareness on the server.

## Design

### Data flow

`libs/types/src/constants.ts` replaces `MAX_SOCKET_MESSAGES_PER_SECOND` with `MAX_SOCKET_UPDATE_FRAMES_PER_SECOND = 1000` and `MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND = 5000`, each with a `// NB ADR 0040:` pointer. `frameBucketOf` in `apps/server/src/collaboration/frame-bucket.ts` reads the two leading varints of a frame (room name length, then message type) and returns `FrameBucket.Awareness` for message type 1 and `FrameBucket.Updates` for everything else, including a frame it cannot parse. `MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION = 8`, also in `libs/types/src/constants.ts`, bounds the ids a connection holds: `overfullConnections` in `apps/server/src/collaboration/awareness-client-cap.ts` finds connections holding more client ids, `onAwarenessUpdate` closes them with 1008 and `SOCKET_AWARENESS_IDS_REASON` before the declarer runs, and the declarer finds contested ids in one pass instead of a scan per candidate. `SocketMessageLimit.breached` takes `{ socket, frame }` and keeps one sliding window per bucket per socket. `attach-collaboration.ts` passes the frame to it. The limiter's prune drops only the stale prefix of its entries instead of rebuilding the array on every frame.

### Follow-ups for the owner

- No per-user or per-IP cap on concurrent sockets exists: a member can multiply the per-socket ceiling. Count sockets per user id in `upgradeMember` against a constant in `libs/types`.

### Failure handling

The frame past either bucket's cap in a rolling second still reaches the room handler once, then the socket closes with 1008 and the provider reconnects.

### Known gaps for the owner

- **A separate defect, not a socket one.** When Bruno presses Enter at the document start while Ana types, Ana's concurrent keystrokes are rejected ("That edit could not be applied") and lost, with or without any cap: 436 of 2994 characters in the reproduction, identical with the cap effectively off. Reproduction: a new document, Ana types 120 characters and pastes 2000, Bruno joins, presses go-to-start, Enter and Up, then both type for ten seconds. Without Bruno's Enter every character lands on both editors. It belongs to the edit-rejection path.

## Test strategy summary

- Unit and integration (red first): `frameBucketOf` reads awareness, sync, auth and unparseable frames; `SocketMessageLimit` counts the two buckets apart; a burst of 600 update-sized frames and 3000 awareness frames in one second are accepted and the socket stays open; the frame past either cap closes with 1008.
- The headline case is the two-author walk: ten seconds of concurrent typing then a pause must not breach. Re-run it once against a stack of the lane: no "too many messages" line and no reconnect.
