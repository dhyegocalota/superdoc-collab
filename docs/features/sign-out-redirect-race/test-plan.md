# Test plan: Sign-out leaves the page before it clears the session

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/auth/sign-out-flow.test.tsx::signing out leaves the page before the cached session flips, so no sign-in redirect with next can start` — input: the hook signs out with a cached user; expected: the cached session is the user at the moment of navigation, `null` afterwards
- [ ] Confirmed it fails for the right reason: `expected [ null ] to deeply equal [ { id: 'user-1', ... } ]`

## Unit

- [ ] `sign-out-flow.test.tsx::signing out lands on the bare sign-in route and stays there` — expected: pathname `/sign-in`, empty search, marker dropped
- [ ] `sign-out-flow.test.tsx::signing out sets the session to signed out and invalidates it` — expected: cached `null`, invalidation called
- [ ] `pnpm --filter @superdoc-collab/web exec vitest run src/features/auth`; expected: green

## E2E (Playwright specs)

- [ ] `e2e/auth.spec.ts` sign-out case — expected: green

## Prove it for real — Playwright MCP

- [ ] Sign in, open the documents list, sign out from the account menu; expected: the URL is `/sign-in` with no `next`, the form shows, Back does not show the old page's user
- [ ] Sign out while on a document page; expected: the same, no `next=%2Fdocuments%2F...` at any point in the history

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

- [ ] Claim 1: no history entry carries `next` during sign-out — attack: inspect `history.length` and every entry after sign-out; result:
- [ ] Claim 2: a failed sign-out never leaves the reader on a sign-in form while signed in — attack: abort, then answer 500 to the sign-out request; result:

## Coverage honesty

- The race window itself is timing-dependent; the test pins the order of operations instead of the URL race.
