# The collaboration socket closes with 1008 right after a long typing run, when the typing stops

- Date: 2026-10-18
- Inspired by: the tester's two-author walk on the single-cap lane ([ADR 0040](../adr/0040-the-socket-frame-cap-allows-fast-typing-and-reconnect-bursts.md)): two "Collaboration socket closed for sending too many messages" lines as the typing ended

## Signal

Ten seconds of non-stop typing runs clean, and the socket closes with 1008 about a second after the typing stops. The editor reconnects and nothing seems wrong.

## Cause

The provider defers awareness while keys are pressed and flushes it in one burst at the next pause, about three frames per keystroke since the last pause. Per socket per second, measured on a stack of the lane: 252 to 264 update frames and no awareness while typing, then 237 awareness frames at a paste after 120 keys and 1239 to 1285 after about 430 keys. A single cap of 1000 breaks at about 350 uninterrupted keystrokes. With no cap the burst is one second and then silence; the reconnect handshake is 7 to 8 frames.

## Do

Count awareness frames in their own bucket, sized from the flush (5000 per second), and keep updates at 1000 per second, about four times their measured peak. Read the frame kind from the two leading varints (room name length, message type), which every frame carries before authentication. Do not read a close that follows the end of typing as a typing-rate problem.

## Anchor

`apps/server/src/collaboration/frame-bucket.ts`, `apps/server/src/collaboration/socket-message-limit.ts`, `libs/types/src/constants.ts` (`MAX_SOCKET_UPDATE_FRAMES_PER_SECOND`, `MAX_SOCKET_AWARENESS_FRAMES_PER_SECOND`), `apps/server/src/collaboration/attach-collaboration.test.ts` (the awareness burst test), ADR 0040
