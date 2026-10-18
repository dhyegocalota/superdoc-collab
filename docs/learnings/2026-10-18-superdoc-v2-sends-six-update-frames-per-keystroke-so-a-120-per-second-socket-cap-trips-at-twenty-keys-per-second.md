# Ordinary typing closes the collaboration socket with 1008 "Too many messages per second"

- Date: 2026-10-18
- Revisited: 2026-10-18 — still true for update frames; the single cap of 1000 then broke on the awareness flush at the end of typing, so awareness has its own bucket (see the provider-defers-awareness learning)
- Inspired by: the server line "Collaboration socket closed for sending too many messages" in every E2E stack, and [ADR 0040](../adr/0040-the-socket-frame-cap-allows-fast-typing-and-reconnect-bursts.md)

## Signal

The server logs "Collaboration socket closed for sending too many messages" while a user types into a document. The editor reconnects within milliseconds and the text survives, so nothing looks broken.

## Cause

SuperDoc v2 sends about six update frames per keystroke: the server's update log advanced by exactly 6 for each typed character. At 20 keys per second that is 120 frames per second, the old cap of `MAX_SOCKET_MESSAGES_PER_SECOND`, copied from the SuperDoc hosted server without a measurement. The first socket peaked at 121 frames in a window and closed after 1.3 s. The reconnect then resent 36 update frames and sent 51 awareness frames in 4 ms. The E2E helper types at 50 keys per second, about 300 frames per second.

## Do

Size a per-socket frame cap from a measurement of the editor, not from another product's figure: count frames per second by kind while typing, leave several times the measured peak as headroom, and keep the cap hard. The cap is now 1000.

## Anchor

`libs/types/src/constants.ts` (`MAX_SOCKET_MESSAGES_PER_SECOND`), `apps/server/src/collaboration/attach-collaboration.ts`, `apps/server/src/collaboration/attach-collaboration.test.ts` (the burst test), ADR 0034, ADR 0040
