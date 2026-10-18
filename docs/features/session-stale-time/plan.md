# Plan: The session query is fresh for five minutes

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `use-session.ts` (the query), `use-sign-out.ts` (the cache on sign-out).
**Assumptions (decided, owner can override):**
- Five minutes, from the shared minute constant.
- Sign-in and the time zone save keep their own invalidation.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/constants.ts`, `apps/web/src/features/auth/use-session.ts`, `use-session.test.tsx`, `use-sign-out.ts`, `sign-out-flow.test.tsx`, `docs/features/session-stale-time/`, `docs/features/README.md` row, the learning's Revisited line | `developer-sm` |

## Sequencing

One developer: the stale time (1), sign-out (2), the 401 (3, struck), focus and reconnect (4).

## Steps

### G1

- [x] **Step 1:** red tests for the constant and two consumers fetching once; `SESSION_STALE_TIME_MS` and `staleTime`. — evidence: red 2cdc513, green 57bb86c
- [x] **Step 2:** red test that sign-out sets the session to null and invalidates it; `use-sign-out.ts`. — evidence: red b1fe992, green 30affcf
- [x] ~~**Step 3:** red tests for a 401 reading as signed out; `fetchMe` catches `AuthenticationError`.~~ Struck: the server answers 200 with a null user, so the branch was dead; removed in 6d880ed. — evidence: red 2cdc513, green 4e30e72
- [x] **Step 4:** red tests that a focus and a reconnect refetch inside the stale window; `refetchOnWindowFocus` and `refetchOnReconnect` set to `'always'`. — evidence: red e09bc08, green 6d880ed

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | a flow that relied on a refetch at mount now shows a stale user | a page shows the old user after a change the app made without invalidating | add the invalidation at that change, as sign-in and the time zone save do |
| 2 | invalidating right after setting null refetches into a flash of the old user | the account menu shows the old name for a frame | none seen; the cached value is null before the refetch starts |
| 4 | a session that ends with a live socket is noticed late | the page keeps the old user until a focus or five minutes | focus and reconnect refetch the session; see the known gaps in the spec |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
