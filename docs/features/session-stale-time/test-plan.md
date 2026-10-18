# Test plan: The session query is fresh for five minutes

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/auth/use-session.test.tsx::two consumers mounted one after the other ask the server once` — input: two `useSession` consumers mounted in sequence on one client; expected: one `/api/me` request
- [ ] Confirmed it fails for the right reason: `expected 2 to be 1`

## Unit

- [ ] `use-session.test.tsx::the session stays fresh for five minutes` — expected: `SESSION_STALE_TIME_MS` is five minutes
- [ ] `use-session.test.tsx::a 401 reads as a signed out session` — input: `/api/me` answers 401; expected: `user` is `null`, not loading
- [ ] `use-session.test.tsx::a 401 on a refetch replaces the last good user with a signed out session` — input: cached user, invalidate, 401; expected: `user` is `null`
- [ ] `use-session.test.tsx::another failure keeps the query in error and does not read as signed out` — input: 503; expected: query status `error`
- [ ] `sign-out-flow.test.tsx::signing out sets the session to signed out and invalidates it` — expected: cached session `null`, `invalidateQueries` called with the session key
- [ ] `pnpm --filter @superdoc-collab/web exec vitest run src/features/auth src/lib`; expected: green

## E2E (Playwright specs)

- [ ] `e2e/connection-state.spec.ts::the banner reads well at eight widths` — expected: green, the banner stays through every width in the failed state
- [ ] `e2e/auth.spec.ts` sign-out case — expected: green

## Prove it for real — Playwright MCP

- [ ] Sign in, open a document, resize across 1024 px several times; expected: no `/api/me` request after the first within five minutes, no redirect
- [ ] Sign out from the account menu; expected: the sign-in form, and Back shows no page with the old user
- [ ] Remove the session cookie, wait for the next members refresh; expected: the editor shows the failed banner with Sign in, no stale user shown

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

- [ ] Claim 1: a 401 reads as signed out and never as an error — attack: a 401 on a refetch with a user cached; result:
- [ ] Claim 2: sign-out never shows the old user — attack: Back after sign-out; result:
- [ ] Claim 3: nothing relied on a refetch at mount — attack: change the time zone, sign in as another user; result:

## Coverage honesty

- The five-minute window itself is not waited out; the constant is pinned and the stale behaviour is proven by the fetch count.
