# Plan: Readability server

**Spec:** spec.md
**Tier:** 🟢
**Seam:** module boundaries inside `apps/server/src`. Nothing crosses the HTTP, WebSocket or worker-message wire differently.
**Assumptions (decided, owner can override):**
- The server has no copy files, so inline messages become exported constants at the top of the file that throws them.
- A new test is committed before the change it pins; a test green on arrival is a pin.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/server/src/**` except `collaboration/**` | `developer-mo` |

## Sequencing

One developer, one commit per item, in the order of the spec.

## Steps

### G1

- [x] **Step 1:** pin which queue each request kind joins (4367a7b0), then dispatch the worker listener and `handle` from records keyed by request kind.
- [ ] **Step 2:** message constants in `agent-sessions.ts` and `registration-limits.ts`.
- [ ] **Step 3:** `Promise` suffix on seven names.
- [ ] **Step 4:** `SECOND_MS` in the two testing clients.
- [ ] **Step 5:** `temporaryDirectory` under `apps/server/src/testing`.
- [ ] **Step 6:** one retry helper in `versions-routes.ts`.
- [ ] **Step 7:** un-export dead exports.
- [ ] **Step 8:** split `createServices` and `createDocumentsRoutes`.
- [ ] **Step 9:** sweep, fix clear cases, list the rest.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | Reply order changes | the new worker queue test goes red | `git revert` the commit |
| 3 | A rename misses a reference | `pnpm typecheck` fails | `git revert` the commit |
| 7 | An export a test or script imports disappears | the grep before the change, then typecheck | `git revert` the commit |
| 8 | Wiring order changes | route and repository-shape tests go red | `git revert` the commit |

**Steps with no backout:** none.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
