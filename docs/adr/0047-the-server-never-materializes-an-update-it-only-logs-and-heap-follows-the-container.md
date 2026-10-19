# 0047. The server never materializes an update it only logs; the heap follows the container's memory

- Status: Accepted
- Date: 2026-10-19
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [0001](0001-event-sourcing-over-yjs.md) (every update is appended with the client ids it carries), [0033](0033-one-creator-per-room-reservation-with-per-attempt-write-fencing.md) (the creator bootstraps the room in one attempt), the owner's heavy document of 2026-10-19 (9.5 MB, 56,800 paragraphs) that killed the production server with a heap out-of-memory during its bootstrap

## Context

The update log records the client ids of every appended update so authorship can be resolved later. It obtained them with `Y.decodeUpdate`, which materializes every struct of the update. For an ordinary keystroke that is nothing; for the single 36.5 MB bootstrap update of the heavy document it allocated 676 MB of heap in 436 ms, on top of the 681 MB the room's own `Y.Doc` takes to apply the same update. Node sized its heap by its own default (about 480 MB in the Railway container) rather than by the memory the container had, so the process died inside that step, the container restarted and the creator's page was refused with a stale ticket.

Measured on the captured frame with a 4 GB heap: `Y.parseUpdateMeta` 196 ms and 2 MB of heap; `Y.decodeUpdate` 436 ms and 676 MB; `Y.applyUpdate` into a fresh document 739 ms and 681 MB; `Y.encodeStateAsUpdate` 998 ms with no heap growth.

## Decision

- The update log reads client ids from `Y.parseUpdateMeta`, which decodes only each client's clock range. A deletion-only update yields no ids, as before, and is attributed to the sending connection.
- The server's heap is sized at boot from the container's cgroup memory limit at a fixed fraction, and the projection worker receives its own old-generation limit from the same number through configuration. Node's default is used only when no limit is readable.
- The Word-revisions import is skipped above a DOCX size constant and its host process is capped, so a failed import never takes the worker down.
- A creator refused after a server restart, when this process holds no reservation for the room, is told so with its own close reason and re-opens the document for a fresh ticket instead of seeing the takeover banner.

## Consequences

- The room's `Y.Doc` is still materialized by Hocuspocus while the document is open, about 690 MB of heap for this document; the container must offer that memory. The relay room that avoids it is recorded in `docs/next.md`.
- Appending an update no longer doubles the room's peak; the remaining peak is the room plus the projection worker's own copy.
- The boot log states the memory limit and the heap chosen, so a deploy's memory headroom is visible without a probe.
