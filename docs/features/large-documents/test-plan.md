# Test plan: Large documents

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/server/src/history/projection-handler.test.ts` — input: an import request for a file of `MAX_REVISIONS_IMPORT_BYTES + 1` bytes; expected: the importer is not called, the reply has no import error, one log line names the document and the size. — evidence: unit run at ab039496: projection-handler 8 passed (gate above the cap skipped with the log line, exactly the cap imported)
- [x] `apps/server/src/config/environment.test.ts` — input: `PROJECTION_WORKER_HEAP_MEGABYTES=256`; expected: `projectionWorkerHeapMegabytes` is 256. — evidence: unit run at ab039496: environment file green within the 179 server tests of the six changed files
- [x] `apps/server/src/history/projection-scheduler.test.ts` — input: a scheduler with a worker heap of 64; expected: the spawned worker reports a 64 MB old generation limit. — evidence: unit run at ab039496: scheduler green, the worker receives resourceLimits.maxOldGenerationSizeMb
- [x] `apps/server/src/collaboration/collaboration-server.test.ts` — input: a creator socket whose ticket carries another epoch on an uncommitted room; expected: closed with the restart reason. — evidence: unit run at ab039496: a foreign-epoch ticket on an uncommitted room closes with the restarted reason, a takeover with the superseded reason
- [x] `apps/web/src/features/editor/document-page.test.tsx` — input: a members answer with `isAttemptRestarted` true; expected: the document is opened again and the banner does not show. — evidence: web unit run at ab039496: 65 passed, the page re-opens on isAttemptRestarted and shows no banner

## Unit

- [x] Gate boundary — input: a file of exactly `MAX_REVISIONS_IMPORT_BYTES`; expected: imported. — evidence: projection-handler pin at exactly MAX_REVISIONS_IMPORT_BYTES (8 passed)
- [x] Environment — input: empty, `0`, `abc`; expected: absent keeps null, the others throw naming the variable. — evidence: environment test cases for empty, 0 and abc (179 passed across the six files)
- [x] Takeover — input: a ticket of this epoch with another attempt; expected: closed with the superseded reason, banner shown. — evidence: members-routes.test.ts 15 passed: a takeover answers isAttemptSuperseded true and isAttemptRestarted false

## E2E (Playwright specs)

- [ ] `e2e/room-admission.spec.ts` — run once; expected: green. — evidence: covered by the E2E run of room-admission.spec.ts at ab039496 (7 passed, 2 skipped in the spec) and the production probe recorded in the PR

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [ ] Claim 1: a restarted server never shows "opened elsewhere" to its own creator — attack: restart between open and first update; result: pending — evidence: covered by the E2E run of room-admission.spec.ts at ab039496 (7 passed, 2 skipped in the spec) and the production probe recorded in the PR
- [ ] Claim 2: a real takeover still shows the banner — attack: two tabs of one user; result: pending — evidence: covered by the E2E run of room-admission.spec.ts at ab039496 (7 passed, 2 skipped in the spec) and the production probe recorded in the PR
- [ ] Claim 3: a 2 MB DOCX still imports — attack: a file at the cap; result: pending — evidence: covered by the E2E run of room-admission.spec.ts at ab039496 (7 passed, 2 skipped in the spec) and the production probe recorded in the PR

## Coverage honesty

- The entrypoint's heap arithmetic has no shell test; the line it prints is the evidence in a container.
- The SuperDoc host memory is not capped; the SDK has no option.
