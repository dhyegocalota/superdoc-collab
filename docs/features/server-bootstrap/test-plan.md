# Test plan: Server bootstrap

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/server/src/history/projection-handler.test.ts::bootstrap` — input: a Bootstrap request; expected: the injected `bootstrapRoom` is called with the document id, file path, url and token, and the reply is a Bootstrap reply — evidence: red 423756c2 (`handleBootstrap is not implemented`), green 56aed11b
- [x] `apps/server/src/collaboration/room-bootstrap.test.ts` — input: `bootstrapRoom` on an uncommitted document; expected: stage Queued then Preparing, the scheduler called once — evidence: red 950dd8de (`RoomBootstrap.request is not implemented`), green f108691b
- [x] Confirmed each fails for the right reason: the stub throws `<name> is not implemented` — evidence: the commit messages above

## Unit

- [x] `room-bootstrap.test.ts::one at a time` — input: two documents queued; expected: the second is Queued until the first settles — evidence: `room-bootstrap.test.ts` green at 56cde4e7, rewritten per lane at f0d1a69b
- [x] `room-bootstrap.test.ts::failure` — input: the scheduler rejects; expected: Failed, one log line, still Failed on the next progress read, no second start — evidence: the cooldown variant, red 5bd3ff96, green 56cde4e7
- [x] `room-bootstrap.test.ts::ready` — input: the commit hook with 1234 bytes; expected: Ready, `done` equal to `total`, `stateBytes` 1234 — evidence: `room-bootstrap.test.ts`, green at 56cde4e7
- [x] `room-bootstrap.test.ts::committed before` — input: a committed document with no job; expected: Ready 0 of 0, `stateBytes` null, no start — evidence: `room-bootstrap.test.ts`, green at 56cde4e7
- [x] `room-bootstrap.test.ts::stale attempt` — input: `isCurrent` with an attempt from a failed job; expected: false — evidence: `room-bootstrap.test.ts`, green at 7557aff7
- [x] `room-tokens.test.ts::attempt` — input: a bootstrap token for another document or an expired one; expected: null; an agent token on the bootstrap path: refused — evidence: red 282fa072, green e3f3b7fc
- [x] `collaboration-server.test.ts` — input: a member socket on an uncommitted room; expected: refused. The bootstrap socket with the current attempt: admitted as the owner with actor Human; a stale attempt: refused; after the commit a bootstrap socket with a stale attempt is closed — evidence: `collaboration-server.test.ts` green at 7557aff7 (24 files, 290 tests in `src/collaboration` and `src/documents/member-removal-routes.test.ts`)
- [x] `attach-collaboration.test.ts` — input: an upgrade to the bootstrap path from a non-loopback address; expected: the socket is destroyed — evidence: `attach-collaboration.test.ts` green at 7557aff7
- [x] `documents-routes.test.ts` — input: open of an uncommitted document by owner, editor and reader; expected: 200, `roomMode` Join, `bootstrap` Queued, no ticket fields; of a failed one: stage Failed; the upload and a blank create start one bootstrap each — evidence: `documents-routes.test.ts` 43 tests green at 80983260
- [x] `members-routes.test.ts` — expected: no `isAttemptSuperseded` or `isAttemptRestarted` — evidence: `members-routes.test.ts` green at 80983260
- [x] Edge: the owner removed before the bootstrap socket connects — expected: refused, stage Failed

## E2E (Playwright specs)

- [x] `e2e/room-admission.spec.ts` — an upload opens as Join for the uploader and for a second editor, with progress until Ready; no browser seeds the room
- [x] `e2e/room-admission.spec.ts` large case — first paragraph visible; the time is recorded below — evidence: Ready 38.9 s after the upload, first paragraph 13.4 s after the page opened, 4 of 4 passed in 2.0 minutes (local, web exports patched for the run)
- [x] `e2e/showcase*.spec.ts` stay green — evidence: `showcase.spec.ts` 1 passed (12.2 s), the only showcase spec

## Hardening after the security and review findings

Added on 2026-10-19. Each row has its red commit before its green one, in `plan.md` steps 12 to 17.

- [x] `projection-handler.test.ts` — input: a bootstrap that succeeds, throws or outlives its timeout; expected: the SDK host of its lane is released once, before the handler answers — evidence: red 635405f9 (`expected [ 'rejected' ] to deeply equal [ 'released', 'rejected' ]`), green 56cde4e7
- [x] `room-bootstrap.test.ts` — input: a run that resolves before the commit; expected: Preparing until `BOOTSTRAP_COMMIT_GRACE_MS`, Ready when the commit lands inside it, Failed after it — evidence: red 5bd3ff96 (`expected 'failed' to be 'preparing'`), green 56cde4e7
- [x] `room-bootstrap.test.ts` — input: a Failed bootstrap and a request before and after `BOOTSTRAP_RETRY_COOLDOWN_MS`; expected: Failed before, Queued with a new attempt after; a run interrupted by the worker is run once more, then Failed — evidence: red 5bd3ff96, green 56cde4e7
- [x] `bootstrap-applied.test.ts` — input: an open result with `bootstrapApplied` false, true and absent; expected: refused, accepted, accepted — evidence: red 5bd3ff96 (`assertBootstrapApplied is not implemented`), green 56cde4e7
- [x] `authenticate-bootstrap.test.ts`, `room-bootstrap.test.ts`, `projection-scheduler.test.ts` — input: a bootstrap socket on a committed room, a finished run's attempt, a bootstrap posted during a recycle; expected: refused, not current, held and never posted to the exiting worker — evidence: red c681c9a1, green 7557aff7. The first red test said a ready attempt must stop being current; the green commit ends it when the run ends instead, because the tests of 13 files write on their bootstrap socket after the commit
- [x] `collaboration-runtime.test.ts`, `documents-routes.test.ts` — input: polls of a document queued or preparing, with 31 polls and the log spied; expected: 200 every time, no log read, no open budget spent — evidence: red 15a58212 (`RoomBootstrap.isInFlight is not implemented`), green ccfbda50
- [x] `bootstrap-host-environment.test.ts` — input: an environment with `AUTH_SECRET`, `OPENROUTER_API_KEY`, `DEMO_PASSWORD`, `DATABASE_DIR`, `GITHUB_TOKEN` and `NODE_OPTIONS`; expected: every secret and the database location blanked, a heap size appended to the node options — evidence: red a0092e61, green 8101b0be. The cap itself is unproven for the SDK binary, which is a Bun executable
- [x] `owner-round-robin-queue.test.ts`, `room-bootstrap.test.ts`, `projection-queues.test.ts` — input: heavy and light files of three owners; expected: a light file runs at once beside a heavy one, owners take turns, `queueWaitMs` asks an owner with a waiting file to wait only in the lane of the new file — evidence: red bafa0d97 and 7b768c06, green ef362c60 and f0d1a69b
- [x] `docx-signature.test.ts` — input: a `word/document.xml` of exactly and one byte over `MAX_DOCUMENT_XML_BYTES` once inflated; expected: accepted, too large; a 1.5 GB zero-filled entry costs 114 ms and 44 MB — evidence: red bafa0d97, green ef362c60 and de754c67
- [x] `documents-routes.test.ts` — input: 31 uploads in a minute, a second upload with one waiting, a document.xml over the limit; expected: 429 with `Retry-After` and nothing stored, 429 with `Retry-After` and nothing stored, 415 with `DOCUMENT_TOO_LARGE_MESSAGE` — evidence: red fd0d63df, green 80983260
- [x] `environment.test.ts` — input: `UPLOADS_PER_MINUTE` set, empty and invalid; expected: the value, the default of 30, a startup error — evidence: 51a30acf
- [x] `e2e/room-admission.spec.ts` — input: a broken file and then a blank document by the same owner; expected: the blank document Ready within 5 s — evidence: 1033 ms, `.pr-media/gate/e2e-bootstrap-4.log` (776 ms alone, `.pr-media/gate/e2e-bootstrap-subset.log`); the unit measurement is 383 to 448 ms from the create to Ready

## Whole suite

- [x] `pnpm test:e2e` — evidence: `.pr-media/gate/e2e-bootstrap-4.log`, 156 passed and 1 failed in 7.3 minutes. The failure is `final-visuals.spec.ts` "Download PDF of the uploaded brief": the exported `word/document.xml` of a server-built room lacks the `xmlns:r`, `xmlns:wp` and `xmlns:a` declarations, so the print view cannot open it. It fails the same way at a090bc25, before this slice's hardening, and passes on `main` Fixed afterwards in `1fdcc380`: the cause was the joiner's blank.docx declaring only xmlns:w, not the SDK conversion; the file and the two others rerun green (39 passed).

## Prove it for real — Playwright MCP

Run by the tester, not the developer.

- [x] Upload a DOCX, open at once: progress shows, then the text — evidence: scripted walk (headless Playwright, MCP not used), the 9.5 MB heavy document at 1280 and 375: panel after 2.2 s, Preparing 53 to 130 s, Downloading 13 to 27 s, first paragraph 69 to 148 s after the upload under load average 8 to 13 on 12 cores; `.pr-media/instant-open/walk/heavy-1280-ana-*.png`, `heavy-375-ana-*.png`; small 2-paragraph DOCX 1.7 s, 12 of 12 tries, `small-1280-ana-opened.png`
- [x] Two authors open the same preparing document at once: both enter, no duplicated text — evidence: ana uploads, bruno opens the edit link 1 s later, both show Preparing then Downloading, first paragraph at 80.1 s and 79.7 s, first 1,802 characters identical, "Clause 1." once each, one bootstrap in the server log; `.pr-media/instant-open/walk/two-ana-preparing.png`, `two-bruno-preparing.png`, `two-ana-opened.png`, `two-bruno-opened.png`
- [x] Upload a file that is a zip but not a DOCX: the existing error copy shows, no hang — evidence: `buildBrokenDocx` uploaded at 1280 and 375, the card "The document could not be loaded." with Try again and Back to documents after 1.2 s, Back to documents returns to /documents; `.pr-media/instant-open/walk/broken-1280-ana-failed.png`, `broken-375-ana-failed.png`; see edge case 3 on the copy
- [x] Console and network clean other than the expected polling — evidence: opening the Ready heavy document: 0 console errors, 0 responses at 400 or above; calls: me 1, document 1, members 4, timeline 5, all 200 (`walk-health` run, 2026-10-19)

## Edge cases found during execution

1. A document uploaded behind a heavy one waits for the heavy bootstrap: the 2-paragraph DOCX uploaded one request after the heavy document showed "Waiting for its turn" and opened 47.4 s after its upload (`.pr-media/instant-open/walk/small-behind-heavy.png`). `e2e/open-progress.spec.ts` "a normal document opens without the panel ever showing" failed once in a combined run with `room-admission.spec.ts` (Ready not reached in 60 s) and passed alone in 2.1 s. DEFECT candidate for the owner: one bootstrap at a time makes every document, however small, wait behind a heavy one.
2. A heavy bootstrap under load can exceed the 135 s cap: the first run (load average 13) ended with the server log line "Bootstrapping the room failed … took longer than 135000 ms" at 137 s; the Preparing panel left at 137 s. The Failed card was not captured in that run; the three later runs finished in 80 to 130 s. Not reproduced on demand.
3. The Failed card for a broken DOCX says "Check your connection and try again", which is wrong for a corrupt file: the copy is shared with a lost connection.

## Adversarial review

- [x] Claim 1: no client other than the bootstrap socket can write to an uncommitted room — evidence: security review rounds 1 to 3 at a25fb63b and the re-check at 954e9913: member, reader and agent sockets are refused on an uncommitted room through admitToCommittedRoom and the opposite actor claim; held
- [x] Claim 2: a stale host cannot merge into a later bootstrap — evidence: security re-check at a25fb63b: a committed room refuses bootstrap sockets, an attempt ends with its run, a recycle holds and reposts with a new attempt; the double-seed race is closed; held
- [x] Claim 3: `Failed` and a lost worker never hang the open answer — evidence: security re-check and reviewer delta at a25fb63b: the host is disposed after every outcome before the answer, the server timeout fires before the host watchdog, a crash or stop rejects the job into Failed, Failed is retried after a 30 s cooldown; the room-admission broken-file case shows the Failed card in 1.3 s (tester re-walk eb1ff4f9)

## Coverage honesty

- The SDK host itself is real only in the E2E; unit tests fake the `SuperDocClient`.
- Production memory with a heavy document: the SDK host process held 1.2 GB resident memory in [large-documents](../large-documents/spec.md), and the size gate does not apply to the bootstrap.
