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

## Measured at the production limit (2026-10-19, production image, `docker run --memory=4g`)

The 9.5 MB heavy document, uploaded as ana, with the entrypoint split (server 40%, worker 20%, two hosts 20% each). The container was OOM-killed at 127 s, during the heavy bootstrap.

| Process | Resident peak |
|---------|---------------|
| Server (Node, heavy room loaded) | 1.73 GB |
| Heavy SDK host (a Bun binary) | 2.19 GB |
| Light SDK host | 0.18 GB |
| Total | 3.92 GB, over the 4 GB limit with the kernel's own use |

The host cannot be capped: `BUN_JSC_forceRAMSize` only sizes its collector, and a Bun binary takes no Node heap flag. So the split stays as it is and the guard below keeps a file the container cannot hold out of the bootstrap.

Sweep of the split and the limit, same file and same walk (upload, blank create while it converts, open, three edits, two versions), sampled every 0.5 s inside the container. No split fits 4 GB; 5 GB holds the document with 0.7 GB to spare.

| Limit | Server, worker, host split | Heavy host peak | Server peak | Container peak | Outcome |
|-------|----------------------------|-----------------|-------------|----------------|---------|
| 4 GB | 40, 20, 20 | 2.19 GB | 1.95 GB and rising | 4.09 GB | OOM-killed at 111 s, at the handoff |
| 4 GB | 40, 20, 10 | 2.17 GB | 1.97 GB and rising | 4.10 GB | OOM-killed at 128 s, at the handoff |
| 4 GB | 30, 25, 10 | 2.18 GB | 2.14 GB and rising | 4.10 GB | OOM-killed at 143 s, at the handoff |
| 5 GB | 40, 20, 20 | 2.15 GB | 3.52 GB | 4.40 GB | walk completes |
| 6 GB | 40, 20, 20 | 2.20 GB | 3.81 GB | 5.20 GB | walk completes |

The host's peak is the same at 10% and 20% of the limit, so its fraction buys nothing and the split cannot move memory to where the handoff needs it: for about ten seconds the host still holds 2.2 GB while the server takes the 36 MB of state and grows past 2 GB. At 6 GB the highest total came later, while the host lingered at 1.5 GB for 14 s as the server projected the first version. The light host peaked at 0.12 to 0.22 GB while the heavy one converted, and the blank document was ready 0.5 to 1.1 s after its create in every run. The projection worker retained 671 MB after the heavy job in both runs that completed (the `Recycled the projection worker` line), 82% of its 819 MB cap at 4 GB, which is why the worker stays at 20% and the guard, not the split, protects a small container. The old browser-side creator cost the server only about 690 MB for the same file; the move of the conversion to the server is what made the production limit matter.

