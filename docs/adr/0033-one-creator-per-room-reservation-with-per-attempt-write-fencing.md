# 0033. One creator per room: a reservation with per-attempt write fencing and expiry

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: `docs/features/connection-state/brief.md` finding 3, `.claude/rules/collaboration.md`, the SuperDoc collaboration docs on coordinating room creation and initializing a document

## Context

The room mode is Create until the update log holds a committed bootstrap. Today the open endpoint answers 409 `NOT_READY` only to readers, so two editors who open a fresh document in the same seconds both receive Create and both seed the room. The SuperDoc docs warn that two creators can duplicate content, that a WebSocket does not reserve a room, and that a server must reserve one initializer per document and fence writes per attempt.

## Decision

- The first editor who opens a document with no committed bootstrap is reserved: user id, attempt number and an expiry of about 60 s, held in a constant in `libs/types`.
- Every other editor and every reader gets 409 `NOT_READY` until the bootstrap commits.
- The collaboration connection context carries the attempt.
- While the room is uncommitted, `onChange` ignores updates from a connection whose attempt is not the current one.
- When the creator disconnects, or the reservation expires before the commit, the reservation is released. The next editor who opens is reserved with the next attempt number, and writes from the old attempt stay refused.
- The log keeps partial updates. The projection already ignores everything before the committed bootstrap.

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

## Evidence

Added by the room-admission plan.

- A unit test of the reservation state machine: reserve, second editor refused, commit, expiry, and an old-attempt write refused after takeover.
- A Playwright test where two editors open a brand-new document at the same time: exactly one creates and the other waits, then enters on its own.
- A Playwright test where the creator closes the tab mid-create: the next editor becomes the creator after expiry and the document has no duplicated content.

## Revisit when

- The server runs as more than one instance, which needs the reservation in shared storage.
- Creation grows past the expiry for large seeds, which needs a heartbeat or a longer expiry.
