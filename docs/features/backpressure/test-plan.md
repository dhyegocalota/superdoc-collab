# Test plan: Backpressure

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/server/src/collaboration/room-bootstrap.test.ts::a queued document reports the documents ahead of it, the running one included, and the wait they cost` — input: three heavy documents of three owners; expected: positions null, 1, 2 and waits 0, one estimate, two estimates
- [ ] `apps/server/src/documents/documents-routes.test.ts::a heavy upload that would wait past the ceiling is 503 with the predicted wait, stores nothing, and a blank or light create is still served` — input: ceiling 1 s, a second heavy upload; expected: 503, `bootstrapBusyMessage`, `Retry-After` near the estimate
- [ ] `apps/server/src/collaboration/room-memory-release.test.ts::the ceiling is reached when as many heavy rooms are loaded as the limit, and a room that is already loaded is never at it` — input: ceiling 2, two heavy rooms; expected: a third room is at the ceiling, a loaded one is not
- [ ] Confirmed each fails for the right reason: the red run printed `predictedWaitMs is not implemented`, `turnOrder is not implemented`, `heavyRoomCount is not implemented`, `isAtCeiling is not implemented`, `isRefused is not implemented`, and the assertion failures `expected 'Upload failed with status 503.'` and `expected 201 to be 503`.

## Unit

- [ ] `owner-round-robin-queue.test.ts::the turn order lists the items in the order they would be shifted and leaves the queue as it was` — input: three owners; expected: `['ana-1','bruno-1','carla-1','ana-2','ana-3']`, then the drain equals it
- [ ] `room-bootstrap.test.ts::the position follows the turns of the owners` — input: ana with three, bruno with one; expected: positions 1, 2, 3 for ana-2, bruno-1, ana-3
- [ ] `room-bootstrap.test.ts::the running document counts only what is left of its estimate` — input: 4 s into the running job; expected: the queued wait is one estimate minus 4 s, null once it runs
- [ ] `room-bootstrap.test.ts::the predicted wait of a new heavy job is what is left of the running one plus every queued one` — input: empty lane, one running, one queued; expected: 0, one estimate, two estimates minus the elapsed time, 0 for the light lane
- [ ] `room-memory-release.test.ts::the heavy rooms loaded are the rooms above the large room limit` — input: rooms at and above the limit; expected: only the ones above count, an unloaded one leaves
- [ ] `room-memory-release.test.ts::without a limit the ceiling is never reached` — input: no limit, three heavy rooms; expected: false
- [ ] `heavy-room-admission.test.ts` — input: ceiling reached for a heavy document, a light one, below the ceiling, a document being prepared; expected: refused, not, not (file unread), not
- [ ] `documents-routes.test.ts::heavy uploads wait their turn up to the ceiling and the first one past it is refused` — input: ceiling of two estimates, four heavy uploads; expected: 201, 201, 201, 503
- [ ] `documents-routes.test.ts::opening a document the server cannot hold as a large room is 503` — input: the admission refuses one document; expected: 503 with `HEAVY_ROOMS_FULL_MESSAGE` and `Retry-After` 60, another document 200
- [ ] `collaboration-server.test.ts::a member and an agent are refused a room while the ceiling is reached for it` — input: the admission refuses; expected: both sockets refused with the log line, admitted once it does not; the bootstrap socket never asked
- [ ] `environment.test.ts` — input: `MAX_BOOTSTRAP_WAIT_MS`, `MAX_LOADED_HEAVY_ROOMS`, `MEMORY_LIMIT_MEGABYTES`; expected: the override wins, the memory limit derives the ceiling, neither means null, a non-integer fails startup
- [ ] `open-progress-view.test.ts` — input: Queued with 3 ahead and 240,000 ms; expected: "3 documents ahead · about 4 min · 12 s"; 1 ahead: "1 document ahead"; 0 ahead: "Waiting for its turn"
- [ ] `editor-api.test.ts`, `waiting-for-document.test.tsx`, `use-upload-document.test.tsx` — input: a 503 with a sentence; expected: `ServerBusyError` with it, the heading with Try again and no connection hint, the dialog message
- [ ] Edge: `documents.test.ts` — `maxLoadedHeavyRooms(4096)` is 1, `8192` is 7, `2048` is 0; a document is heavy above 4 MB of XML

## E2E (Playwright specs)

- [ ] `e2e/backpressure.spec.ts::a second heavy upload shows its place in the queue and a third past the wait ceiling is refused in the dialog` — steps: ceiling 60 s, three people upload the heavy fixture; expected: the third dialog reads the busy sentence, the second's panel reads "1 document ahead · about N s"
- [ ] `e2e/backpressure.spec.ts::with one large room loaded, opening a second large document is refused with the message of the server` — steps: ceiling 1 heavy room, one person holds a heavy document open; expected: the other's open answers 503 and the waiting page shows `HEAVY_ROOMS_FULL_MESSAGE`
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
- A real 8 GB container with seven large documents open is not reproduced.
