# Server bootstrap: the server builds the room right after the upload

**Status:** Building
**Tier:** 🔴
**Owner approval:** approved 2026-10-19 ("quero implementar tudo isso", requirement 34, instant open)
**ADRs:** [0048](../../adr/0048-the-server-bootstraps-the-room-after-the-upload.md), [0033](../../adr/0033-one-creator-per-room-reservation-with-per-attempt-write-fencing.md), [0029](../../adr/0029-agent-edits-carry-a-human-or-agent-actor.md), [0047](../../adr/0047-the-server-never-materializes-an-update-it-only-logs-and-heap-follows-the-container.md)
**Not changing:** the update log format and columns, the projection's output, share links, the agent room token of [0025](../../adr/0025-mcp-clients-authorize-with-oauth-and-join-rooms-by-room-token.md) for agents, the socket payload and rate limits, the web app (another lane owns the waiting page and the editor's join path).

## Problem

The first opener of an upload (the creator, `RoomMode.Create`) converts the DOCX in the browser and streams the whole Yjs state over the socket. For `heavy-document.docx` (9.5 MB, 56,800 paragraphs) that is 42 s of browser CPU and 36.6 MB over 40 frames, 55 s until the first paragraph, and every joiner waits on it. The creator ticket machinery (reservation, attempts, epoch, takeover) exists only to keep two browsers from seeding one room.

## Spike (2026-10-19)

Question: can the SuperDoc SDK produce the room headlessly, so the browser never converts?

| Hypothesis | Result |
|------------|--------|
| `client.open({ runtime: 'v2', doc: <path>, collaboration: { providerType: 'hocuspocus', url, documentId, roomMode: 'create' } }, { collaborationAuth })` creates the room from a stored DOCX and sets the committed marker | Yes. The server `Y.Doc` read `bootstrapState: committed`, the authenticated connection is the SDK host's |
| It is fast enough | A blank DOCX commits in about 0.6 s. The heavy fixture commits in 43.6 s with 36.6 MB in 24 frames: the same conversion CPU as the browser, now in the SDK host process |
| The default client works for a large file | No. The host watchdog aborts `open` after 30 s with `HOST_TIMEOUT`; `requestTimeoutMs` on the client widens it |
| The SDK reports progress during the conversion | No. The state arrives at the end, so the server has no mid-conversion number |
| The Yjs state can be produced without a socket | Not through the public SDK; the room is the only output |

The answer: join the room as the bootstrapping client, on a loopback-only socket that the server admits as the uploader with actor Human.

## Measured (2026-10-19, local, `e2e/fixtures/large-docx.ts`, 9.5 MB, 56,800 paragraphs)

| What | Before (browser creator) | After (server bootstrap) |
|------|--------------------------|--------------------------|
| Browser CPU converting the DOCX | 42 s | none |
| Bytes the uploader's browser sends | 36.6 MB over 40 frames | under 1 MB, asserted |
| Upload until the open answer is Ready | not applicable | 38.9 s |
| A page opened after Ready until the first paragraph | not applicable | 13.4 s |
| Uploader opens at once: first paragraph | 55 s | about 52 s (38.9 s + 13.4 s) |

The conversion CPU moved into the SDK host and did not shrink. The win is that nobody's browser is busy, a second opener never waits on the first, and a document opened after it is ready shows its first paragraph in 13 s.

## Goals

