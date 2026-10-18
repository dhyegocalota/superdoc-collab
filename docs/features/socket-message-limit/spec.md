# The socket frame cap allows fast typing and reconnect bursts

**Status:** Building
**Lane:** product
**Tier:** 🟡
**Owner approval:** approved 2026-10-18
**ADRs:** [0040](../../adr/0040-the-socket-frame-cap-allows-fast-typing-and-reconnect-bursts.md) (supersedes the 120 figure of [0034](../../adr/0034-collaboration-socket-payload-and-rate-limits.md))
**Not changing:** the payload cap, the per-socket counter from the first frame, awareness counting, one document per socket, close code 1008.

## Problem

Every E2E stack logs "Collaboration socket closed for sending too many messages" when a user types into a new document. The cap is 120 frames per second per socket.

## Evidence

Measured on 2026-10-18 on this lane with a temporary per-second log, typing 26 characters 50 ms apart into a new document:

- The update log advances by 6 per typed character: six update frames per keystroke. At 20 keys per second that is 120 per second.
- The first socket received 154 frames (145 updates, 5 awareness, 1 auth, 2 syncStep1, 1 syncStep2), peaked at 121 in a one-second window and was closed with 1008 after 1.3 s.
- The provider reconnected in 2 ms, resent 36 update frames and sent 51 awareness frames in 4 ms. All 26 characters survived in the editor and in the events API.
- The E2E helper types at 20 ms per key, about 300 frames per second.

## Goals

- Ordinary typing and the reconnect burst never close the socket.
- A flooding client is still closed.

## Non-goals

- Reducing the frames SuperDoc sends, parsing frames, counting bytes.

## Design

### Data flow

`MAX_SOCKET_MESSAGES_PER_SECOND` in `libs/types/src/constants.ts` goes from 120 to 1000, with a `// NB ADR 0040:` pointer. `SocketMessageLimit` and `attach-collaboration.ts` are unchanged.

### Failure handling

The frame past 1000 in a rolling second still reaches the room handler once, then the socket closes with 1008 and the provider reconnects.

## Test strategy summary

- Unit and integration (red first): a burst of 600 frames in one second is accepted and the socket stays open; the existing breach tests follow the constant.
- Re-run the scripted driver once against a stack of the lane: the log line is gone and the text survives.
