# Plan: Server bootstrap

**Spec:** spec.md
**Tier:** 🔴
**Seam:** `storeDocument` (start) and the open route (report); the projection worker (do); `collaboration-server` (admit and fence)
**Assumptions (decided, owner can override):**
- Progress is bytes of the upload over the upload size; the SDK offers nothing finer.
- `Failed` is terminal until the server restarts.
- The shared ticket types and the web's uses were deleted in a final sweep once the progress lane merged.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/**`, `docs/**`, `.claude/rules/collaboration.md` | `developer` (lane `server-bootstrap`) |
| G2 | `apps/server/src/**`, `e2e/room-admission.spec.ts` | `developer` (lane `server-bootstrap`) |

## Sequencing

One lane. Docs and ADR first, then red tests, then the worker, the registry, the socket, the routes, and last the removal.

## Steps

### G1

- [x] **Step 1:** spec, plan, test plan, ADR 0048, consequence line in ADR 0033, index rows.
- [x] **Step 2:** `libs/types`: `ApiPath.BootstrapCollaboration`, `BOOTSTRAP_TIMEOUT_MS`, `BOOTSTRAP_PROGRESS_ENTRIES`, `OpenedDocument.bootstrap`; drop the ticket types, constants and members flags. The web build fails on the dropped exports until the web lane deletes its uses.
- [x] **Step 3:** `.claude/rules/collaboration.md` and `docs/features/room-admission/spec.md` facts.

### G2

- [x] **Step 4:** red tests for the worker handler and message, the registry, the token claim, the socket admission, the open answer; stubs that throw.
- [x] **Step 5:** worker: `Bootstrap` request kind, own queue, handler with the SDK, timeout.
- [x] **Step 6:** scheduler: `bootstrap` promise, crash rejects it.
- [x] **Step 7:** room tokens carry the attempt; `/collaboration/bootstrap` upgrade, authentication and context.
- [x] **Step 8:** `RoomBootstrap` registry; `bootstrap-state` reports the commit; runtime exposes `bootstrapRoom`.
- [x] **Step 9:** `storeDocument` starts the bootstrap; the open route answers Join with progress; the members route drops the flags.
- [x] **Step 10:** remove `CreatorReservations`, claimed ticket, reserve, takeover and their tests; adapt the remaining tests.
- [x] **Step 11:** `e2e/room-admission.spec.ts` to the new behaviour; the large case timed.

Steps 12 to 17 were added after the security and review findings on the first build (a takeover of the lane on 2026-10-19). Each has its red commit before its green one.

- [x] **Step 12:** host and queue robustness: the host is disposed after every outcome, before the answer (red 635405f9, green 56cde4e7); the registry waits `BOOTSTRAP_COMMIT_GRACE_MS` for the commit, retries an interrupted run once and starts a Failed one again after a cooldown, and the worker fails fast on `bootstrapApplied: false` (red 5bd3ff96, green 56cde4e7).
- [x] **Step 13:** the write fence: the attempt ends with the run, a committed room refuses bootstrap sockets, the scheduler holds a post made during a recycle (red c681c9a1, green 7557aff7).
- [x] **Step 14:** an open of a document queued or preparing is answered from the registry (red 15a58212, green ccfbda50).
- [x] **Step 15:** the SDK hosts run without the server's secrets and the bootstrap host with a heap cap (red a0092e61, green 8101b0be).
- [x] **Step 16:** a light and a heavy lane with owners in turns (red 7b768c06, green f0d1a69b); the inflated size limit and the owner queue (red bafa0d97, green ef362c60); the upload limit, the queue cap and the 415 answer (red fd0d63df, green 80983260).
- [x] **Step 17:** `e2e/` cases that described the browser creator now describe the server bootstrap, and a new case proves a blank document is ready right after a broken file (c4aa3765).
- [x] **Step 18:** the memory guard: the entrypoint hands the cgroup limit to the server as `MEMORY_LIMIT_MEGABYTES`, and `POST /api/documents` answers 413 with the largest preparable size for a file the container cannot hold (red 494857e2, green a3484165; entrypoint red efbef7cb, green a23a27dc); spec, runbook, install guide and `.env.example` carry the 4 GB measurement and the sizing.
- [x] **Step 19:** every size rule keys on the inflated bytes of `word/document.xml` (`documentXmlBytes`), not on the compressed file: the guard, the lane, the timeout, the estimate and `total`; the ratio is 500 from a completed 8 GB bootstrap (red 936b0aeb, green 735a8a22; ratio red 5a21e9c7, green 9e53a508); a non-JSON 413 shows the upload limit copy.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 5 | The SDK host dies on a large file | Stage `Failed`, log line with the host message | Raise `BOOTSTRAP_TIMEOUT_MS` or cap the upload |
| 7 | The bootstrap path is reachable from outside | Upgrade from a non-loopback address is not destroyed | Revert the path check |
| 8 | Two bootstraps for one document | Two sockets on one uncommitted room | The registry refuses a second start; revert to the browser creator |
| 9 | The web still waits on 409 | Web polls forever on a 200 | Lane merge with the web lane |
| 10 | A race the tickets covered | Duplicated paragraphs after a restart | The attempt fence stays; revert the removal commit |
| 12 | A host outlives its bootstrap | The next bootstrap waits behind a hung host, or memory stays at the heavy peak | Revert the release; the host exits with the worker |
| 15 | The `NODE_OPTIONS` heap cap is ignored by the host binary | The host still grows past the cap on the heavy fixture | The cap is a safety net; the timeout and the lane remain |
| 16 | A legitimate owner is refused by the queue cap or the upload limit | 429 with `Retry-After` on an upload | Raise `UPLOADS_PER_MINUTE`; the queue cap has no switch, revert the route check |

**Steps with no backout:** none. The data format is unchanged; a revert restores the browser creator.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.

## Dead symbols

Deleted on 2026-10-19 after lane-progress merged: every ticket type, query key, close code, members flag, the superseded banner branches and their tests, in `libs/types`, `apps/web` and `apps/server`. `DOCUMENT_NOT_READY_ERROR` stays for agents and the legacy 409 branch of the web, which the integration sweep removes.