| Goal | Rule |
|------|------|
| Server bootstrap | Right after the upload (and for a blank document), the server queues a bootstrap on the projection worker. The worker opens the stored DOCX through a `SuperDocClient` with a long request timeout, joins the room with `roomMode: 'create'` on `ApiPath.BootstrapCollaboration`, waits for the commit and closes without discarding. One bootstrap runs at a time. |
| Authorship | The bootstrap socket authenticates as the document owner (the uploader) with actor Human, exactly as a browser creator did, so the update log, the snapshot and the timeline keep their shape. |
| Everyone joins | The open answer is `RoomMode.Join` for every opener, uploader included. No `creatorAttempt` or `creatorEpoch` is issued; the 409 `NOT_READY` of the open route is gone. |
| Progress | The open answer carries `bootstrap: BootstrapProgress`. Stage `Queued` and `Preparing` report `done` 0 of `total` (the DOCX size in bytes); `Ready` reports `done` equal to `total` and `stateBytes` (the committed state size); `Failed` reports `done` 0. A document committed before this change reports `Ready` with 0 of 0 and `stateBytes` null. |
| No hang | A bootstrap that throws, times out (`BOOTSTRAP_TIMEOUT_MS`) or loses its worker is `Failed`, logged once, and stays `Failed` until the server restarts. The open answer says `Failed`; the web shows the existing error copy. |
| Old documents | An uncommitted document nobody bootstrapped (uploaded before this change, or after a restart that interrupted a bootstrap) is bootstrapped by its first open. |
| Remove the unused | `CreatorReservations`, the claimed ticket, the reserve and takeover paths, the epoch, the `isAttemptSuperseded` and `isAttemptRestarted` members flags and their close reasons go. |
| Keep the fence | The bootstrap token carries an attempt. A bootstrap socket writes only while its attempt is the registry's current one, so a host that outlives a restart or a failed job cannot merge a partial seed into a later bootstrap. |

## Non-goals

- Making the conversion itself faster: it is the SDK's CPU.
- Progress inside the conversion: the SDK offers none.
- A bootstrap on more than one instance or a retry button for `Failed`.

## Design

### Data flow

```
POST /api/documents -> storeDocument -> storage.put -> runtime.bootstrapRoom(documentId)
  RoomBootstrap: Queued -> (one at a time) -> Preparing
    scheduler.bootstrap({ documentId, filePath, url, token(userId = owner, attempt) }) -> worker
      worker: SuperDocClient(requestTimeoutMs).open(doc, collaboration create) -> Hocuspocus
        /collaboration/bootstrap (loopback only) -> onAuthenticate: token, role, current attempt
        onChange: first update with the committed marker -> bootstrap.commit (appendCommitted, owner, Human)
  commit -> RoomBootstrap: Ready { done: total, stateBytes }
GET /api/documents/:id -> { ..., roomMode: Join, bootstrap }   (web polls until Ready)
```

### Interfaces

- `OpenedDocument` gains `bootstrap: BootstrapProgress` and loses `creatorAttempt` and `creatorEpoch`; `DocumentMembers` loses `isAttemptSuperseded` and `isAttemptRestarted`.
- `ApiPath.BootstrapCollaboration = '/collaboration/bootstrap'`, upgraded only from a loopback address, no `Origin` check.
- Room token claims gain `attempt: string | null`. Agent tokens carry null and the agent path requires actor Agent; the bootstrap path requires actor Human and an attempt.
- `ProjectionRequestKind.Bootstrap` with its own queue in the worker; the reply carries nothing but the document id.

### Failure handling

| Failure | Behaviour |
|---------|-----------|
| Not a readable DOCX, SDK crash | Worker answers failed; stage `Failed`; one log line with the document id and message |
| The conversion outlives `BOOTSTRAP_TIMEOUT_MS` | Worker answers failed with the timeout message |
| The projection worker dies mid-bootstrap | The pending bootstrap rejects; stage `Failed` |
| The server restarts mid-bootstrap | The registry is empty and the old token's attempt is unknown, so a surviving host is refused; the first open starts a new bootstrap on the log's partial updates, which the projection already skips |
| A member connects to an uncommitted room | Refused at authentication, as a ticketless socket was |
| The owner left the document | The bootstrap token's role check fails; stage `Failed` |
| The worker is degraded | `Failed` at once |

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Where does the bootstrap run? | browser creator / server through the SDK | "quero implementar tudo isso" (requirement 34, server-side bootstrap in the projection worker) | 2026-10-19 |

## Test strategy summary

Unit: the registry (stages, one at a time, failure, lazy start), the worker handler and message, the token attempt claim, the socket admission and fence, the open answer and the members answer. E2E: `e2e/room-admission.spec.ts` rewritten to uploads that open as Join with progress until Ready, the large case timed, `e2e/showcase*.spec.ts` kept green.
