# Local preview: the uploader sees the document at once, and a file the server refuses is prepared on the device

**Status:** Shipped 2026-10-20
**Tier:** 🔴
**Owner approval:** approved 2026-10-20 ("quer dizer que fomos fazer ficar mais performático e acabamos deixando mais lento??", requirement 35). Decision: preview from the uploaded bytes in a worker, a read-only badge, a swap to the live room without a reload, and a hybrid source for files the memory guard refuses, guarded by device.
**ADRs:** [0049](../../adr/0049-the-uploader-previews-locally-and-a-refused-file-is-prepared-on-the-device.md), [0048](../../adr/0048-the-server-bootstraps-the-room-after-the-upload.md), [0033](../../adr/0033-one-creator-per-room-reservation-with-per-attempt-write-fencing.md)
**Not changing:** the update log, the projection, share links, the bootstrap of files the server can hold, the memory guard formula, the upload size cap, the socket limits, SuperDoc.

## Problem

Since [server-bootstrap](../server-bootstrap/spec.md) every upload waits for the server: the brief (1.4 MB) that opened in about 3 s when the browser converted it now waits for a queue, a conversion in the SDK host and a snapshot download. The heavy fixture (9.5 MB) needs a 5 GB container to be prepared, so a 4 GB server refuses it with 413 and the person cannot open it at all.

## What the importer allows in a worker

SuperDoc v2 runs its document runtime in a worker of its own: `Config.workerUrls.document` is "the main document worker used by non-collaborative v2 documents" and `workerUrls.collaboration` the one for rooms (SuperDoc 2.23.0 types). The SDK runs the same engine headless in Bun, so the importer needs no DOM. A viewing-mode `SuperDoc` given `documents[].data` therefore converts off the main thread and only the layout and painting run on it. The print dialog already opens a document this way (`printSuperdocOptions`). No conversion worker of our own is written: it would duplicate the engine the room uses. Measured results are in the table below.

## Goals

| Goal | Rule |
|------|------|
| Local preview | After a successful upload the home keeps the `File` in memory, keyed by the new document id, and navigates. While the open answer is Queued or Preparing and a kept file exists, the editor page mounts a read-only SuperDoc built from it and a badge "Preview · the shared copy is being prepared". |
| Swap | When the open answer turns Ready the page mounts the live editor beneath the preview and keeps the preview on screen as an overlay (its status line reads that the shared copy is opening) until the live editor has painted its first paragraph; then the preview is destroyed and the file is dropped, so there is no moment with no text on screen. No reload, no unsaved edits (the preview is read-only). The preview's scroll position is carried over as a fraction of the document height and applied when the live editor paints; while the live editor is still laying out the rest, the position is approximate. A failed preparation drops the file and shows the existing failure card. |
| Progress | The panel's Preparing stage also reports the preview: `Opening a preview on this device · N pages so far · <server detail>`. The elapsed counter keeps ticking while the preview converts. The panel hides when the preview paints its first paragraph; the badge stays until the swap. |
| Only the uploader | The kept file lives in the uploading tab's memory. A reload, another tab or another person sees the waiting page of [open-progress](../open-progress/spec.md). |
| Device source | When `POST /api/documents` answers 413 for the memory guard, the body carries `canPrepareOnDevice: true`. The upload surfaces (dialog, drop zone, home) show the server's message and a button "Prepare on this device". |
| Device guard | The button is replaced by an explanation when the viewport is narrow (below the large breakpoint) or `navigator.deviceMemory`, when the browser exposes it, is below 4 GB. An absent `deviceMemory` does not block. |
| Device upload | The button sends the same file with the form field `preparation=device`. The route then skips its 413 and stores the file; the registry registers a device job only when the guard would refuse the file, so a small file sent with the flag is prepared by the server. A value outside the enum is 400. |
| Device room | A device job is Preparing with `startedAt` set. The owner's open answer is `RoomMode.Create`; everyone else's is `Join` with `preparedOnDeviceOf` set to the owner's name. The owner's member socket claims the job's attempt, writes under the bootstrap fence and commits as a bootstrap socket does. After the commit the same socket is an ordinary member socket. |
| Joiners | The Preparing panel reads "Being prepared on <name>'s device" and its bar follows the bytes of state received. |
| Failure | A claimed socket that closes before the commit fails the job (stage Failed, logged once). A failed device job is not claimable: the open answers the Failed card, and a reopen after the retry cooldown registers a fresh job. While a tab holds a live claim, a second tab or a socket without a tab id is refused and its open answer is Join (the waiting state), so only one seed reaches the room; the open request names its tab. A claimed socket whose attempt is no longer current is made read-only before its update is applied. A device job that does not commit within `DEVICE_JOB_LIFETIME_MS` fails. The claiming socket goes through the same heavy room admission as any member and gives its place back when it disconnects. |

