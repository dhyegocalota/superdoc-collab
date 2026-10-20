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

- [ ] FAILED (partly): time travel on the heavy document answers each of five steps in about a second — observed on 04cc4c15 with ana and five edits on the heavy document, stepping the timeline with the keyboard at 1280: first step 14.9 s and 16.0 s in two runs (cold viewer), then 1.4, 2.9, 10.3 and 1.0 s in one run and 1.2, 2.6, 0.85 and 1.9 s in the other, at a machine load of 9 to 25; the 10.3 s outlier was not repeated. Evidence: .pr-media/instant-open-2/walk/ (06-version-step-1-1280.png, 06-version-step-5-1280.png). Steps at 375 were not exercised: the keyboard stepping found no band there. Explained, not a defect of the worker: the sub-3 s readings timed the banner while the previous frame was still on screen. Timed on the new frame, every step takes 14 to 19 s: worker 1.1 to 1.5 s, route 2.3 to 2.6 s, state in the browser at 5.8 to 7.4 s, then 9.7 to 10.5 s of apply and render of 36.6 MB, the cost of one editor open (13 to 15 s). Split in spec.md, Measured.
- [x] The timeline and the summary still work on the heavy document — evidence: "Summarize edits" answered "The summary is up to date", top edit General +5 words (.pr-media/instant-open-2/walk/07-summary-1280.png); the heavy editor and the panel render at 375 (05-heavy-panel-375.png).
- [x] The server log shows no worker recycle during the steps — evidence: .pr-media/instant-open-2/walk/server-ceiling-stack.log, zero lines with "Recycled the projection worker".
- [x] A heavy document opens in the editor after 15 s on a loaded machine — evidence: 05-heavy-editor-1280.png, tt walk log, 15.2 s to the first text run.

## Measured

- [x] Heap cap, retained heap, bootstrap projection and version step before and after — evidence: spec.md table.

## Adversarial review

- [x] The reviewer tries a log whose snapshot predates a delete of content the tail created. — evidence: reviewer round 1 at a254984e attacked it with a log whose snapshot predates a delete the tail created: held, the delete is in the merged tail and applies over the snapshot; materialize differs from a replay from sequence 0 only by leaving out pre-commit partials of abandoned attempts, the intended reading
