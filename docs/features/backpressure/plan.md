# Plan: Backpressure

**Spec:** spec.md
**Tier:** 🔴
**Seam:** the bootstrap registry, the room memory counter, the documents routes, the collaboration server's authentication hook, the open-progress panel.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/documents.ts`, `apps/server/src/collaboration/room-bootstrap*`, `apps/server/src/collaboration/room-memory-release*`, `apps/server/src/collaboration/heavy-room-admission*`, `apps/server/src/limits/owner-round-robin-queue*`, `apps/server/src/documents/documents-routes*`, `apps/server/src/config/environment*`, `apps/server/src/collaboration/collaboration-server*`, `apps/server/src/collaboration/collaboration-runtime.ts`, `apps/server/src/server.ts`, `apps/server/src/http/app.ts`, `apps/server/src/testing/test-server.ts` | `developer` |
| G2 | `apps/web/src/features/open-progress/*`, `apps/web/src/features/documents/documents-api.ts`, `apps/web/src/features/editor/{editor-api,waiting-for-document,document-page}*`, `apps/web/src/lib/api.ts` | `developer` |
| G3 | `e2e/backpressure.spec.ts`, `e2e/restartable-stack.ts`, `docs/features/backpressure/*`, `docs/features/README.md`, `.claude/rules/collaboration.md` | `developer` |

## Steps

- [x] **Step 1:** the feature folder and its index row.
- [x] **Step 2:** red tests, then the queue turn order, the position and wait on a Queued answer and the predicted wait in the registry.
- [x] **Step 3:** red tests, then the 503 for a heavy upload above the ceiling, the environment variable and the constants.
- [x] **Step 4:** red tests, then the heavy room counter, the admission, the open route and the socket refusal.
- [x] **Step 5:** red tests, then the panel's queue line, the dialog message and the waiting page refusal.
- [x] **Step 6:** the E2E on a stack with the limits scripted low.
- [x] **Step 7:** reviewer round 1: red tests, then the heap budget with reservations in place of the count, the upload headroom, the cached XML size and `SERVER_HEAP_MEGABYTES` in the entrypoint; the constants measured on the capped repro.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | The standing is wrong after a retry or a forget | a Queued answer with a stale position | revert the answer; the panel falls back to "Waiting for its turn" |
| 3 | Honest uploads are refused | 503 on a short lane | raise `MAX_BOOTSTRAP_WAIT_MS` |
| 4 | A user's own room is refused | 503 on a document the user holds open | the loaded-room check; raise `ROOM_HEAP_BUDGET_MEGABYTES` |
| 5 | A proxy 503 shows an upload sentence | the dialog reads the 10 MB limit | none needed, the fallback is the existing one |

**Steps with no backout:** none

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** screenshots and video recorded and uploaded.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
