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
| Heavy room budget | Rooms are budgeted in heap, not counted. `roomHeapBudgetMegabytes` is the smaller of what the container leaves (limit minus the reserve minus one conversion, `BOOTSTRAP_CONVERSION_RESIDENT_MEGABYTES`) and what the server's old space leaves (`SERVER_HEAP_MEGABYTES`, exported by the entrypoint, minus `SERVER_HEAP_BASELINE_MEGABYTES` (100) minus `ROOM_LOAD_SPIKE_HEAP_MEGABYTES` (900)), because the room lives in the heap the entrypoint caps at 40 percent of the limit. A loaded room above `LARGE_ROOM_STATE_BYTES` costs its state bytes times `HEAVY_ROOM_HEAP_BYTES_PER_STATE_BYTE` (19, measured: 695 MB for 36.6 MB of state); a room admitted but not yet loaded holds its estimate (XML bytes times `BOOTSTRAP_STATE_BYTES_RATIO`) for `ROOM_RESERVATION_TTL_MS` or until it loads, so a burst of opens cannot all pass at the edge. The open route answers 503 with `HEAVY_ROOMS_FULL_MESSAGE` and `Retry-After` of `HEAVY_ROOMS_RETRY_AFTER_MS` for a heavy document that does not fit and is not loaded, and the member and agent sockets are closed unauthorized. A heavy upload is refused with the same 503 when no headroom is left, because its bootstrap would load a room past the budget. The waiting page shows the sentence with Try again. |
| Operator override | `MAX_BOOTSTRAP_WAIT_MS` and `ROOM_HEAP_BUDGET_MEGABYTES` environment variables replace the two limits; with neither a memory limit, a server heap nor the override there is no room budget. |

## Non-goals

- Admission by total memory in use: the count is of rooms, the one thing a person's click adds.
- Shedding a room that is already loaded: a loaded room is never refused, and a document being prepared is never refused by the ceiling, so its owner keeps seeing the queue.
- A queue that outlives a restart.

## Design

- `OwnerRoundRobinQueue.turnOrder` lists the queued items in the order `shift` would serve them. `RoomBootstrap` keeps the document each lane is running, so `answerOf` can place a Queued document: position is the running job plus its index in the turn order, wait is the running job's remaining estimate plus the estimates of the jobs before it. A queued blank that waits for the first blank's state is in no queue and reports null.
- `createHeavyRoomAdmission` joins the room memory (`admit` reserves, `hasHeadroomFor` only looks), the XML size of the stored file (read once per document and cached; heavy means `xml bytes × BOOTSTRAP_STATE_BYTES_RATIO > LARGE_ROOM_STATE_BYTES`) and the registry (is the document being prepared). The open route and `admitToCommittedRoom` ask `admits` before spending any open budget; the upload asks `hasHeadroomFor`. The bootstrap socket is never asked.
- The web maps a 503 of the upload to the dialog message and a 503 of the open route to `ServerBusyError`, which the waiting page shows as its heading.

## Measured: heavy rooms in a capped server (2026-10-20)

The built server with `--max-old-space-size=3276` (the 40 percent of an 8 GB container), the owner's heavy fixture uploaded six times and the rooms opened one by one over raw sockets, the heap sampled every 2 s after a collection. The idle main thread holds about 68 MB.

| Heavy rooms open | Live heap after collection | Peak while the room loaded |
|------------------|----------------------------|----------------------------|
| 1 | 679 MB | 844 MB |
| 2 | 1,290 MB | 2,102 MB |
| 3 | 1,901 MB | 2,741 MB |
| 4 | not reached | the server died at 3,147 MB of 3,276 MB: `JavaScript heap out of memory` |

A room costs 611 MB for 36.6 MB of state (16.7 heap bytes per state byte; the constant is 19 for margin), and loading one adds a transient of about 840 MB. The container formula alone would have admitted seven rooms at 8 GB and the process dies at the fourth. With the constants the budget at 8 GB is 3,276 − 100 − 900 = 2,276 MB: three rooms of 695 MB, the fourth refused.

## Failure modes

| What | Signal | Back out |
|------|--------|----------|
| The prediction is too pessimistic (the rate learned from one slow conversion) | uploads refused while the lane is short | raise `MAX_BOOTSTRAP_WAIT_MS`; the rate averages the last `BOOTSTRAP_RATE_SAMPLES` conversions |
| The budget counts a room that is already leaving | an open refused for a few seconds after the last close | the heap drops when the room unloads; `Retry-After` says when to try again |
| The budget is too low for the container | every large document refused | set `ROOM_HEAP_BUDGET_MEGABYTES` |
| An admitted opener never connects | its estimate is held | the reservation expires after `ROOM_RESERVATION_TTL_MS` |

## Known limits

- A heavy open in the 2 to 4 s after a bootstrap commits can be refused while Hocuspocus stores and unloads the bootstrap room, which still counts against the budget; the 503 carries `Retry-After`. Two ways to close it (not counting a room whose last socket was the bootstrap's, or unloading bootstrap rooms at once) were left for a later item.

## Security notes

- A refusal reveals only aggregate load, never another person's document or name. A 503 before the body of the upload is stored costs the server the multipart parse already paid for by the existing guards.
- The ceiling cannot be raised from the client; the environment variables are operator-only.
