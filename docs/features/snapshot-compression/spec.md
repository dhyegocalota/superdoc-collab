# Snapshot compression: a joiner downloads the room in a fraction of the bytes

**Status:** Shipped 2026-10-20
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 ("quero implementar tudo isso")
**ADRs:** [0034](../../adr/0034-collaboration-socket-payload-and-rate-limits.md), [0040](../../adr/0040-the-socket-frame-cap-allows-fast-typing-and-reconnect-bursts.md)
**Not changing:** the Hocuspocus wire protocol, the update log and snapshot encoding, the payload and frame caps, the room restore.

## Problem

Requirement 34 asks for an instant open. A joiner of the 9.5 MB fixture (`e2e/fixtures/large-docx.ts`) downloads the whole room as one 36.6 MB frame, uncompressed. On a slow link that download is the open.

## Measured

| What | Number |
|------|--------|
| Frame sent to every socket of the large fixture, before | 36,605,180 bytes on the wire |
| Same frame with permessage-deflate (fastest level) | about 4,940,000 bytes on the wire, 13.5 percent |
| `deflateRaw` of the stored snapshot at level 1, 3 and 6 | 4.94 MB in 43 ms, 5.13 MB in 70 ms, 4.92 MB in 188 ms |
| Stored snapshot, Yjs V1 | 36,602,018 bytes |
| Stored snapshot, Yjs V2 | 25,917,145 bytes, 70.8 percent of V1 |
| `Y.applyUpdate` V1 / `Y.applyUpdateV2` | 1281 ms / 1640 ms |
| `Y.encodeStateAsUpdate` V1 / V2 | 342 ms / 236 ms |
| V2 snapshot after deflate level 6 | 1.50 MB |
| Resident memory per socket that carried one frame, window 15 and memory level 8 (the `ws` default) | 336 KiB |
| Same, window 13 and memory level 4 | 231 KiB |
| Same, window 12 and memory level 3 (chosen) | 79 KiB |
| Large snapshot at level 1, window 15 / 13 / 12 / 10 | 4.94 MB / 5.07 MB / 5.17 MB / 5.34 MB |

## Goals

| Goal | Rule |
|------|------|
| Compress the socket | The collaboration `ws` server negotiates permessage-deflate. A frame under 1 KiB skips compression, the fastest level is used, concurrent compressions are bounded, neither side keeps its window between messages, and the window is 4 KiB in both directions with memory level 3. `ws` 8.22 still keeps its zlib streams on a socket after the first frame of 1 KiB or more, so the window and memory level are what bound the per-socket cost. |
| Caps stay on the real size | `maxPayload` in `ws` counts the inflated bytes, so ADR 0034's 80 MiB cap and the frame caps of ADR 0040 apply to what the room would receive. A tiny compressed frame that inflates past the cap closes with 1009. |
| Pre-authentication cap | Until the server has sent a socket its first frame, the socket may send `PRE_AUTHENTICATION_MAX_INFLATED_BYTES` (64 KiB) in total, then it is closed with 1008. The loopback bootstrap socket is exempt. |
| Inflated budget | A socket that inflates more than `MAX_INFLATED_BYTES_PER_SECOND` (80 MiB, one maximum frame) in a rolling second is closed with 1008 and the rate-limit reason. The loopback bootstrap socket is exempt. |
| Encoding decision | Yjs V2 is measured and not adopted. |

## Non-goals

- Changing the encoding Hocuspocus puts on the wire: it sends V1 and the provider expects it.
- Compressing HTTP responses.

## Design

### Data flow

The browser offers `permessage-deflate` in its upgrade and the server accepts it with `server_no_context_takeover`, `client_no_context_takeover` and a 12-bit window each way. Every message of 1 KiB or more is deflated at level 1 by `ws` before it is framed; the receiver inflates it before the payload cap is checked.

### Inflated budget

The frame cap counts frames, not bytes, and `ws` inflates before the message event. Without a byte budget an authenticated client could send a thousand frames of 80 KB a second, each inflating to the payload cap, and all sockets share four zlib slots. `SocketMessageLimit.exceedsInflatedBudget` records the inflated size of each frame in a `SlidingWindow` in units of 16 KiB (a smaller frame costs nothing here and is already bounded by the 1000 frames per second cap, at most 16 MB a second) and breaches past 5120 units, which is 80 MiB.

Why 80 MiB: ADR 0034 sizes the payload cap so that the largest legitimate single frame, a text-dense 9.5 MB document (3.7 times its file size), fits with margin. A budget below the cap would close a legitimate maximum frame; the padded-update test pins that one such frame is accepted. A typing second is at most 1000 update frames of a few hundred bytes, well under one unit each, so editing never approaches the budget. The worst case after the change is 80 MiB of inflation per socket per second instead of about 78 GiB.

A lower inflated cap for browser frames than for the bootstrap socket was considered and not done: `maxPayload` is one value for the whole `ws` server, the bootstrap socket sends the 36.6 MB state in one frame, and a browser can legitimately paste a block as large as an upload. The budget bounds the repeat, which is the amplification; the single frame is already bounded by ADR 0034.

The bootstrap socket on `/collaboration/bootstrap` is loopback-only and server-minted, so it carries no budget; its frame-rate cap is unchanged.

### Pre-authentication cap

Hocuspocus queues every frame that arrives before the authentication answer, per document and without a bound. A member socket that never sends Auth could therefore pin memory: frames of 80 KB on the wire inflating to just under the 80 MiB cap, about 4 MB sent for about 4 GB queued, and the per-second budget alone still lets 80 MiB a second through. So until the server has sent the socket anything (Hocuspocus answers a good Auth with the first frame it writes), the socket may inflate 64 KiB in total, never reset by time. A real Auth frame is a room name and a token, a few hundred bytes. The browser provider and the SDK agent send Auth first, and the four tests of `room-admission.spec.ts` pass with the cap. A queued backlog per socket is now at most 64 KiB; the open count of sockets is bounded by the session check at the upgrade and the frame rate cap, and a per-user socket cap was considered and not added because it needs a registry of live sockets per user that the version rooms and the agent path would also have to join.

### Interfaces

One option on the socket server in `apps/server/src/collaboration/attach-collaboration.ts`. No new route, constant in `libs/types` or message.

### Failure handling

| Failure | Behaviour |
|---------|-----------|
| A client that does not offer the extension | The socket works uncompressed |
| More than four compressions at once | `ws` queues the extra ones until a slot frees |
| A frame that inflates past the cap | `ws` closes with 1009 before the room sees it |

## V2 decision

V2 shrinks the stored snapshot by 29 percent but decoding it is 28 percent slower than V1, and restoring a room decodes the snapshot once and applies the encoded state into the live document once more. The wire stays V1 because Hocuspocus sends V1, so V2 would not make a joiner's download smaller; deflate already takes V1 to 13.5 percent. Neither the restore time nor the download improves by a clear margin, so the snapshot encoding stays V1 and no reader changes.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Which of the instant-open ideas to build? | one at a time / all | "quero implementar tudo isso" | 2026-10-19 |

## Test strategy summary

Unit tests with a real server: the upgrade response carries the extension, a large sync reaches a joiner intact and far smaller on the wire, and a frame small on the wire but over the cap once inflated closes with 1009. E2E: the large-fixture test of `e2e/room-admission.spec.ts` runs once.
