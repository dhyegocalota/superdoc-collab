# 0034. Collaboration socket limits: a per-message payload cap and a per-connection rate cap

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: `docs/features/connection-state/brief.md` finding 4, the SuperDoc hosted collaboration server (1 MiB per message, 120 messages per second per room, 16 MiB per room)

## Context

The collaboration socket server is created with the library default, which accepts messages of 100 MiB, and Hocuspocus sets no limit of its own. Uploads are capped at `MAX_UPLOAD_BYTES` (10 MB) but the socket is not. One client can exhaust memory with a single large message or with a flood of small ones. The creator's first sync carries the whole seeded room in one message, so a cap copied from upstream would break creating a document.

## Decision

- `maxPayload` on the socket server equals a small multiple of `MAX_UPLOAD_BYTES`: 4 times 10 MB. The constant is `MAX_SOCKET_MESSAGE_BYTES` in `libs/types`.
- A per-connection rate cap of 120 messages in a rolling second, through the existing `SlidingWindow`. The constant is `MAX_SOCKET_MESSAGES_PER_SECOND` in `libs/types`.
- A breach of the rate cap closes that socket with close code 1008 (policy violation) and a reason string. The client's provider reconnects on its own.
- Both limits are logged with the document id and never with the payload.

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
- The rate window is per connection, so a client that opens many connections multiplies its budget. Authentication and the origin check bound that today.
- The limits appear in the logs by document id, which helps tell a flooder from a bug, and never expose content.

## Evidence

Added by the room-admission plan.

- A unit test of the rate breach: the 121st message in a second closes the socket with 1008.
- A unit test of the payload cap: a message above the cap closes the socket.
- A unit test that a seeded room at the upload cap still creates.

## Revisit when

- The upload cap changes, since the message cap is a multiple of it.
- Real traffic shows legitimate bursts above 120 messages per second.
