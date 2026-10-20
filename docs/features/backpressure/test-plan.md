# Test plan: Backpressure

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/server/src/collaboration/room-bootstrap.test.ts::a queued document reports the documents ahead of it, the running one included, and the wait they cost` — input: three heavy documents of three owners; expected: positions null, 1, 2 and waits 0, one estimate, two estimates — evidence: red at 4b801cde (`expected null to be 1`), green at 1223ce2f
- [x] `apps/server/src/documents/documents-routes.test.ts::a heavy upload that would wait past the ceiling is 503 with the predicted wait, stores nothing, and a blank or light create is still served` — input: ceiling 1 s, a second heavy upload; expected: 503, `bootstrapBusyMessage`, `Retry-After` near the estimate — evidence: red at 4b801cde (`expected 201 to be 503`), green at 1223ce2f
- [x] `apps/server/src/collaboration/room-memory-release.test.ts::a room is admitted while its estimate fits the budget beside the loaded rooms, and a loaded room is always admitted` — input: budget of two rooms, two loaded; expected: a third is not admitted, a loaded one is — evidence: red at 38de6b0a (`Error: admit is not implemented heavy-room 16777217 19`), green at 58dae90e
- [x] Confirmed each fails for the right reason: the first red run (4b801cde) printed `predictedWaitMs is not implemented`, `turnOrder is not implemented`, `heavyRoomCount is not implemented`, `isAtCeiling is not implemented`, `isRefused is not implemented`, and the assertion failures `expected 'Upload failed with status 503.'` and `expected 201 to be 503`; the second (38de6b0a) printed `admit is not implemented`, `heavyHeapBytes is not implemented`, `hasHeadroomFor is not implemented`, `isBounded is not implemented`, `expected "vi.fn()" to be called 1 times, but got 3 times` and `expected [ 201, ... ] to deeply equal [ 503, ... ]`.

## Unit

- [ ] `owner-round-robin-queue.test.ts::the turn order lists the items in the order they would be shifted and leaves the queue as it was` — input: three owners; expected: `['ana-1','bruno-1','carla-1','ana-2','ana-3']`, then the drain equals it
- [ ] `room-bootstrap.test.ts::the position follows the turns of the owners` — input: ana with three, bruno with one; expected: positions 1, 2, 3 for ana-2, bruno-1, ana-3
- [ ] `room-bootstrap.test.ts::the running document counts only what is left of its estimate` — input: 4 s into the running job; expected: the queued wait is one estimate minus 4 s, null once it runs
- [ ] `room-bootstrap.test.ts::the predicted wait of a new heavy job is what is left of the running one plus every queued one` — input: empty lane, one running, one queued; expected: 0, one estimate, two estimates minus the elapsed time, 0 for the light lane
- [ ] `room-memory-release.test.ts::the heavy heap is the state of every room above the large room limit times the heap per state byte` — input: rooms at and above the limit, one of 80 MB; expected: only the ones above count, weighted by state bytes, an unloaded one leaves
- [ ] `room-memory-release.test.ts::an admitted room holds its estimate against the next opener until it loads, and a reservation that never loaded expires` — input: budget of one room, two openers, then the load, then 30 s; expected: the second is refused, the load replaces the reservation, the reservation expires
- [ ] `room-memory-release.test.ts::the budget is spent by the size of the state` — input: one 120 MB room loaded in a budget of 160 MB; expected: 80 MB refused, 40 MB admitted
- [ ] `room-memory-release.test.ts::headroom for a new room is checked ... without taking a place` and `without a budget nothing is bounded` — input: budget of one room, then none; expected: headroom true until a reservation, always true without a budget
- [ ] `heavy-room-admission.test.ts` — input: a heavy document, a light one, no budget, a document being prepared, an upload; expected: asked with the room name and the state estimate, admitted without a place, file unread, never refused, headroom asked only for a heavy file
- [ ] `cached-document-xml-bytes.test.ts` — input: the same document asked three times, then 1024 others; expected: one read, then a read again
- [ ] `documents-routes.test.ts::heavy uploads wait their turn up to the ceiling and the first one past it is refused` — input: ceiling of two estimates, four heavy uploads; expected: 201, 201, 201, 503
- [ ] `documents-routes.test.ts::a heavy upload is 503 with the large documents message while no room of its size fits` — input: no headroom; expected: 503, `HEAVY_ROOMS_FULL_MESSAGE`, `Retry-After` 60, nothing stored, a light file and a blank still 201
- [ ] `documents-routes.test.ts::opening a document the server cannot hold as a large room is 503` — input: the admission refuses one document; expected: 503 with `HEAVY_ROOMS_FULL_MESSAGE` and `Retry-After` 60, another document 200
- [ ] `collaboration-server.test.ts::a member and an agent are refused a room while the ceiling is reached for it` — input: the admission refuses; expected: both sockets refused with the log line, admitted once it does not; the bootstrap socket never asked
- [ ] `environment.test.ts` — input: `MAX_BOOTSTRAP_WAIT_MS`, `ROOM_HEAP_BUDGET_MEGABYTES`, `MEMORY_LIMIT_MEGABYTES`, `SERVER_HEAP_MEGABYTES`; expected: the override wins, the two limits derive the budget, none means null, a non-integer fails startup
- [ ] `open-progress-view.test.ts` — input: Queued with 3 ahead and 240,000 ms; expected: "3 documents ahead · about 4 min · 12 s"; 1 ahead: "1 document ahead"; 0 ahead: "Waiting for its turn"
- [ ] `editor-api.test.ts`, `waiting-for-document.test.tsx`, `use-upload-document.test.tsx` — input: a 503 with a sentence; expected: `ServerBusyError` with it, the heading with Try again and no connection hint, the dialog message
- [ ] `room-memory-release.test.ts::one user may hold only so many heavy rooms` — input: `MAX_HEAVY_ROOMS_PER_USER` rooms admitted for one user; expected: the next new room refused for them, admitted for another user, a held or loaded room admitted
- [ ] `room-memory-release.test.ts::at the budget the heavy rooms nobody edited for a minute are closed` — input: two loaded rooms, one edited 1 ms before the minute; expected: only the idle one closed, the opener refused until it unloads, then admitted
- [ ] `room-memory-release.test.ts::the size of a room is its loaded state, measured again once enough updates arrived` — input: 9 MB loaded, 6 MB of updates; expected: due for a measure, not heavy until the measure says so
- [ ] `collaboration-server.test.ts` — input: a room due for a measure; expected: `measured` with the encoded size of the live document; a load reports `loaded` with the restored state size
- [ ] `room-bootstrap.test.ts` — input: two conversions by one owner, then another owner's; expected: one sample per owner (the latest), the mean across owners, clamped to three times and a third of the seeded rate; a requester's prediction counts only the turns ahead of them
- [ ] `owner-round-robin-queue.test.ts` — input: a hypothetical push; expected: the order it would be served in, the queue unchanged
- [ ] `room-memory-release.test.ts::fitting never takes a place` and `::a socket that closed without loading its room gives the reservation back` — input: five fits then an admit; a reservation and a release; expected: fits true until a socket admits, the reservation freed on release, a loaded room keeps its bytes
- [ ] `room-memory-release.test.ts::a refused socket evicts the least recently active idle room, one at a time` and `::every inbound frame counts as activity` — input: three idle rooms, two refusals; a touched room; expected: oldest closed first, then the next, never a closing room, a touched room is not idle
- [ ] `documents-heavy-routes.test.ts::an owner past the hourly budget of heavy conversions is 429` — input: budget of 2, three heavy uploads; expected: 201, 201, 429 with the busy message, a light file and a blank still 201
- [ ] `room-bootstrap.test.ts` — input: one owner's conversions, then two owners'; expected: the seeded rate until two owners have a sample
- [ ] Edge: `documents.test.ts` — the budget is the smaller of the container and the heap formulas, null with neither; a document is heavy above 4 MB of XML
- [ ] `tools/repository-shape/src/entrypoint.test.ts` — input: an 8 GB limit; expected: the server sees `SERVER_HEAP_MEGABYTES=3276`

## E2E (Playwright specs)

- [ ] `e2e/backpressure.spec.ts::a second heavy upload shows its place in the queue and a third past the wait ceiling is refused in the dialog` — steps: ceiling 60 s, three people upload the heavy fixture; expected: the third dialog reads the busy sentence, the second's panel reads "1 document ahead · about N s"
- [ ] `e2e/backpressure.spec.ts::with one large room loaded, opening a second large document is refused with the message of the server` — steps: a room heap budget of 1000 MB, one person holds a heavy document open; expected: the other's open answers 503 and the waiting page shows `HEAVY_ROOMS_FULL_MESSAGE`
- [ ] `e2e/room-admission.spec.ts` still green

## Prove it for real — Playwright MCP

- [ ] Happy path: upload two heavy documents as two people; expected: the second panel counts down its documents ahead, then both open
- [ ] Rejected input: a third heavy upload above the ceiling; expected: the dialog keeps the file chooser, shows the sentence, nothing in the list
- [ ] Console and network clean: zero console errors, other than the 503 responses

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [ ] Claim 1: a loaded room is never refused — attack: reconnect to a loaded heavy room at the ceiling; result:
- [ ] Claim 2: a document being prepared is never refused by the ceiling — attack: poll the open route of a queued heavy document at the ceiling; result:
- [ ] Claim 3: a blank create is never refused — attack: create blanks while the lane is over the ceiling; result:

## Coverage honesty

- The memory constants are extrapolations of the one measured document; the E2E scripts the limits low instead of filling a container.
- A real 8 GB container is not reproduced; the capped repro (server heap 3,276 MB) measured the heap at N rooms, see the spec.
- Two loads at the same instant are not budgeted twice: the load spike is counted once.
