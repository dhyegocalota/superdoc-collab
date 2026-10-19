# 0048. The server bootstraps the room after the upload

- Status: Accepted
- Date: 2026-10-19
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [server-bootstrap spec](../features/server-bootstrap/spec.md) (spike of 2026-10-19), [ADR 0033](0033-one-creator-per-room-reservation-with-per-attempt-write-fencing.md), [ADR 0029](0029-agent-edits-carry-a-human-or-agent-actor.md), the owner's requirement 34 (instant open)

## Context

The first opener of an upload converted the DOCX in the browser and streamed the whole Yjs state: for the 9.5 MB fixture 42 s of browser CPU, 36.6 MB over 40 frames and 55 s to the first paragraph, with every joiner waiting. [ADR 0033](0033-one-creator-per-room-reservation-with-per-attempt-write-fencing.md) kept two browsers from seeding one room with a reservation, attempts, an epoch and a takeover.

The spike showed that `@superdoc/sdk` 2.21.0 can open the stored DOCX in its v2 runtime, join the Hocuspocus room with `roomMode: 'create'` and commit it (0.6 s blank, 43.6 s for the fixture, with `requestTimeoutMs` raised). The SDK reports nothing during the conversion and exposes no state without a room.

## Decision

- The server bootstraps every new document in the projection worker, right after `storeDocument`. A document found uncommitted with no job (uploaded before this change, or interrupted by a restart) is bootstrapped by its first open.
- The worker joins the room on a loopback-only path, `/collaboration/bootstrap`, with a room token that names the owner, the document and an attempt. The socket is admitted as the owner with actor Human, so the log, the snapshot and the timeline are what a browser creator produced.
- The registry in the server process runs one bootstrap at a time and holds the stage: Queued, Preparing, Ready or Failed. The open answer is always `RoomMode.Join` and carries it. Failed is terminal until the server restarts.
- The write fence keeps one rule: a bootstrap socket writes only while its attempt is the registry's current one. A member, a reader or an agent on an uncommitted room is refused.
- The reservation, the browser-claimed ticket, the epoch, the takeover and the restart reasons are removed.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Server bootstrap through the SDK in the projection worker (chosen) | the browser never converts; one bootstrap per document by construction; progress is known to the server | the conversion CPU moves to the server; no mid-conversion progress | n/a |
| Keep the browser creator and add progress | no new server load | 42 s of browser CPU stays; tickets stay | it is the problem |
| Produce the Yjs state in the worker and commit it directly | no socket, no token | the public SDK exposes no state without a room | not available |
| Run the bootstrap on the main thread | no worker message | blocks the event loop for tens of seconds | the worker exists for this |
| Keep the tickets as a safety net | smaller diff | state and clocks nobody exercises | dead code that the next reader must understand |

## Consequences

- Supersedes the reservation, expiry, takeover and restart parts of [ADR 0033](0033-one-creator-per-room-reservation-with-per-attempt-write-fencing.md). What stays: the commit is read from the latest snapshot, `isCommitted` answers from the server's state, and the open budget limits uncommitted opens.
- The open route no longer answers 409 `NOT_READY`. A web client waits on `bootstrap.stage`.
- The bootstrap runs in the SDK host process, which held 1.2 GB resident memory on the heavy fixture ([large-documents](../features/large-documents/spec.md)). The size gate of the revisions import does not apply to it.
- Progress is the DOCX size in bytes and then the state size. The SDK gives nothing finer, so the web shows an indeterminate bar with the elapsed time.
- A host process that outlives a failed job or a restart reconnects with an old attempt and is refused.
- A document whose bootstrap failed stays failed until the process restarts.

## Evidence

The spike in the [spec](../features/server-bootstrap/spec.md): the room committed from the SDK in 0.6 s (blank) and 43.6 s (heavy fixture), 36.6 MB in 24 frames, `HOST_TIMEOUT` at the default 30 s.

## Revisit when

- The SDK reports progress or exposes the state without a room.
- The server runs as more than one instance, which needs the registry in shared storage.
- A relay room that never materializes the `Y.Doc` replaces the bootstrap socket.