## Non-goals

- A preview for anyone but the uploader.
- Editing the preview.
- A device source for a file the server can hold, or for a person who is not the owner.
- Making the conversion faster.

## Design

### Data flow

```
home: POST /api/documents (file)
  201 -> keepLocalFile({ documentId, file }) -> navigate /documents/:id
  413 { canPrepareOnDevice } -> dialog offers "Prepare on this device"
         -> POST /api/documents (file, preparation=device) -> 201 -> keepLocalFile -> navigate

editor page, server prepares (Queued | Preparing, kept file present)
  LocalPreview: SuperDoc(viewing, file) -- worker converts -- main thread lays out
  poll open answer -> Ready -> DocumentPage mounts the live editor; discardLocalFile

editor page, device job, owner
  open answer: Create, bootstrap Preparing -> live editor in Create mode with the stored file
  member socket: roomBootstrap.claimDevice(owner) -> attempt in the socket context
  updates -> fence (isCurrent) -> received(bytes) ... committing update -> bootstrap.commit -> ready()
```

### Interfaces

- `libs/types`: `PreparationSource { Server, Device }`, `PREPARATION_FIELD`, `DEVICE_PREPARATION_MIN_MEMORY_GIGABYTES`, `UploadRefusal = { error: string; canPrepareOnDevice: boolean }`, `OpenedDocument.preparedOnDeviceOf: string | null`.
- Server: `RoomBootstrap` takes `isPreparableByServer` and registers a device job in `request` for a file the guard refuses (so a restart finds the same answer); `isDevicePending`, `isDeviceCreator`, `claimDevice`, `deviceClosed`; the open route answers Create to the creator and names the owner's device for everyone. `POST /api/documents` skips its 413 when the form field says `device`.
- Web: `features/local-preview/` holds the kept-file store, `useLocalPreview`, `LocalPreview`, the preview view builder and the device guard; `readinessOf` treats a Create answer as Ready, because Create means "you are the source: mount the editor".

### Failure handling

| Failure | Behaviour |
|---------|-----------|
| The preview cannot be converted | The badge becomes the editor failure message; the panel is replaced by the waiting page's Preparing card; the server's preparation continues |
| The server fails the preparation | Existing failure card; kept file dropped |
| The tab reloads mid-wait | The file is gone; the waiting page shows. The server preparation is unaffected |
| The device guard refuses | The upload message stays, the button is replaced by the reason |
| The creator's device closes mid-stream | Job Failed as a device job: a joiner reads "The preparation on <name>'s device stopped" with a hint, never "the file may be damaged"; the owner's next open registers a fresh device job at once and is answered Create. A device job that expired or failed with its claim live keeps the 30 s retry cooldown |
| The owner reopens a pending device job | The open-progress panel reads "Preparing on this device" with the elapsed counter until the editor reports ready, even after the first paragraph painted |
| A second owner tab opens | Its socket is refused and its open answer is Join (the waiting state); the claiming tab keeps writing |
| The owner opens a pending device job from a device that fails the guard | The page shows the guard's reason and Back, mounts no editor and converts nothing |
| The heap cannot hold the room the device would build | The 413 says the server cannot hold a document this large at its current memory and names the largest size; no device button; a `preparation=device` re-send is refused the same way |
| A device upload | Skips the lane refusals (queue full, busy), because it never enters the lane; the heavy room check still applies |
| A forged `preparation=device` on a file the server can hold | Ignored: the server prepares it |

