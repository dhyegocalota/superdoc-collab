# 0033. One creator per room: a reservation with per-attempt write fencing and expiry

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Revised: 2026-10-17, after the plan review (snapshot-first commit detection, attempt epoch, release on the last disconnect, silence expiry)
- Inspired by: `docs/features/connection-state/brief.md` finding 3, `.claude/rules/collaboration.md`, the SuperDoc collaboration docs on coordinating room creation and initializing a document

## Context

The room mode is Create until the update log holds a committed bootstrap. Today the open endpoint answers 409 `NOT_READY` only to readers, so two editors who open a fresh document in the same seconds both receive Create and both seed the room. The SuperDoc docs warn that two creators can duplicate content, that a WebSocket does not reserve a room, and that a server must reserve one initializer per document and fence writes per attempt.

## Decision

- The first editor who opens a document with no committed bootstrap is reserved: user id, attempt number and an expiry of about 60 s, held in a constant in `libs/types`.
- Every other editor and every reader gets 409 `NOT_READY` until the bootstrap commits.
- The attempt travels with the socket, together with a per-process epoch, from the open answer to the socket URL and into the connection context. A restart changes the epoch, so an attempt issued before it is never mistaken for a current one.
- While the room is uncommitted, `onChange` ignores updates from a connection whose attempt is not the latest. After the commit, a socket that claims any attempt other than the one that committed is closed with 4403, so an abandoned creator that reconnects later never merges its partial seed into the committed room. A socket that claims no attempt joins the committed room as today.
- The reservation is released when the last connection of the holder's attempt closes. It is live while any socket of its attempt is connected, and silence (no appended update) after the last close expires it after the expiry. Its total lifetime is capped at five minutes (`CREATOR_RESERVATION_MAX_MS`), after which it lapses even with a socket connected, and a holder that lapsed at the cap waits one `CREATOR_RESERVATION_MS` cooldown before it can reserve the same document again. The holder's own reconnects and second tabs are accepted meanwhile. The next editor who opens after a release or an expiry is reserved with the next attempt number, and writes from the old attempt stay refused.
- The commit writes a snapshot of the live room, and "committed" is read from the latest snapshot rather than from a replay of the whole log: an abandoned partial and the winner's seed are concurrent Yjs writes of the same marker, and a from-zero replay can hide the commit. The projection's bootstrap scan starts from that snapshot for the same reason. The log keeps every partial update.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Reservation with per-attempt fencing and expiry (chosen) | one creator at a time; a crashed creator frees the room; old writes cannot land | state and a clock on the server | n/a |
| No reservation | nothing to build | duplicate content, the failure upstream warns about | it is the bug |
| Mark the document failed and require the owner to retry | simple server rule | a dead end for readers and editors until the owner acts | the document looks broken for a recoverable race |
| Same creator only | simple rule | a crashed creator locks the document forever | no way out without the creator |
| A WebSocket-level lock | no reservation record | a socket does not reserve a room, per the upstream docs | it cannot fence a late write |

## Consequences

- The waiting page of the final-visuals design (section 1.15) becomes the path every non-creator sees for a few seconds on a fresh document.
- Partial updates from an abandoned attempt remain in the log, so the log grows slightly and the projection must keep ignoring everything before the committed bootstrap.
- The reservation lives in memory and resets on restart, which is acceptable on a single instance.
- End-to-end tests need two browsers opening a fresh document at once.
- The commit snapshot encodes the live room on the main thread (0.6 to 1.5 s for a 36 MB room) inside the append transaction: an exception to the worker budget for snapshots, accepted because it runs once per document and atomicity needs the live document.
- `isCommitted` answers from the server's state (snapshot first), never from the live room's marker alone, because any member can write that marker; the fence takes the server's answer for attempt-less sockets.
- A reservation is live while any socket of its attempt is connected. Silence (no appended update) after the last close expires it after `CREATOR_RESERVATION_MS`, and its total lifetime is capped at `CREATOR_RESERVATION_MAX_MS`, after which it lapses even with a socket connected. A holder that lapsed at the cap waits one `CREATOR_RESERVATION_MS` cooldown before it can reserve the same document again, so a slow or hostile holder cannot keep a document closed to everyone else.
- Opens of documents not yet known committed are limited per user to `OPEN_UNCOMMITTED_PER_MINUTE` distinct documents per minute (never above the scan cache size), one budget consulted before any log scan on the open route, socket authentication, the agent room locator and the export tool, so one user cannot thrash the bounded scan cache on any path. A document counts once per user and minute, so waiting-page polls and reconnects are free.
- The holder opening the document again (a second tab or a reload mid-create) is issued a new attempt and its old sockets are closed with 4403: the newest tab wins, which restarts a create cleanly instead of leaving two pages seeding one attempt.
- A holder that releases and reopens within `CREATOR_RESERVATION_MS` keeps the original start of its lifetime, so closing the last socket and reopening cannot reset the cap; a creator returning after that window gets a fresh start.

## Evidence

Added by the room-admission plan.

- A unit test of the reservation state machine: reserve, second editor refused, the holder's reconnect and second tab accepted, release on the last disconnect, expiry refreshed by updates, commit, and an old-attempt write refused after takeover and after the commit.
- Unit tests of the lifetime cap and the lapse cooldown, and of the connected-liveness rule: a holder with a connected socket is not taken over when the silence timer has run out.
- A unit test that reproduces the hidden commit: an abandoned client with a higher Yjs client id and the winner's seed, both in the log; the from-zero replay says uncommitted, the snapshot says committed.
- A Playwright test where two editors open a brand-new document at the same time: exactly one creates and the other waits, then enters on its own.
- A Playwright test where the creator goes offline mid-create, another editor creates and commits, and the creator comes back: its socket is closed with 4403 and the document has no duplicated content.
- A Playwright test where the creator closes the tab mid-create: the next editor becomes the creator at once (release on the last disconnect) and the document has no duplicated content.

## Revisit when

- The server runs as more than one instance, which needs the reservation in shared storage.
- Creation grows past the expiry for large seeds, which needs a heartbeat or a longer expiry.