A completed bootstrap at 8 GB (2026-10-19, same image, split 40, 20, 20, `docker run --memory=8g`, the owner's 9.5 MiB heavy file whose `word/document.xml` is 9,985,969 bytes, stored): the document was Ready at 122 s, with no kill and a clean idle afterwards.

| Process | Resident peak during the bootstrap |
|---------|-------------------------------------|
| Server (Node, heap 3,276 MB) | 2,408 MiB |
| Heavy SDK host | 2,257 MiB |
| Light SDK host | 87 MiB |
| Sum of the peaks | 4,752 MiB |
| Highest total at one instant | 4,208 MiB, at 124 s |

The 4 GB run above was cut short by the kill, so its 3.92 GB was a lower bound. The ratio comes from the completed peaks, per byte of `word/document.xml`, because the conversion, the host and the state all scale with the XML and not with the compressed file: 4,752 MiB over 9.52 MiB is 499, rounded up to 500.

Every size rule keys on the inflated bytes of `word/document.xml` (`documentXmlBytes`): the guard, the lane, the timeout, the estimate and `total`. A DOCX repacked with maximum compression is 172,742 bytes for the same 10 MB of XML, so the compressed size says nothing about the work. The upload route learns the count while it checks the file (the stream that refuses a zip bomb), and the central directory of the stored file gives it again for a document opened after a restart; a zip whose declared size differs from what it inflates to is refused as not a DOCX.

Guard formula: the server refuses a document when `documentXmlBytes × BOOTSTRAP_RESIDENT_BYTES_PER_XML_BYTE` exceeds `MEMORY_LIMIT_MEGABYTES − BOOTSTRAP_MEMORY_RESERVE_MEGABYTES`. The ratio is 500 resident bytes per byte of XML and the reserve is 512 MB for everything else the server does. The largest preparable document is `floor((limit − reserve) / 500)` megabytes of XML: 7 MB at 4 GB and 15 MB at 8 GB. Below a limit of 1,012 MB nothing is preparable and the refusal says the server has too little memory. The entrypoint exports the cgroup limit as `MEMORY_LIMIT_MEGABYTES`; without a known limit nothing is refused for memory.

## Goals

| Goal | Rule |
|------|------|
| Server bootstrap | Right after the upload (and for a blank document), the server queues a bootstrap on the projection worker. The worker opens the stored DOCX through a `SuperDocClient` with a long request timeout, joins the room with `roomMode: 'create'` on `ApiPath.BootstrapCollaboration`, waits for the commit, then closes with `close({ discard: true })` so the host never writes its copy back, and disposes the SDK host so its memory returns to the system. One bootstrap runs at a time in each lane. |
| Lanes and turns | A document whose `word/document.xml` has up to `BOOTSTRAP_LIGHT_MAX_BYTES` (2 MB, about nine seconds of conversion at the measured rate) is prepared in the light lane, a larger one in the heavy lane. Each lane has its own queue, its own runner in the registry, its own worker queue and its own SDK host process, so a blank document is ready in well under a second while a heavy one converts. Inside a lane the queue serves owners in turns, one bootstrap each. |
| Limits | `POST /api/documents` answers 429 with `Retry-After` when the user spent `UPLOADS_PER_MINUTE` uploads in the minute (only a stored document spends one, a blank create included; a refused upload spends nothing) or already has a bootstrap waiting in the lane of the new file (`BOOTSTRAP_QUEUE_RETRY_AFTER_MS`). A `word/document.xml` that inflates past `MAX_DOCUMENT_XML_BYTES` (21 MB: the socket message cap of 80 MB divided by the measured 3.7 ratio of state to document.xml, so every admitted document commits under the cap instead of converting for minutes and closing with 1009, counted while streaming so a zip that lies about its size costs bounded memory) is answered 415 with `DOCUMENT_TOO_LARGE_MESSAGE`. |
| Memory guard | When `MEMORY_LIMIT_MEGABYTES` is known, `POST /api/documents` answers 413 with `bootstrapMemoryShortMessage` (the largest preparable XML in whole megabytes, computed from the formula in the measurement above) for a document the container cannot hold, before storing anything. A blank create is never refused. The upload dialog shows the server's message. |
| Host hygiene | The SDK host runs with the server's secrets and database location removed from its environment, and with `BUN_JSC_forceRAMSize` set to `BOOTSTRAP_HOST_HEAP_MEGABYTES` when that is configured (the host is a Bun binary, so a Node heap flag does nothing; see the learning of 2026-10-19). The entrypoint gives each of the two lane hosts 20% of the container limit, the server 40% and the worker 20%, so the settings sum to 100%. They are settings, not hard caps: on the capped repro (limit 4096 MB: server 1638, worker 819, hosts 819 each) the 10 MB conversion peaked at 4,384 to 4,595 MB resident in the host with the Node flag and at 2,245 MB with `BUN_JSC_forceRAMSize`; the server with the heavy room loaded held 2.8 GB, a light host about 59 MB, and the combined peak at the handoff was 5,988 MB before and 3,384 MB after. A container must be planned for about 5.2 GB (server 2.9 + heavy host 2.2 + light host) to hold the 10 MB document, not for the settings. Its request timeout is `BOOTSTRAP_HOST_TIMEOUT_MS`, the timeout of the largest upload plus a margin, so it is later than any per-file timeout and the two never race. |
| Authorship | The bootstrap socket authenticates as the document owner (the uploader) with actor Human, exactly as a browser creator did, so the update log, the snapshot and the timeline keep their shape. |
| Everyone joins | The open answer is `RoomMode.Join` for every opener, uploader included. `creatorAttempt`, `creatorEpoch` and the members flags no longer exist; the 409 `NOT_READY` of the open route is gone. |
| Progress | The open answer is always 200 with `bootstrap: BootstrapProgress`. `total` is `documentXmlBytes` times `BOOTSTRAP_STATE_BYTES_RATIO` (4, the measured 36.6 MB of state over the 9.5 MB of XML rounded up). While Queued, `done` is 0. While Preparing, `done` is the bytes of Yjs state the room has received from the SDK host so far, never reaching `total - 1`. At Ready `done` equals `total` and `stateBytes` is the committed size. Failed reports `done` 0. A document committed before this change reports Ready 0 of 0 with null `stateBytes`. `estimatedMs` is the megabytes of XML times the server's measured conversion rate, the mean of the last `BOOTSTRAP_RATE_SAMPLES` completed conversions of heavy-lane files (milliseconds per megabyte of XML, from Preparing to Ready; a small file is dominated by a fixed cost and never feeds the rate) and `BOOTSTRAP_MS_PER_MEGABYTE` until the first one completes; it is null for a document committed before this change. `documentXmlBytes` is the inflated size of `word/document.xml` (0 for such a document) and `preparingElapsedMs` is the milliseconds since Preparing began by the server clock, measured at each answer so the browser never compares two clocks, null in every other stage. |
| No hang | A bootstrap that throws, times out (`bootstrapTimeoutMsOf(documentXmlBytes)` = `BOOTSTRAP_TIMEOUT_FLOOR_MS` (15 s) + megabytes of XML × `BOOTSTRAP_MS_PER_MEGABYTE` (the measured 4.5 s) × `BOOTSTRAP_TIMEOUT_MARGIN` (5): 15 s plus 22.5 s per megabyte, 240 s at the 10 MB upload cap; past it the worker answers failed and the stage is Failed) or loses its worker is `Failed` and logged once. A run the worker's death interrupted is run once more with a new attempt first. After the run resolves the registry waits `BOOTSTRAP_COMMIT_GRACE_MS` for the commit before it declares `Failed`, and a host whose open result did not apply the bootstrap fails at once. A `Failed` bootstrap is started again by the first open after `BOOTSTRAP_RETRY_COOLDOWN_MS`; before that the open answer says `Failed` and the web shows the existing error copy. |
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
