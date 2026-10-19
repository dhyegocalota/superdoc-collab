# Test plan: Large documents

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/server/src/history/projection-handler.test.ts` — input: an import request for a file of `MAX_REVISIONS_IMPORT_BYTES + 1` bytes; expected: the importer is not called, the reply has no import error, one log line names the document and the size.
- [ ] `apps/server/src/config/environment.test.ts` — input: `PROJECTION_WORKER_HEAP_MEGABYTES=256`; expected: `projectionWorkerHeapMegabytes` is 256.
- [ ] `apps/server/src/history/projection-scheduler.test.ts` — input: a scheduler with a worker heap of 64; expected: the spawned worker reports a 64 MB old generation limit.
- [ ] `apps/server/src/collaboration/collaboration-server.test.ts` — input: a creator socket whose ticket carries another epoch on an uncommitted room; expected: closed with the restart reason.
- [ ] `apps/web/src/features/editor/document-page.test.tsx` — input: a members answer of `server-restarted`; expected: the document is opened again and the banner does not show.

## Unit

- [ ] Gate boundary — input: a file of exactly `MAX_REVISIONS_IMPORT_BYTES`; expected: imported.
- [ ] Environment — input: empty, `0`, `abc`; expected: absent keeps null, the others throw naming the variable.
- [ ] Takeover — input: a ticket of this epoch with another attempt; expected: closed with the superseded reason, banner shown.

## E2E (Playwright specs)

- [ ] `e2e/room-admission.spec.ts` — run once; expected: green.

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [ ] Claim 1: a restarted server never shows "opened elsewhere" to its own creator — attack: restart between open and first update; result: pending
- [ ] Claim 2: a real takeover still shows the banner — attack: two tabs of one user; result: pending
- [ ] Claim 3: a 2 MB DOCX still imports — attack: a file at the cap; result: pending

## Coverage honesty

- The entrypoint's heap arithmetic has no shell test; the line it prints is the evidence in a container.
- The SuperDoc host memory is not capped; the SDK has no option.
