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
| Wait ceiling | `RoomBootstrap.predictedWaitMs` is what is left of the running job of the lane plus every queued job of the lane, each at `documentXmlBytes` times the measured rate per megabyte (the seeded rate until heavy conversions of two different owners completed; each owner holds one sample, the mean is clamped to a third and three times the seed). `POST /api/documents` answers 503 for a heavy file when that wait is above `MAX_BOOTSTRAP_WAIT_MS` (5 minutes), before storing anything, with `Retry-After` the predicted wait in seconds and the body `bootstrapBusyMessage(wait)`: "The server is busy preparing other documents; try again in about N min". A blank create and a light file are never refused by it. The upload dialog shows the server's sentence. |
| Queue position | While a document is Queued, its open answer carries `queuePosition`, the documents ahead (the running one included, the other owners' turns respected), and `queueWaitMs`, the predicted wait before its own turn. Both are null in every other stage. The panel reads "3 documents ahead · about 4 min" plus the elapsed time; with nothing ahead it keeps "Waiting for its turn". |
| Heavy room budget | Every loaded room is budgeted in heap by its state bytes times `HEAVY_ROOM_HEAP_BYTES_PER_STATE_BYTE` (19, measured: 611 MB for 36.6 MB of state, the constant keeps a margin), and heavy rooms (state above `LARGE_ROOM_STATE_BYTES`) may use only `1 - SMALL_ROOMS_HEAP_SHARE` of the budget (75 percent), so small rooms keep a quarter of it. `roomHeapBudgetMegabytes` is the smaller of what the container leaves (limit minus the reserve minus one conversion, `BOOTSTRAP_CONVERSION_RESIDENT_MEGABYTES`) and what the server's old space leaves (`SERVER_HEAP_MEGABYTES`, exported by the entrypoint, minus `SERVER_HEAP_BASELINE_MEGABYTES` (100) minus `ROOM_LOAD_SPIKE_HEAP_MEGABYTES` (900)), because the room lives in the heap the entrypoint caps at 40 percent of the limit. At 8 GB that is 2,276 MB, 1,707 MB of it for heavy rooms: two heavy rooms (695 MB each), the third refused. A room's size is its loaded state plus the updates received since; when an admission is short of headroom the rooms that received updates are measured again (one encode each) and the check is repeated, so a light document that was edited a lot does not stay counted as heavy. A heavy document that is not loaded and not being prepared is checked when opened over HTTP (`fits`, no reservation) and admitted at the socket (`admits`), which reserves its estimate (XML bytes times `BOOTSTRAP_STATE_BYTES_RATIO`) for `ROOM_RESERVATION_TTL_MS` or until it loads, and gives it back when the user's last socket on it closes without a load, so a burst of sockets cannot all pass at the edge and no member holds budget with no socket. One user holds at most `MAX_HEAVY_ROOMS_PER_USER` heavy rooms; past it the refusal has its own sentence (`HEAVY_ROOMS_USER_CAP_MESSAGE`, 503 without `Retry-After`), reason and close code (4504), because the server is not the one that is full. A refusal is a 503 with `HEAVY_ROOMS_FULL_MESSAGE` and `Retry-After` of `HEAVY_ROOMS_RETRY_AFTER_MS` on the open route; the socket is denied with the reason `HEAVY_ROOMS_FULL_REASON` and closed with `HEAVY_ROOMS_FULL_CLOSE_CODE`, not the policy violation code. Idle rooms are not closed to make room: a server-initiated close makes the provider reconnect at once and frees nothing. A heavy upload is refused with the same 503 when no headroom is left and, once stored, reserves its estimate for `ROOM_UPLOAD_RESERVATION_TTL_MS` (the longest wait plus the longest bootstrap) or until its room loads or the registry ends the job (committed, failed or forgotten); an owner holds one such reservation at a time. Measuring rooms again is limited to once per `ROOM_REMEASURE_COOLDOWN_MS`, so polling the open route at the budget cannot stall the loop. A failed document is started again by an open after `BOOTSTRAP_RETRY_COOLDOWN_MS` at most `BOOTSTRAP_MAX_RETRIES` times, and a heavy retry spends the owner's hourly heavy budget; past either it stays failed and the card says to upload again. The page reloads by itself `HEAVY_ROOMS_RETRY_AFTER_MS` after a ceiling refusal on the socket. SuperDoc does not pass the provider's denial reason on, so when the editor page gets an access denial it asks the server again (`GET /api/documents/:id` in a query of its own): a 503 with a sentence shows that sentence in the banner (`ConnectionFailureReason.HeavyRoomsFull`) and reloads after `HEAVY_ROOMS_RETRY_AFTER_MS`, except for the per-user cap sentence, which never reloads by itself, a 403 or anything else keeps the access denied line, and no reason is shown while the answer is awaited; one owner is also limited to `MAX_HEAVY_CONVERSIONS_PER_HOUR` heavy uploads, then 429 with the busy message and `Retry-After`; the 429 for a waiting slot says `BOOTSTRAP_QUEUE_FULL_MESSAGE` when the owner also has a document being prepared and `BOOTSTRAP_QUEUE_WAITING_MESSAGE` when only the waiting one exists. The waiting page shows the sentence with Try again. |
| Operator override | `MAX_BOOTSTRAP_WAIT_MS`, `ROOM_HEAP_BUDGET_MEGABYTES` and `MAX_HEAVY_CONVERSIONS_PER_HOUR` environment variables replace the three limits; with neither a memory limit, a server heap nor the override there is no room budget. |

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

A room costs 611 MB for 36.6 MB of state (16.7 heap bytes per state byte; the constant is 19 for margin), and loading one adds a transient of about 840 MB. The container formula alone would have admitted seven rooms at 8 GB and the process dies at the fourth. With the constants the budget at 8 GB is 3,276 − 100 − 900 = 2,276 MB, of which heavy rooms may use 75 percent (1,707 MB): two rooms of 695 MB, the third refused. The three rooms that the measurement held leave 190 MB for everything else, which is why the share exists.

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
