# Plan: Server bootstrap

**Spec:** spec.md
**Tier:** 🔴
**Seam:** `storeDocument` (start) and the open route (report); the projection worker (do); `collaboration-server` (admit and fence)
**Assumptions (decided, owner can override):**
- Progress is bytes of the upload over the upload size; the SDK offers nothing finer.
- `Failed` is terminal until the server restarts.
- Ticket types shared with the web (`CreatorTicket`, close reasons, the two members flags) are removed from `libs/types` here; the web lane deletes its uses at merge.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/**`, `docs/**`, `.claude/rules/collaboration.md` | `developer` (lane `server-bootstrap`) |
| G2 | `apps/server/src/**`, `e2e/room-admission.spec.ts` | `developer` (lane `server-bootstrap`) |

## Sequencing

One lane. Docs and ADR first, then red tests, then the worker, the registry, the socket, the routes, and last the removal.

## Steps

### G1

- [ ] **Step 1:** spec, plan, test plan, ADR 0048, consequence line in ADR 0033, index rows.
- [ ] **Step 2:** `libs/types`: `ApiPath.BootstrapCollaboration`, `BOOTSTRAP_TIMEOUT_MS`, `BOOTSTRAP_PROGRESS_ENTRIES`, `OpenedDocument.bootstrap`; drop the ticket types, constants and members flags.
- [ ] **Step 3:** `.claude/rules/collaboration.md` and `docs/features/room-admission/spec.md` facts.

### G2

- [ ] **Step 4:** red tests for the worker handler and message, the registry, the token claim, the socket admission, the open answer; stubs that throw.
- [ ] **Step 5:** worker: `Bootstrap` request kind, own queue, handler with the SDK, timeout.
- [ ] **Step 6:** scheduler: `bootstrap` promise, crash rejects it.
- [ ] **Step 7:** room tokens carry the attempt; `/collaboration/bootstrap` upgrade, authentication and context.
- [ ] **Step 8:** `RoomBootstrap` registry; `bootstrap-state` reports the commit; runtime exposes `bootstrapRoom`.
- [ ] **Step 9:** `storeDocument` starts the bootstrap; the open route answers Join with progress; the members route drops the flags.
- [ ] **Step 10:** remove `CreatorReservations`, claimed ticket, reserve, takeover and their tests; adapt the remaining tests.
- [ ] **Step 11:** `e2e/room-admission.spec.ts` to the new behaviour; the large case timed.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 5 | The SDK host dies on a large file | Stage `Failed`, log line with the host message | Raise `BOOTSTRAP_TIMEOUT_MS` or cap the upload |
| 7 | The bootstrap path is reachable from outside | Upgrade from a non-loopback address is not destroyed | Revert the path check |
| 8 | Two bootstraps for one document | Two sockets on one uncommitted room | The registry refuses a second start; revert to the browser creator |
| 9 | The web still waits on 409 | Web polls forever on a 200 | Lane merge with the web lane |
| 10 | A race the tickets covered | Duplicated paragraphs after a restart | The attempt fence stays; revert the removal commit |

**Steps with no backout:** none. The data format is unchanged; a revert restores the browser creator.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
