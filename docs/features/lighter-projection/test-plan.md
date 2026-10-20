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

## Measured

- [x] Heap cap, retained heap, bootstrap projection and version step before and after — evidence: spec.md table.

## Adversarial review

- [ ] The reviewer tries a log whose snapshot predates a delete of content the tail created.
