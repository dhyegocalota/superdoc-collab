# Plan: AI presence avatar

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `AgentSessions` records activity; the members route joins it with membership; `Members` renders the list after the humans.
**Assumptions (decided, owner can override):**
- The linger is 60 s after the last tool call ends and is configurable through `AGENT_PRESENCE_LINGER_MS` for the E2E stack.
- The payload field is `agents`, sibling of `members`, so a later `visitors` list sits beside it.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/{constants,documents,agent,author-colors}.ts`, `apps/server/src/agent/agent-sessions.ts`, `apps/server/src/collaboration/collaboration-runtime.ts`, members handler in `apps/server/src/documents/documents-routes.ts`, `apps/server/src/config/environment.ts`, `apps/server/src/server.ts` | `developer` |
| G2 | `apps/web/src/features/editor/{members,members-copy,use-members}.ts(x)`, `e2e/agent.spec.ts`, `e2e/stack.ts` | `developer` |

## Sequencing

G1 first (the payload), then G2 (the row and the E2E).

## Steps

### G1

- [ ] **Step 1:** `AgentSessions` reports the users whose AI is present on a document (running, or finished less than the linger ago); failing test first.
- [ ] **Step 2:** `onlineUserIds` ignores agent sockets; failing test first.
- [ ] **Step 3:** the members route returns `agents`; failing test first.
- [ ] **Step 4:** `AGENT_PRESENCE_LINGER_MS` is read from the environment and passed to `AgentSessions`.

### G2

- [ ] **Step 5:** `Members` renders the agents after the humans, not jumpable, keyed by the agent author key; failing test first.
- [ ] **Step 6:** `use-members` exposes `agents`; the header passes them (minimal additive edit to `document-page.tsx` and `editor-header.tsx`).
- [ ] **Step 7:** E2E in `e2e/agent.spec.ts`: the AI avatar appears beside the owner and disappears after the linger; `e2e/stack.ts` shortens the linger.
- [ ] **Step 8:** README, rules and install guide facts updated.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | Activity map grows without bound | A long-lived server holds one entry per person and document | Entries are deleted when read past the linger |
| 2 | An agent-only connection list leaves the owner offline while a human tab is open | `isCurrentUserOnline` false for an open tab | Revert the actor filter |
| 3 | An AI of a removed member is listed | Agent avatar of a revoked person | Filter agents by current membership |
| 5 | Key collision with the human | React duplicate-key warning in the owner's page | Key by the agent author key |
| 7 | Linger sleeps in E2E | A fixed wait in the spec | Poll with expect, never a sleep |

**Steps with no backout:** none

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** screenshots and video recorded and uploaded (only if UI was touched).
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
