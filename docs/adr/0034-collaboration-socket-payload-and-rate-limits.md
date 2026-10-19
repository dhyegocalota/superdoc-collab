# 0034. Collaboration socket limits: a per-message payload cap and a per-connection rate cap

- Status: Accepted; the 120 frames per second figure is superseded by [0040](0040-the-socket-frame-cap-allows-fast-typing-and-reconnect-bursts.md)
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Revised: 2026-10-17, after the plan review (the counter moves to the ws layer and covers frames before authentication)
- Inspired by: `docs/features/connection-state/brief.md` finding 4, the SuperDoc hosted collaboration server (1 MiB per message, 120 messages per second per room, 16 MiB per room)

## Context

The collaboration socket server is created with the library default, which accepts messages of 100 MiB, and Hocuspocus sets no limit of its own. Uploads are capped at `MAX_UPLOAD_BYTES` (10 MB) but the socket is not. One client can exhaust memory with a single large message or with a flood of small ones. The creator's first sync carries the whole seeded room in one message, so a cap copied from upstream would break creating a document.

## Decision

- `maxPayload` on the socket server equals a small multiple of `MAX_UPLOAD_BYTES`: 8 times 10 MiB, which is 80 MiB or 83,886,080 bytes. The constant is `MAX_SOCKET_MESSAGE_BYTES` in `libs/types`. The multiple was 4 until the room-admission measurement of 2026-10-17: a text-dense 9.52 MiB DOCX syncs its seed in one 36,593,816-byte frame, 3.7 times its file size, so 4 times (41,943,040 bytes) left 15% of headroom and 8 times (83,886,080 bytes) leaves 2.2 times, still under the `ws` default of 100 MiB.
- A per-socket rate cap of 120 frames in a rolling second, through the existing `SlidingWindow`, counted at the `ws` layer in `attach-collaboration.ts` from the first frame, before authentication too: Hocuspocus queues every frame that arrives before the authentication message without a bound, so a counter inside its hooks would start too late. The constant is `MAX_SOCKET_MESSAGES_PER_SECOND` in `libs/types`. A frame over the payload cap is closed by `ws` with 1009, which the provider treats as final; `terminateOnError` returns early on a socket that is already closing (true again at c9c7745, together with the close timeout) so that close frame is delivered. The socket server is created with one `closeTimeout` of `SOCKET_CLOSE_GRACE_MS` (one second), and every server-initiated close uses it, so a peer that ignores the close frame is terminated after the grace.
- A breach of the rate cap closes that socket with close code 1008 (policy violation) and a reason string. The client's provider reconnects on its own.
- A fence refusal, a takeover close and a 409 are logged with the document id; the payload cap and the rate cap close at the ws layer before any document name is known, so their lines carry no document id. Nothing ever logs a payload.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Payload cap at a multiple of the upload cap plus a per-connection rate cap (chosen) | fits the largest legitimate first sync; bounds both big and many messages | two constants to keep honest | n/a |
| Upstream's fixed 1 MiB cap | proven numbers | breaks creating a seeded room | the creator could never open a document |
| Message cap only | one limit | a flood of small messages still exhausts the process | half the problem |
| A per-room budget like upstream's 16 MiB per room | bounds a whole room | punishes every member for one flooder | the wrong party is closed |
| A spike first | measured numbers | the numbers are bounded by known sizes | no spike needed |

## Consequences

- A legitimate burst, such as a large paste near the cap, closes the socket once and reconnects.
- The rate window is per connection, so a client that opens many connections multiplies its budget. The origin check is client-chosen and authentication ran after the upgrade, so neither bounded it; the security review of 2026-10-17 added a session check in the upgrade handler before `handleUpgrade`, one document per socket (a second document name on a socket closes it), a close timeout of one second on every server-initiated close, and a five-minute cap on a reservation's total lifetime. A session that fails at the upgrade completes the upgrade and closes with 4401, so the client shows failed without retries.
- A fence refusal, a takeover close, a 409 and a single-document close appear in the logs by document id, which helps tell a flooder from a bug. The payload cap and the rate cap carry no document id, because the ws layer closes them before any document name is known. No line exposes content.
- The socket server negotiates permessage-deflate (2026-10-19, [snapshot-compression](../features/snapshot-compression/spec.md)). `ws` checks `maxPayload` against the inflated size, so the cap still bounds what the room receives and a small compressed frame cannot get past it; because the frame rate cap counts frames and not bytes, a socket is also closed with 1008 when it inflates more than one maximum frame (80 MiB) in a rolling second, except the loopback bootstrap socket; a 36.6 MB sync is about 5 MB on the wire.

## Evidence

Added by the room-admission plan.

- A unit test of the rate breach: the 121st message in a second closes the socket with 1008.
- A unit test of the payload cap: a message above the cap closes the socket.
- A unit test that a seeded room at the upload cap still creates.
- A unit test that a second document name on one socket closes it with 1008, and one that a peer ignoring a server close is destroyed within the grace.
- Measured on 2026-10-17 before the cap was set, with a 9.52 MiB text-dense DOCX (56,800 paragraphs, no images): the largest frame was 36,593,816 bytes each way, 87 percent of `MAX_SOCKET_MESSAGE_BYTES` (41,943,040). The create sent 37 frames and received 80, at most 26 sent and 42 received in any rolling second, so the rate cap of 120 per second holds. Open to commit took 40.3 s, and encoding the room state took 0.6 to 1.5 s. The wire size is 3.7 times the file size for this fixture, so a denser file can approach the cap.

## Revisit when

- The upload cap changes, since the message cap is a multiple of it.
- Real traffic shows legitimate bursts above 120 messages per second.
