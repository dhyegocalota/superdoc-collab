# Test plan: Lighter projection

## The failing test first

- [x] `libs/history/src/version-state.test.ts::a version never reads the log past its sequence` and the six equality tests — input: `versionAt` stub; expected: red. Evidence: cbb2f7e8, `Error: versionAt is not implemented`.
- [x] `libs/history/src/projection.test.ts::materializes the document once however many batches the run takes` — expected: one `latestSnapshot` read. Evidence: 1b459f97, `expected "latestSnapshot" to be called 1 times, but got 8 times`.

## Unit

- [x] Every mark and every logged sequence restores as a full replay, deletes included — evidence: 4c478d7b, `libs/history` 382 passed.
- [x] `projection-handler.test.ts` forget clears the read model — evidence: 4c478d7b, 16 passed.

## E2E (Playwright specs)

- [x] `e2e/time-travel.spec.ts` — evidence: 12 passed, 4c478d7b.
- [x] `e2e/room-admission.spec.ts` — evidence: 7 passed, 4c478d7b.

## Walk on the running stack

- [x] Time travel on the heavy document: the claim "about a second per step" held for the worker only — measured end to end on the final head (spec → Measured): worker materialization 0.7 to 1.0 s, encode 0.2 s, the 36.6 MB state on the socket 5.8 to 7.4 s after the key press, `Y.applyUpdate` 0.5 s, SuperDoc build and layout about 8.4 s, first text run at 14.9 to 20.1 s; the tester's 14.9 and 16.0 s first steps on 04cc4c15 match, and the "0.85 to 2.9 s" later steps timed the banner changing while the previous frame stayed on screen. Evidence: .pr-media/instant-open-2/walk/ (06-version-step-1-1280.png, 06-version-step-5-1280.png) and the split in the spec.
- [x] The timeline and the summary still work on the heavy document — evidence: "Summarize edits" answered "The summary is up to date", top edit General +5 words (.pr-media/instant-open-2/walk/07-summary-1280.png); the heavy editor and the panel render at 375 (05-heavy-panel-375.png).
- [x] The server log shows no worker recycle during the steps — evidence: .pr-media/instant-open-2/walk/server-ceiling-stack.log, zero lines with "Recycled the projection worker".
- [x] A heavy document opens in the editor after 15 s on a loaded machine — evidence: 05-heavy-editor-1280.png, tt walk log, 15.2 s to the first text run.

## Measured

- [x] Heap cap, retained heap, bootstrap projection and version step before and after — evidence: spec.md table.

## Walk

- [x] Heavy document, first cold version step: the server answers in 1.4 to 2.3 s and the 36 MB state has arrived 3.2 to 3.7 s after the page opens; the remainder of the tester's 15 s is the browser rendering the state, not the materialization — evidence: spec.md, "Where the first version step goes".

## Adversarial review

- [x] The reviewer tries a log whose snapshot predates a delete of content the tail created. — evidence: reviewer round 1 at a254984e attacked it with a log whose snapshot predates a delete the tail created: held, the delete is in the merged tail and applies over the snapshot; materialize differs from a replay from sequence 0 only by leaving out pre-commit partials of abandoned attempts, the intended reading
