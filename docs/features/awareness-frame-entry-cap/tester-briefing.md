# Tester briefing: One awareness frame is bounded by 64 entries before Hocuspocus decodes it

## What changed

- `apps/server/src/collaboration/frame-bucket.ts`: `awarenessEntryCountOf` reads the payload length and the entry count of an awareness frame with the bounded varint reader.
- `apps/server/src/collaboration/socket-message-limit.ts` and `attach-collaboration.ts`: a frame claiming more than `MAX_AWARENESS_ENTRIES_PER_FRAME` (64) entries is withheld from every listener and its socket closes with 1008 and `SOCKET_AWARENESS_ENTRIES_REASON`.
- `apps/server/src/collaboration/awareness-origin.ts` and `collaboration-server.ts`: on the awareness `update` event, an id no connection holds joins its sender, and a sender touching an id another connection holds closes with 1008 and `SOCKET_AWARENESS_ORIGIN_REASON`.
- `libs/types/src/constants.ts`: the new cap and the origin reason. `apps/server/src/testing/socket-frames.ts`: the frame builder takes a clock and a state.
- ADR 0040, the socket-message-limit spec and test plan, the collaboration rule, a learning and the index READMEs.

## How to run

Start a stack of the branch, sign in as two demo users, open one document in both and type. Watch the server output for "Collaboration socket closed for claiming too many awareness entries in one frame". Raw frames need an authenticated socket on the document room.

## Red today, green after

Red texts below are the ones recorded when the red commits landed; this developer did not re-run them.

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `socket-message-limit.test.ts::an awareness frame claiming one entry more than the frame cap claims too many` (red ef426858) | `claimsTooManyEntries is not implemented` | the entry count is read and compared with 64 |
| `attach-collaboration.test.ts::an awareness frame claiming one entry more than the frame cap closes the socket with 1008 before the room decodes it` (red ef426858) | the close reason was `Too many awareness clients on one connection` | the frame is withheld and the entries reason is sent |
| `attach-collaboration.test.ts::ids a closed connection left behind and a second connection replays leave with that second connection` (red 23022237) | the replayed states outlived their second connection | the replayed ids join the replayer and leave with it |
| `attach-collaboration.test.ts::a connection updating an awareness id that another live connection holds is closed with the origin reason` and the removing twin (red 23022237) | the sender was never closed | the sender is closed with the origin reason |

Pins (green when they landed): updating and removing its own id, a provider reconnecting in a loaded room, exactly 64 entries reaching the room handler, a relay at the held clock keeping both sockets open, eight ids in one frame and ids split over two frames.

## Hypotheses to attack

1. Hypothesis: typing, pausing and reconnecting never close a socket for the origin or entries reasons. Break it by: type at 50 keys per second in two browsers, go offline and online in a room the other keeps open, close one tab and watch the other.
2. Hypothesis: a provider joining a room of up to 64 states is not closed. Break it by: open nine tabs on one document; the ninth sends relays of eight peers.
3. Hypothesis: a frame of 65 entries never reaches the room. Break it by: send one from a raw socket and check that no claimed id appears in the presence list.
4. Hypothesis: ids replayed by a second connection leave with it. Break it by: claim ids on socket A, close it, replay them on socket B at a higher clock, close B.

## Known gaps

- A room holding more than 64 awareness states closes a provider that joins it.
- A refused foreign update lands once before its sender is closed.
- Sockets per user are unbounded, an owner follow-up named in ADR 0040.
