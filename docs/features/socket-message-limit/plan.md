# Plan: The socket frame cap allows fast typing and reconnect bursts

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `MAX_SOCKET_MESSAGES_PER_SECOND` and the `ws` layer counter in `attach-collaboration.ts`.
**Assumptions (decided, owner can override):**
- Updates (and everything else) get 1000 frames per second, about four times the 264 measured at 50 keys per second; awareness gets its own 5000 because the provider flushes about three frames per keystroke at each pause (1285 measured). Both stay hard caps.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/constants.ts`, `apps/server/src/collaboration/frame-bucket.ts` and its test, `apps/server/src/collaboration/awareness-client-cap.ts` and its test, `apps/server/src/collaboration/collaboration-server.ts`, `apps/server/src/collaboration/client-declarations.ts` and its test, `apps/server/src/collaboration/socket-message-limit.ts`, `apps/server/src/testing/socket-frames.ts`, `apps/server/src/collaboration/attach-collaboration.test.ts`, `socket-message-limit.test.ts`, `apps/server/src/limits/sliding-window.ts` and its test, `docs/adr/0040-*`, `docs/adr/0034-*` status line, `docs/adr/README.md`, `docs/features/socket-message-limit/`, `docs/features/README.md`, `docs/learnings/`, `.claude/rules/collaboration.md` | `developer-dt` |

## Sequencing

One group, red test first.

## Steps

### G1

- [ ] **Step 1:** red test: a burst of 600 frames in one second is accepted and the socket stays open; commit alone.
- [ ] **Step 1b:** red test: an awareness burst of 3000 frames in one second is accepted, and each bucket's cap plus one closes with 1008; commit alone.
- [ ] **Step 2:** `frameBucketOf`, two windows per socket, the two constants with their ADR pointers; green.
- [ ] **Step 3:** ADR 0040, ADR 0034 status line, the feature folder, the learning, the collaboration rule.
- [ ] **Step 3b:** the limiter's prune drops only the stale prefix: a pin test first (green when it lands, behaviour preserved), then the rewrite.
- [ ] **Step 3c:** the per-connection awareness id cap and the linear declarer: red tests first (overfull connections, a socket claiming cap plus one ids closes with 1008, a 100000-id declare in linear time), then the change.
- [ ] **Step 4:** re-run the driver against a stack of the lane; the log line is gone.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | the breach tests send thousands of frames and run slowly | the breach tests time out | raise their timeout, never the cap |
| 2 | the frame kind is misread, so awareness counts with the updates again | the 3000-frame awareness burst test closes the socket | fix the parse, never the cap |
| 2 | a flooder gets about eight times more frames before the close | none in normal use | set the update cap back to 120 |

**Steps with no backout:** none.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` executed `test-plan.md`.
- [ ] **Reviewer:** a fresh `reviewer` returned a verdict.
- [ ] **Security reviewer:** a fresh `security-reviewer` returned a verdict.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
