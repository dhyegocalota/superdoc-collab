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

`MAX_SOCKET_MESSAGES_PER_SECOND` becomes 1000, about eight times the fastest legitimate burst measured. Everything else in ADR 0034 stays: the counter lives at the `ws` layer, counts every frame per socket from the first one, awareness included, and a breach closes with 1008.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Raise the cap to 1000 frames per second (chosen) | one constant; still a hard cap on a flooding client; fits the fastest burst with room | a flooder gets eight times more frames before the close | n/a |
| Count bytes per second instead | follows the real cost | a flood of tiny frames costs the server almost no bytes and still burns CPU | does not bound the flood it exists for |
| Exempt awareness frames | awareness bursts never trip it | needs frame parsing at the `ws` layer plus a second cap for awareness | more code than the problem needs |
| Batch frames in the client | fewer frames | the batching lives in the provider inside `node_modules` | not ours to change |
| Keep 120 and let the provider reconnect | no change | ordinary typing reconnects the editor every second and the log line floods | the measured case is normal use |

## Consequences

- Typing at any realistic speed and the reconnect burst stay under the cap with room.
- A flooding client can send up to 1000 frames per second per socket before it is closed. The payload cap, the per-socket counter and one document per socket from ADR 0034 are unchanged.
- ADR 0034's figure of 120 is superseded by this decision; the rest of 0034 stays Accepted.

## Evidence

The measurement above; `apps/server/src/collaboration/attach-collaboration.test.ts` (a burst of 600 frames in one second is accepted and the socket stays open; the frame past the cap closes with 1008).

## Revisit when

- Typing or paste in a future SuperDoc version sends more than about 100 update frames per keystroke burst, so the headroom of eight times is gone.
- A flooding client is seen to cost the server more than one closed socket per second can bound.
