# Test plan: Sign-out commits the sign-in route before the session flips

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/web/src/features/auth/sign-out-flow.test.tsx::a sign-in route that renders slowly still ends on the bare sign-in route` — input: sign-in element busy-renders 10 ms, sign out from `/documents`; expected: no router location with `?next=%2Fdocuments`, final search `''` — evidence: 7f798e83 green, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-flush-walk/unit-auth.log (10 files, 60 tests passed)
- [x] Confirmed it fails for the right reason: `AssertionError: expected [ '', '?next=%2Fdocuments' ] to not include '?next=%2Fdocuments'` at 8efe42b6 — evidence: 8efe42b6 in a throwaway worktree, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-flush-walk/red-8efe42b6.log: 1 failed, 5 passed; text matches exactly

## Unit

- [x] Same test at busy times 0, 5, 30 and 120 ms after the fix; expected: green at each (the committed value is 10 ms) — evidence: 7f798e83, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-flush-walk/busy-times-7f798e83.log: a copy of the flow file with the slow test run at 0, 5, 10, 30, 120 and 500 ms, 11 passed (6 variants + 5 siblings); copy removed with the worktree
- [x] `sign-out-flow.test.tsx::navigates before it clears the cached session` — input: hook signs out with a cached user; expected: the session is the user when the router navigates, `null` afterwards — evidence: 7f798e83, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-flush-walk/unit-auth.log: all 6 flow tests passed
- [x] `sign-out-menu-item.test.tsx::renders as a menu item and still signs out` — expected: navigate called with `/sign-in` and `{ replace: true, state: SIGNED_OUT_STATE, flushSync: true }` — evidence: 7f798e83, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-flush-walk/unit-auth.log: file passed
- [x] `RequireAdmin` covered: it renders the same `Navigate` as `RequireSession` on a null session, so the fix is shared; `require-admin.test.tsx` stays green — evidence: gate log flush-verify-1.log: web unit 118 files, 960 tests passed incl. require-admin.test.tsx; admin walk below ends on bare /sign-in 10 of 10 under throttle

## E2E (Playwright specs)

- [x] `e2e/auth.spec.ts` sign-out case; expected: green — evidence: gate log flush-verify-1.log line 18: auth.spec.ts:68 sign out returns to sign-in and documents is protected again passed; the gate then exited 1 on an unrelated connection-state.spec.ts:172 failure

## Prove it for real — Playwright MCP

- [x] Sign in, open the documents list, sign out under CDP CPU throttle rate 6, ten times; expected: URL never carries `next`, bare `/sign-in` — evidence: b672eb93 build, scripted walk /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-flush-walk/walk.mjs, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-flush-walk/walk-results.json: documents page 10 of 10 at CPU rate 6 plus 1 unthrottled plus 1 at 375, 0 URLs with next, final /sign-in bare; .pr-media/sign-out-flush-sync/sign-out-documents-1280-after.png
- [x] Same from a document page and from an admin page; expected: the same — evidence: b672eb93, document 10 of 10 and admin 10 of 10 at rate 6 plus baselines, 0 URLs with next; .pr-media/sign-out-flush-sync/sign-out-document-1280-after.png, .pr-media/sign-out-flush-sync/sign-out-admin-1280-after.png, .pr-media/sign-out-flush-sync/sign-out-document-375-after.png
- [x] Console and network clean, other than the expected `/api/me` read — evidence: walk-results.json: 35 runs, 0 console errors, 0 responses with status 400 or above

## Edge cases found during execution

- [x] Back after signing out from a document or an admin page lands on `/sign-in?next=%2Fdocuments` (22 of 22 runs); from the documents page it stays on bare `/sign-in` (12 of 12). Sign-in form shown every time. Outcome: expected, not a defect. Back leaves the replaced entry for the earlier `/documents` entry, where `RequireSession` correctly redirects a signed-out visitor with `next`. The race is about the sign-out transition, not a later user-driven Back. — evidence: /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-flush-walk/walk-results.json
- [x] Sign-out URL trail on every run is `/sign-in` then `/sign-in` (the state marker clear); never `/documents` after the click. — evidence: walk-results.json afterUrls
- Coverage gap: the walk ran only against the fixed build; no browser-level red control was built, so the throttle walk proves absence of the symptom, not that it can reproduce it. The unit red at 8efe42b6 is the red evidence.

## Adversarial review

- [x] Claim 1: the route commits before the cache flips at any sign-in render time — attack: raise the busy time to 500 ms — evidence: busy-times-7f798e83.log includes 500 ms, green
- [x] Claim 2a: the dom `RouterProvider` changes nothing else — attack: run `app/router.test.tsx` — evidence: gate log flush-verify-1.log, web unit 118 files, 960 tests passed (not rerun in the lane under the lock rule)
- [ ] Claim 2b: scroll restoration on a route change — BLOCKED: the app has no ScrollRestoration usage (grep in apps/web/src finds none), so there is nothing to walk

## Coverage honesty

- The unit test spins the render on the clock, so its red depends on the transition yielding after 5 ms; the throttled walk covers the real browser.
