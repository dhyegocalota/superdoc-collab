# 0049. The uploader previews locally, and a refused file is prepared on the device

- Status: Accepted
- Date: 2026-10-20
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [local-preview spec](../features/local-preview/spec.md), [ADR 0048](0048-the-server-bootstraps-the-room-after-the-upload.md), [ADR 0033](0033-one-creator-per-room-reservation-with-per-attempt-write-fencing.md), the owner's requirement 35 ("quer dizer que fomos fazer ficar mais performático e acabamos deixando mais lento??")

## Context

[ADR 0048](0048-the-server-bootstraps-the-room-after-the-upload.md) moved the conversion to the server. It spared the browser, and it made the uploader wait longer: the brief, which opened in about 3 s when the browser converted it, now waits for a queue, a conversion in the SDK host and a snapshot download. The heavy fixture needs 5 GB of container to be prepared, so a 4 GB server refuses it with 413.

SuperDoc v2 already runs its document runtime in a worker, for non-collaborative documents too (`workerUrls.document`). A viewing-mode SuperDoc given the uploaded bytes converts off the main thread and paints; the print dialog already does this with `printSuperdocOptions`.

## Decision

- After a successful upload the home keeps the file's bytes in memory and navigates. While the open answer is Queued or Preparing, the editor page shows a read-only SuperDoc built from those bytes, labelled as a preview. When the answer turns Ready the page swaps to the live room without a reload and the bytes are dropped. The preview has no edits to lose.
- When the memory guard refuses an upload with 413, the dialog offers to prepare the document on this device. The same request is sent again with `preparation=device`; the server stores the file without converting it and registers a device job. The owner's open answer is `RoomMode.Create`, the owner's member socket claims the job's attempt and streams the state, and the commit is today's commit. Every other opener joins and sees the Preparing panel naming the owner's device.
- The device path reuses the bootstrap fence: one current attempt per document, writes dropped for a stale attempt, a socket of an attempt that is no longer current is made read-only, a second tab is refused while the claiming tab has a live socket (its open answer is Join), the claiming socket passes the heavy room admission and releases its place on disconnect, the creator's disconnect before the commit fails the job, and a job that does not commit within its lifetime fails. A failed job is not claimable by a socket; the owner's reopen registers a fresh one at once when the claiming tab closed, and after the retry cooldown otherwise.
- The device path is guarded in the browser: it is refused on a narrow viewport and when `navigator.deviceMemory` is exposed and below 4. The upload cap stays.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Preview from the uploaded bytes plus device preparation for refused files (chosen) | the uploader waits no longer than before ADR 0048; a 4 GB server holds heavy files the person's device can convert; no new server memory | two code paths for a room's source; the preview is read-only | n/a |
| A conversion Web Worker of our own | explicit control | SuperDoc already converts in a worker; a second importer would diverge from the one the room uses | duplicate of a thing the library does |
| Revert ADR 0048 | the old timings | the browser freezes on heavy files again and every joiner waits on one browser | it is the problem ADR 0048 solved |
| A bigger server | no client work | cost, and the owner asked for the 4 GB server to hold the file | the owner's constraint |
| Preview only | smallest diff | a refused file still cannot be opened | leaves the 413 as a dead end |

## Consequences

- The uploader's first paragraph no longer waits for the server queue. The shared copy still does.
- A document refused by the guard has a second source of truth for its first state: the owner's device. Its Yjs state is trusted as an owner's write, as it was before ADR 0048.
- The preview and the live editor are never mounted together; the swap destroys the first before the second paints.
- The creator ticket machinery of ADR 0033 stays removed. The device job uses the bootstrap registry's attempt.

## Evidence

The measured times in the [spec](../features/local-preview/spec.md).

## Revisit when

- SuperDoc exposes the converted state without a room, so the server and the device can share one path.
- The server is allowed enough memory for the heaviest accepted file, which retires the device path.