## Measured (2026-10-20)

Laptop, local stack, headless Chromium, one run each (`e2e/local-preview.spec.ts`; the server prepares the file at the same time as the browser previews it). The preview times start when the file is chosen in the upload dialog.

| What | Before server bootstrap | After server bootstrap | With the preview |
|------|-------------------------|------------------------|------------------|
| Brief (1.4 MB), upload to first text on screen | about 3 s | not measured | 1.3 to 1.8 s, asserted under 3 s |
| Heavy fixture (9.5 MB, 56,800 paragraphs), upload to first paragraph | 55 s | about 52 s | 9.2 to 12.2 s, asserted under 42 s |
| Longest stall of a 100 ms heartbeat in the tab until that first paragraph | not applicable | not applicable | 0.5 to 0.7 s, asserted under 5 s |
| Longest stall of the heartbeat while the heavy preview lays out the rest, until the swap | not applicable | not applicable | 2.1 to 5.1 s while other lanes loaded the machine, asserted under 10 s |
| Distinct lines the panel showed before the first paragraph (the elapsed counter ticking) | not applicable | not applicable | 6 to 8 |

Memory arithmetic for the heavy fixture (about 10 MB of document XML, estimated room heap 759 MB). The room heap budget is the smaller of the container budget (limit minus 512 MB reserve minus 2300 MB conversion) and the server heap (40 percent of the limit, as the image entrypoint sets it, minus 100 MB baseline minus 900 MB load spike); the heavy share of it is 75 percent.

| Memory limit | Server heap | Room heap budget | Heavy share | Heavy fixture |
|--------------|-------------|------------------|-------------|---------------|
| 4 GB | 1638 MB | 638 MB | 478 MB | Not openable by any path: the server cannot prepare it and the heap cannot hold the room a device would build; needs 8 GB |
| 6 GB | 2457 MB | 1457 MB | 1093 MB | Refused by the memory guard, held by the heap: prepared on the owner's device |
| 8 GB | 3276 MB | 2276 MB | 1707 MB | Prepared by the server |

The preview paints the first pages while SuperDoc keeps laying out, which is why it beats the 42 s of the old creator: that conversion produced the whole Yjs state before anything was shown. The shared copy is unchanged: ready about 40 s after the upload and about 13 s more to its first paragraph for a page opened after.

Evidence that SuperDoc converts in a worker: the E2E asserts that Playwright's `worker` event on the uploader's page reports a worker whose URL is the `browser-worker-entry` chunk (SuperDoc's document worker) and that the worker has no `window`; the only worker alive while the preview converts is that one, and the main thread's longest heartbeat gap until the first paragraph is under a second for a 9.5 MB file, which a main-thread import of 56,800 paragraphs could not allow. The window from the first paragraph to the swap includes the live editor mounting the full state, which is why its stall is longer and is bounded looser.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| The uploader waits longer than before PR #81 | revert / preview from the bytes / bigger server | "quer dizer que fomos fazer ficar mais performático e acabamos deixando mais lento??"; decision: preview in a worker, swap without reload, hybrid source for refused files, guarded by device | 2026-10-20 |
| Does the guard-refused file need the server at all? | device source / reject | Device source, `RoomMode.Create` for this case only | 2026-10-20 |

## Test strategy summary

Unit: the kept-file store, `useLocalPreview` (kept file shown while Waiting, dropped on Ready and Failed), the preview view builder, the device guard, `readinessOf` for Create, the upload hook's 413 offer and re-send, `RoomBootstrap` device job (register, claim, supersede, close, ready, forged claim by a non-owner), the documents route (413 body, device flag honoured only when refused, ignored otherwise), the collaboration server (claimed socket writes, commits, becomes a member; stale claim dropped). E2E in `e2e/local-preview.spec.ts`: the preview is visible before Ready and the counter ticks, the swap without a reload, the hybrid path with a scripted small memory limit.
