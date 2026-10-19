# Snapshot compression: a joiner downloads the room in a fraction of the bytes

**Status:** Building
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

## Goals

| Goal | Rule |
|------|------|
| Compress the socket | The collaboration `ws` server negotiates permessage-deflate. A frame under 1 KiB skips compression, the fastest level is used, concurrent compressions are bounded, and neither side keeps its window between messages, so a socket holds no deflate state at rest. |
| Caps stay on the real size | `maxPayload` in `ws` counts the inflated bytes, so ADR 0034's 80 MiB cap and the frame caps of ADR 0040 apply to what the room would receive. A tiny compressed frame that inflates past the cap closes with 1009. |
| Encoding decision | Yjs V2 is measured and not adopted. |

## Non-goals

- Changing the encoding Hocuspocus puts on the wire: it sends V1 and the provider expects it.
- Compressing HTTP responses.

## Design

### Data flow

The browser offers `permessage-deflate` in its upgrade and the server accepts it with `server_no_context_takeover` and `client_no_context_takeover`. Every message of 1 KiB or more is deflated at level 1 by `ws` before it is framed; the receiver inflates it before the payload cap is checked.

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
