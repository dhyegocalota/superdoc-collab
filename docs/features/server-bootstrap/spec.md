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

The conversion CPU moved into the SDK host and did not shrink (SuperDoc's cost). For the uploader the gain is the progress panel and a browser that no longer does the work. For every opener after the uploader it is a snapshot sync instead of a browser conversion: nobody's browser is busy, a second opener never waits on the first, and a document opened after it is ready shows its first paragraph in 13 s.

## Goals

| Goal | Rule |
|------|------|
| Server bootstrap | Right after the upload (and for a blank document), the server queues a bootstrap on the projection worker. The worker opens the stored DOCX through a `SuperDocClient` with a long request timeout, joins the room with `roomMode: 'create'` on `ApiPath.BootstrapCollaboration`, waits for the commit, then closes with `close({ discard: true })` so the host never writes its copy back, and disposes the SDK host so its memory returns to the system. One bootstrap runs at a time in each lane. |
| Lanes and turns | A file up to `BOOTSTRAP_LIGHT_MAX_BYTES` (2 MB, about nine seconds of conversion at the measured rate) is prepared in the light lane, a larger one in the heavy lane. Each lane has its own queue, its own runner in the registry, its own worker queue and its own SDK host process, so a blank document is ready in well under a second while a heavy one converts. Inside a lane the queue serves owners in turns, one bootstrap each. |
| Limits | `POST /api/documents` answers 429 with `Retry-After` when the user spent `UPLOADS_PER_MINUTE` uploads in the minute (only a stored document spends one, a blank create included; a refused upload spends nothing) or already has a bootstrap waiting in the lane of the new file (`BOOTSTRAP_QUEUE_RETRY_AFTER_MS`). A `word/document.xml` that inflates past `MAX_DOCUMENT_XML_BYTES` (64 MB, counted while streaming so a zip that lies about its size costs bounded memory) is answered 415 with `DOCUMENT_TOO_LARGE_MESSAGE`. |
| Host hygiene | The SDK host runs with the server's secrets and database location removed from its environment, and with `--max-old-space-size` set to `PROJECTION_WORKER_HEAP_MEGABYTES` when that is configured. Its request timeout is `BOOTSTRAP_HOST_TIMEOUT_MS`, the timeout of the largest upload plus a margin, so it is later than any per-file timeout and the two never race. |
| Authorship | The bootstrap socket authenticates as the document owner (the uploader) with actor Human, exactly as a browser creator did, so the update log, the snapshot and the timeline keep their shape. |
| Everyone joins | The open answer is `RoomMode.Join` for every opener, uploader included. `creatorAttempt`, `creatorEpoch` and the members flags no longer exist; the 409 `NOT_READY` of the open route is gone. |
| Progress | The open answer is always 200 with `bootstrap: BootstrapProgress`. `total` is the DOCX size times `BOOTSTRAP_STATE_BYTES_RATIO` (4, the measured 36.6 / 9.5 rounded up). While Queued, `done` is 0. While Preparing, `done` is the bytes of Yjs state the room has received from the SDK host so far, never reaching `total - 1`. At Ready `done` equals `total` and `stateBytes` is the committed size. Failed reports `done` 0. A document committed before this change reports Ready 0 of 0 with null `stateBytes`. `estimatedMs` is the DOCX size in megabytes times the server's measured conversion rate, the mean of the last `BOOTSTRAP_RATE_SAMPLES` completed conversions of heavy-lane files (milliseconds per megabyte of the DOCX, from Preparing to Ready; a small file is dominated by a fixed cost and never feeds the rate) and `BOOTSTRAP_MS_PER_MEGABYTE` until the first one completes; it is null for a document committed before this change. `fileBytes` is the DOCX size (0 for such a document) and `preparingSince` is the epoch milliseconds when Preparing began, null in every other stage. |
| No hang | A bootstrap that throws, times out (`bootstrapTimeoutMsOf(fileBytes)` = `BOOTSTRAP_TIMEOUT_FLOOR_MS` (15 s) + megabytes × `BOOTSTRAP_MS_PER_MEGABYTE` (the measured 4.5 s) × `BOOTSTRAP_TIMEOUT_MARGIN` (5): 15 s plus 22.5 s per megabyte, 240 s at the 10 MB upload cap; past it the worker answers failed and the stage is Failed) or loses its worker is `Failed` and logged once. A run the worker's death interrupted is run once more with a new attempt first. After the run resolves the registry waits `BOOTSTRAP_COMMIT_GRACE_MS` for the commit before it declares `Failed`, and a host whose open result did not apply the bootstrap fails at once. A `Failed` bootstrap is started again by the first open after `BOOTSTRAP_RETRY_COOLDOWN_MS`; before that the open answer says `Failed` and the web shows the existing error copy. |
| Old documents | An uncommitted document nobody bootstrapped (uploaded before this change, or after a restart that interrupted a bootstrap) is bootstrapped by its first open. |
| Remove the unused | `CreatorReservations`, the claimed ticket, the reserve and takeover paths, the epoch, the `isAttemptSuperseded` and `isAttemptRestarted` members flags and their close reasons go. |
| Keep the fence | The bootstrap token carries an attempt. A bootstrap socket writes only while its attempt is the registry's current one, and the attempt ends when the run has ended and the commit is in, so a host that outlives a restart, a failed job or its own run cannot merge a partial seed into a later bootstrap. A bootstrap socket on a committed room is refused at authentication. The scheduler never posts a bootstrap to a worker that is being recycled: it holds the post until the fresh worker exists. |

## Non-goals

- Making the conversion itself faster: it is the SDK's CPU.
- Progress inside the conversion: the SDK offers none.
- A bootstrap on more than one instance or a retry button for `Failed`; the retry is the next open.

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

- `OpenedDocument` gains a required `bootstrap: BootstrapProgress`. `creatorAttempt`, `creatorEpoch`, `isAttemptSuperseded` and `isAttemptRestarted` are removed, with the web's uses.
- `ApiPath.BootstrapCollaboration = '/collaboration/bootstrap'`, upgraded only from a loopback address, no `Origin` check.
- Room token claims gain `attempt: string | null`. Agent tokens carry null and the agent path requires actor Agent; the bootstrap path requires actor Human and an attempt.
- `ProjectionRequestKind.Bootstrap` with its own queue in the worker; the reply carries nothing but the document id.

### Failure handling

| Failure | Behaviour |
|---------|-----------|
| Not a readable DOCX, SDK crash | Worker answers failed; stage `Failed`; one log line with the document id and message |
| The conversion outlives `BOOTSTRAP_TIMEOUT_MS` | The worker disposes the SDK host, then answers failed with the timeout message |
| The projection worker dies mid-bootstrap | The pending bootstrap rejects as interrupted; the registry runs it once more with a new attempt, then `Failed` |
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
