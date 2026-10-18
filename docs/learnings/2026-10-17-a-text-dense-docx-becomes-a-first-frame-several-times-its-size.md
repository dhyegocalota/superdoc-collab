# A cap sized as a small multiple of the upload limit refuses the creator's first sync of a text-dense file
- Date: 2026-10-17
- Inspired by: room-admission Step 0 measurement; [ADR 0034](../adr/0034-collaboration-socket-payload-and-rate-limits.md) evidence; `fee812c`, `fadc0bd`
- Revisited: 2026-10-17 — still true
- Revisited: 2026-10-18 — still true

## Signal
A creator opens a document just under the 10 MB upload limit and the socket closes with 1009 before the room exists. Small and image-heavy files of the same size open fine.

## Cause
The creator seeds the whole room in one Yjs frame, and the room is an operation journal, so a text-dense file expands. A 9.52 MiB DOCX of 56,800 paragraphs with no images became a 36,593,816-byte frame, 3.7 times the file. A cap of 4 times the upload limit left 15 percent of headroom, and a denser file would have crossed it.

## Do
Size the frame cap from a measured worst case, not from the file size or from upstream's 1 MiB. `MAX_SOCKET_MESSAGE_BYTES` is 8 times `MAX_UPLOAD_BYTES`, which leaves 2.2 times for the measured fixture and stays under the `ws` default of 100 MiB. Keep the text-dense fixture in the E2E and assert the largest frame against the constant.

## Anchor
- `libs/types/src/constants.ts` (`MAX_SOCKET_MESSAGE_BYTES`), `e2e/fixtures/large-docx.ts`, `e2e/room-admission.spec.ts` (`a 10 MB DOCX commits and reopens as Join`)
- commits `fee812c` (fixture), `fadc0bd` (8 times), `3ec59c1` (docs)
