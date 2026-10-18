# 0040. The socket frame cap allows fast typing and reconnect bursts

- Status: Accepted
- Date: 2026-10-18
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [ADR 0034](0034-collaboration-socket-payload-and-rate-limits.md) revisit trigger ("legitimate bursts above 120 messages per second"); the frame measurement of 2026-10-18 recorded in [the spec](../features/socket-message-limit/spec.md)

## Context

[ADR 0034](0034-collaboration-socket-payload-and-rate-limits.md) capped a socket at 120 frames in a rolling second, counted from the first frame, awareness included. The figure was copied from the SuperDoc hosted server and never measured against the editor.

Measured on 2026-10-18 with a temporary per-second log in `attach-collaboration.ts`, typing 26 characters 50 ms apart into a new document:

- The server's update log advances by exactly 6 for every typed character, so SuperDoc v2 sends about six update frames per keystroke.
- At 20 keystrokes per second that is 120 frames per second, exactly the cap. The first socket peaked at 121 frames in a window and was closed with 1008 after 1.3 s.
- The provider reconnected within 2 ms, resent 36 update frames and sent a burst of 51 awareness frames in 4 ms. The typed text survived in full.
- The E2E helper types 50 keys per second, about 300 frames per second, so every E2E stack logged "Collaboration socket closed for sending too many messages".

## Decision

`MAX_SOCKET_MESSAGES_PER_SECOND` becomes 1000: eight times the measured peak of 121 frames in a second at 20 keys per second, and about three times the 300 frames per second of the E2E helper at 50 keys per second. Everything else in ADR 0034 stays: the counter lives at the `ws` layer, counts every frame per socket from the first one, awareness included, and a breach closes with 1008.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Raise the cap to 1000 frames per second (chosen) | one constant; still a hard cap on a flooding client; fits typing and the reconnect burst with room | a flooder gets about eight times more frames before the close | n/a |
| Count bytes per second instead | follows the real cost | a flood of tiny frames costs the server almost no bytes and still burns CPU | does not bound the flood it exists for |
| Exempt awareness frames | awareness bursts never trip it | needs frame parsing at the `ws` layer plus a second cap for awareness | more code than the problem needs |
| Batch frames in the client | fewer frames | the batching lives in the provider inside `node_modules` | not ours to change |
| Keep 120 and let the provider reconnect | no change | ordinary typing reconnects the editor every second and the log line floods | the measured case is normal use |

## Consequences

- Typing at any realistic speed and the reconnect burst stay under the cap with room.
- The cap bounds rate, not volume. A client that sends 999 frames per second is never closed. Each update frame is one synchronous append to the update log (`onChange` in `collaboration-server.ts`) plus a room broadcast, so one socket's sustained ceiling goes from 120 to 1000 log rows per second, multiplied by the sockets a member opens. Bytes were never bounded either, beyond the 80 MiB payload cap per frame.
- The payload cap, the per-socket counter, one document per socket and the same cap on the version-room sockets from ADR 0034 are unchanged.
- Follow-ups for the owner, not part of this decision: no per-user or per-IP cap on concurrent sockets exists (count sockets per user id in `upgradeMember` against a constant in `libs/types`), and the declaration loop in `client-declarations.ts` is quadratic (a separate lane).
- ADR 0034's figure of 120 is superseded by this decision; the rest of 0034 stays Accepted.

## Evidence

The measurement above; `apps/server/src/collaboration/attach-collaboration.test.ts` (a burst of 600 frames in one second is accepted and the socket stays open; the frame past the cap closes with 1008).

## Revisit when

- A legitimate client is measured above about 500 frames in a rolling second.
- The update log grows noticeably from one member's sockets.
- A flooding client is seen to cost the server more than one closed socket per second can bound.
