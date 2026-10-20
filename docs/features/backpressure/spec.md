# Backpressure: the server says no, and how long, before many heavy documents overload it

**Status:** Building
**Tier:** 🔴
**Owner approval:** approved 2026-10-20 ("como proteger o servidor de sobrecarga? e se muitas pessoas decidirem carregar docs pesado ao mesmo tempo?", requirement 36)
**ADRs:** [0048](../../adr/0048-the-server-bootstraps-the-room-after-the-upload.md), [0047](../../adr/0047-the-server-never-materializes-an-update-it-only-logs-and-heap-follows-the-container.md)
**Not changing:** the lanes, the one waiting slot per owner, the memory guard of the upload, the bootstrap itself, the room mode rules, the socket payload and rate limits.

## Problem

Three limits already protect the server: the 429 for one waiting slot per owner, the 413 memory guard per document and the lanes. None of them looks at the crowd. Twenty people uploading a heavy document at once each hold a slot, so the heavy lane holds twenty jobs of about 43 s each and the last waits 14 minutes behind a panel that says "Waiting for its turn". And nothing bounds how many heavy rooms are loaded at once: each costs about 700 MB of server heap, so a handful of people opening large documents exhausts a container that the guard sized for one conversion.

## Goals

| Goal | Rule |
|------|------|
| Wait ceiling | `RoomBootstrap.predictedWaitMs` is what is left of the running job of the lane plus every queued job of the lane, each at `documentXmlBytes` times the measured rate per megabyte (the seeded rate until a heavy conversion completed). `POST /api/documents` answers 503 for a heavy file when that wait is above `MAX_BOOTSTRAP_WAIT_MS` (5 minutes), before storing anything, with `Retry-After` the predicted wait in seconds and the body `bootstrapBusyMessage(wait)`: "The server is busy preparing other documents; try again in about N min". A blank create and a light file are never refused by it. The upload dialog shows the server's sentence. |
| Queue position | While a document is Queued, its open answer carries `queuePosition`, the documents ahead (the running one included, the other owners' turns respected), and `queueWaitMs`, the predicted wait before its own turn. Both are null in every other stage. The panel reads "3 documents ahead · about 4 min" plus the elapsed time; with nothing ahead it keeps "Waiting for its turn". |
| Heavy room ceiling | `maxLoadedHeavyRooms(MEMORY_LIMIT_MEGABYTES)` is the memory limit minus the reserve and one conversion (`BOOTSTRAP_CONVERSION_RESIDENT_MEGABYTES`, 2,300 MB: the measured heavy host peak), divided by `HEAVY_ROOM_RESIDENT_MEGABYTES` (700 MB of heap per heavy room), rounded down: 1 at 4 GB, 7 at 8 GB. A heavy room is a loaded room whose state is above `LARGE_ROOM_STATE_BYTES`, counted by `createRoomMemoryRelease` from the bytes each room loaded and received. When the count reaches the ceiling, the open route answers 503 with `HEAVY_ROOMS_FULL_MESSAGE` and `Retry-After` of `HEAVY_ROOMS_RETRY_AFTER_MS` for a heavy document whose room is not loaded, and the collaboration socket for it is closed unauthorized. The waiting page shows the sentence with Try again. |
| Operator override | `MAX_BOOTSTRAP_WAIT_MS` and `MAX_LOADED_HEAVY_ROOMS` environment variables replace the two limits; without a memory limit and without the override there is no heavy room ceiling. |

## Non-goals

- Admission by total memory in use: the count is of rooms, the one thing a person's click adds.
- Shedding a room that is already loaded: a loaded room is never refused, and a document being prepared is never refused by the ceiling, so its owner keeps seeing the queue.
- A queue that outlives a restart.

## Design

- `OwnerRoundRobinQueue.turnOrder` lists the queued items in the order `shift` would serve them. `RoomBootstrap` keeps the document each lane is running, so `answerOf` can place a Queued document: position is the running job plus its index in the turn order, wait is the running job's remaining estimate plus the estimates of the jobs before it. A queued blank that waits for the first blank's state is in no queue and reports null.
- `createHeavyRoomAdmission` joins the room memory (is the ceiling reached for this room, and is it already loaded), the stored file (is the document heavy: `xml bytes × BOOTSTRAP_STATE_BYTES_RATIO > LARGE_ROOM_STATE_BYTES`, read only at the ceiling) and the registry (is the document being prepared). The open route and `admitToCommittedRoom` ask it before spending any open budget. The bootstrap socket is never asked.
- The web maps a 503 of the upload to the dialog message and a 503 of the open route to `ServerBusyError`, which the waiting page shows as its heading.

## Failure modes

| What | Signal | Back out |
|------|--------|----------|
| The prediction is too pessimistic (the rate learned from one slow conversion) | uploads refused while the lane is short | raise `MAX_BOOTSTRAP_WAIT_MS`; the rate averages the last `BOOTSTRAP_RATE_SAMPLES` conversions |
| The ceiling counts a room that is already leaving | an open refused for a few seconds after the last close | the count drops when the room unloads; `Retry-After` says when to try again |
| The ceiling is set too low for the container | every large document refused | set `MAX_LOADED_HEAVY_ROOMS` |
| The stored file cannot be read at the ceiling | the open route answers 500 | the document was already unreadable; none |

## Security notes

- A refusal reveals only aggregate load, never another person's document or name. A 503 before the body of the upload is stored costs the server the multipart parse already paid for by the existing guards.
- The ceiling cannot be raised from the client; the environment variables are operator-only.
