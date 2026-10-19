# Test plan: Server bootstrap

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/server/src/history/projection-handler.test.ts::bootstrap` — input: a Bootstrap request; expected: the injected `bootstrapRoom` is called with the document id, file path, url and token, and the reply is a Bootstrap reply — evidence: red 423756c2 (`handleBootstrap is not implemented`), green 56aed11b
- [x] `apps/server/src/collaboration/room-bootstrap.test.ts` — input: `bootstrapRoom` on an uncommitted document; expected: stage Queued then Preparing, the scheduler called once — evidence: red 950dd8de (`RoomBootstrap.request is not implemented`), green f108691b
- [x] Confirmed each fails for the right reason: the stub throws `<name> is not implemented` — evidence: the commit messages above

## Unit

- [x] `room-bootstrap.test.ts::one at a time` — input: two documents queued; expected: the second is Queued until the first settles
- [x] `room-bootstrap.test.ts::failure` — input: the scheduler rejects; expected: Failed, one log line, still Failed on the next progress read, no second start
- [x] `room-bootstrap.test.ts::ready` — input: the commit hook with 1234 bytes; expected: Ready, `done` equal to `total`, `stateBytes` 1234
- [x] `room-bootstrap.test.ts::committed before` — input: a committed document with no job; expected: Ready 0 of 0, `stateBytes` null, no start
- [x] `room-bootstrap.test.ts::stale attempt` — input: `isCurrent` with an attempt from a failed job; expected: false
- [x] `room-tokens.test.ts::attempt` — input: a bootstrap token for another document or an expired one; expected: null; an agent token on the bootstrap path: refused
- [x] `collaboration-server.test.ts` — input: a member socket on an uncommitted room; expected: refused. The bootstrap socket with the current attempt: admitted as the owner with actor Human; a stale attempt: refused; after the commit a bootstrap socket with a stale attempt is closed
- [x] `attach-collaboration.test.ts` — input: an upgrade to the bootstrap path from a non-loopback address; expected: the socket is destroyed
- [x] `documents-routes.test.ts` — input: open of an uncommitted document by owner, editor and reader; expected: 200, `roomMode` Join, `bootstrap` Queued, no ticket fields; of a failed one: stage Failed; the upload and a blank create start one bootstrap each
- [x] `members-routes.test.ts` — expected: no `isAttemptSuperseded` or `isAttemptRestarted`
- [x] Edge: the owner removed before the bootstrap socket connects — expected: refused, stage Failed

## E2E (Playwright specs)

- [x] `e2e/room-admission.spec.ts` — an upload opens as Join for the uploader and for a second editor, with progress until Ready; no browser seeds the room
- [x] `e2e/room-admission.spec.ts` large case — first paragraph visible; the time is recorded below — evidence: Ready 38.9 s after the upload, first paragraph 13.4 s after the page opened, 4 of 4 passed in 2.0 minutes (local, web exports patched for the run)
- [x] `e2e/showcase*.spec.ts` stay green — evidence: `showcase.spec.ts` 1 passed (12.2 s), the only showcase spec

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

- [ ] Claim 1: no client other than the bootstrap socket can write to an uncommitted room — attack: member and agent sockets, a stale token, a token of another document; result: pending
- [ ] Claim 2: a stale host cannot merge into a later bootstrap — attack: replay an old attempt after a restart and after a failure; result: pending
- [ ] Claim 3: `Failed` and a lost worker never hang the open answer — attack: kill the worker mid-bootstrap, corrupt the file; result: pending

## Coverage honesty

- The SDK host itself is real only in the E2E; unit tests fake the `SuperDocClient`.
- Production memory with a heavy document: the SDK host process held 1.2 GB resident memory in [large-documents](../large-documents/spec.md), and the size gate does not apply to the bootstrap.
