# Large documents: open any size without taking the server down

**Status:** Shipped 2026-10-19
**Tier:** 🔴
**Owner approval:** approved 2026-10-19 ("quero poder abrir qualquer tamanho de doc")
**ADRs:** [0033](../../adr/0033-one-creator-per-room-reservation-with-per-attempt-write-fencing.md), [0001](../../adr/0001-event-sourcing-over-yjs.md), [0004](../../adr/0004-stack.md)
**Not changing:** the update log format, the room mode rules, the projection's output, the upload size cap, the waiting page.

## Problem

The owner's `heavy-document.docx` (9.5 MB, 56,800 paragraphs, `e2e/fixtures/large-docx.ts`) opens locally and killed production. Node's default heap in the Railway container is about 480 MB. The room's `Y.Doc` does not fit: one 36.5 MB bootstrap update costs 681 MB of heap to apply. The container restarted. The creator's page reconnected with the ticket of the previous process, was refused with "creator ticket is not the latest on an uncommitted room", and showed "opened elsewhere", a banner that sends the person back to the list although nothing took the document.

## Measured

| What | Number |
|------|--------|
| Heap to apply one 36.5 MB bootstrap update | 681 MB |
| `Y.parseUpdateMeta` on that update | 196 ms, +2 MB heap |
| `Y.decodeUpdate` on that update | 436 ms, +676 MB heap |
| SuperDoc host child process importing the 9.5 MB DOCX | 1.2 GB resident memory, then "Host process disconnected" |
| Projection worker thread | 650 MB resident memory |
| Default Node heap in the Railway container | about 480 MB |

## Goals

| Goal | Rule |
|------|------|
| Import gate | A DOCX above `MAX_REVISIONS_IMPORT_BYTES` (2 MB) skips the Word-revisions import. One log line names the document and its size. The upload still succeeds, with no imported revisions. |
| Heap sizing | The container entrypoint reads the cgroup memory limit, prints it with the heap it picked, and starts the server with `--max-old-space-size` at 70% of the limit. The projection worker thread gets `resourceLimits.maxOldGenerationSizeMb` from `PROJECTION_WORKER_HEAP_MEGABYTES`, which the entrypoint sets to 50% of the limit. No limit, or no variable, keeps Node's default. |
| Creator recovery | A creator refused because its ticket predates the server process, on a room that is not committed, re-opens the document: a fresh open for a new ticket, then a reconnect. The banner "opened elsewhere" stays for a real takeover. The server tells the two apart by the ticket's epoch and gives the restart its own close reason. |
| Record | A Scale row in `docs/next.md` for the day a room no longer fits the heap, and a consequence line in ADR 0033. |

## Non-goals

- A relay room that never materializes the `Y.Doc`. It is the Scale row, not this change.
- A memory cap on the SuperDoc host process: the SDK spawns a compiled binary and offers no option for it. The size gate is the protection.
- Raising the upload cap.

## Design

### Data flow

The import request reaches the projection worker. The worker reads the file size before it starts the SDK host. Above the cap it logs and answers the import as done with no error, so a rebuild still goes on to project.

The members poll already tells the page that its attempt was superseded. It now also answers `isAttemptRestarted`: the ticket's epoch is not this process's and the room is not committed. A takeover stays `isAttemptSuperseded`. The page reports a takeover as before and re-opens the document on a restart. The socket refusal carries `RESTARTED_ATTEMPT_REASON` for a restart and `SUPERSEDED_ATTEMPT_REASON` for a takeover.

### Failure handling

| Failure | Behaviour |
|---------|-----------|
| A document above the cap | Imported revisions are empty; edits made in the room are tracked as usual |
| The heap limit is unreadable | The entrypoint starts Node with its default heap |
| The re-open after a restart fails | The existing reload-failed state shows, with its retry |

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| What size of document must open? | cap the upload lower / make every size open | "quero poder abrir qualquer tamanho de doc" | 2026-10-19 |

## Test strategy summary

Unit tests for the import gate, the environment parsing, the worker options, the restart refusal and the page's branch per reason. One run of `e2e/room-admission.spec.ts`. The heap sizing in the entrypoint has no shell test.
