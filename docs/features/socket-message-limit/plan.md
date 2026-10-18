# Plan: The socket frame cap allows fast typing and reconnect bursts

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `MAX_SOCKET_MESSAGES_PER_SECOND` and the `ws` layer counter in `attach-collaboration.ts`.
**Assumptions (decided, owner can override):**
- 1000 frames per second is about eight times the fastest burst measured and still a hard cap.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/constants.ts`, `apps/server/src/collaboration/attach-collaboration.test.ts`, `socket-message-limit.test.ts`, `docs/adr/0040-*`, `docs/adr/0034-*` status line, `docs/adr/README.md`, `docs/features/socket-message-limit/`, `docs/features/README.md`, `docs/learnings/`, `.claude/rules/collaboration.md` | `developer-dt` |

## Sequencing

One group, red test first.

## Steps

### G1

- [ ] **Step 1:** red test: a burst of 600 frames in one second is accepted and the socket stays open; commit alone.
- [ ] **Step 2:** the constant at 1000 with its ADR pointer; green.
- [ ] **Step 3:** ADR 0040, ADR 0034 status line, the feature folder, the learning, the collaboration rule.
- [ ] **Step 4:** re-run the driver against a stack of the lane; the log line is gone.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | the breach tests send 1000 frames and run slowly | the breach tests time out | raise their timeout, never the cap |
| 2 | a flooder gets eight times more frames before the close | none in normal use | set the constant back to 120 |

**Steps with no backout:** none.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` executed `test-plan.md`.
- [ ] **Reviewer:** a fresh `reviewer` returned a verdict.
- [ ] **Security reviewer:** a fresh `security-reviewer` returned a verdict.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
