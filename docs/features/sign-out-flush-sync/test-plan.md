# Test plan: Sign-out commits the sign-in route before the session flips

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/auth/sign-out-flow.test.tsx::a sign-in route that renders slowly still ends on the bare sign-in route` — input: sign-in element busy-renders 10 ms, sign out from `/documents`; expected: no router location with `?next=%2Fdocuments`, final search `''`
- [ ] Confirmed it fails for the right reason: `AssertionError: expected [ '', '?next=%2Fdocuments' ] to not include '?next=%2Fdocuments'` at 8efe42b6

## Unit

- [ ] Same test at busy times 0, 5, 30 and 120 ms after the fix; expected: green at each (the committed value is 10 ms)
- [ ] `sign-out-flow.test.tsx::navigates before it clears the cached session` — input: hook signs out with a cached user; expected: the session is the user when the router navigates, `null` afterwards
- [ ] `sign-out-menu-item.test.tsx::renders as a menu item and still signs out` — expected: navigate called with `/sign-in` and `{ replace: true, state: SIGNED_OUT_STATE, flushSync: true }`
- [ ] `RequireAdmin` covered: it renders the same `Navigate` as `RequireSession` on a null session, so the fix is shared; `require-admin.test.tsx` stays green

## E2E (Playwright specs)

- [ ] `e2e/auth.spec.ts` sign-out case; expected: green

## Prove it for real — Playwright MCP

- [ ] Sign in, open the documents list, sign out under CDP CPU throttle rate 6, ten times; expected: URL never carries `next`, bare `/sign-in`
- [ ] Same from a document page and from an admin page; expected: the same
- [ ] Console and network clean, other than the expected `/api/me` read

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [ ] Claim 1: the route commits before the cache flips at any sign-in render time — attack: raise the busy time to 500 ms
- [ ] Claim 2: the dom `RouterProvider` changes nothing else — attack: run `app/router.test.tsx` and scroll restoration on a route change

## Coverage honesty

- The unit test spins the render on the clock, so its red depends on the transition yielding after 5 ms; the throttled walk covers the real browser.
