# Plan: Test stacks bind loopback

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `loadEnvironment`, `listen` in `apps/server/src/server.ts`, `stackEnvironment` in `e2e/stack.ts`.
**Assumptions (decided, owner can override):**
- The container does not set `HOST`; the compose file and the Dockerfile are untouched.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/server/src/config/environment.ts`, `apps/server/src/config/environment.test.ts`, `apps/server/src/server.ts`, `apps/server/src/server.test.ts`, `apps/server/src/main.ts`, `apps/server/src/testing/test-server.ts`, `e2e/stack.ts`, `.env.example` | lead, inline |

## Sequencing

One group.

## Steps

### G1

- [x] **Step 1:** red `environment.test.ts` cases (host null; `HOST` read).
- [x] **Step 2:** `HOST` in the loader, `listen` with a hostname when set, the log line, loopback in the test stacks and the in-process test servers, the blocker on loopback; tests green.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | the container binds loopback and Traefik cannot reach it | the Docker CI job's health step fails | `HOST` stays unset in the image; the CI docker job pins it |
| 2 | a spec reaches the stack through `localhost` and IPv6 resolves first | a connection refused on `::1` | every URL in the stack goes through `127.0.0.1` already (`localOrigin`) |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** not applicable.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
