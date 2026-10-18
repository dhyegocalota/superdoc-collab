# Test plan: Sign-out leaves the page before it clears the session

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/web/src/features/auth/sign-out-flow.test.tsx::signing out leaves the page before the cached session flips, so no sign-in redirect with next can start` — input: the hook signs out with a cached user; expected: the cached session is the user at the moment of navigation, `null` afterwards — evidence: red e79cf460 run in a throwaway worktree, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-red.log (1 failed, 4 passed); green at 932d33e8, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-unit-green.log
- [x] Confirmed it fails for the right reason: `expected [ null ] to deeply equal [ { id: 'user-1', ... } ]` — evidence: /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-red.log line 17: `AssertionError: expected [ null ] to deeply equal [ { id: 'user-1', name: 'Ada', …(3) } ]`

## Unit

- [x] `sign-out-flow.test.tsx::signing out lands on the bare sign-in route and stays there` — expected: pathname `/sign-in`, empty search, marker dropped — evidence: 932d33e8, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-unit-green.log (59/59 in src/features/auth)
- [x] `sign-out-flow.test.tsx::signing out sets the session to signed out and invalidates it` — expected: cached `null`, invalidation called — evidence: 932d33e8, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-unit-green.log (59/59 in src/features/auth)
- [x] `pnpm --filter @superdoc-collab/web exec vitest run src/features/auth`; expected: green — evidence: 932d33e8, run as the package test:unit script with filter features/auth: 10 files, 59 tests, exit 0, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-unit-green.log

## E2E (Playwright specs)

- [x] `e2e/auth.spec.ts` sign-out case — expected: green — evidence: gate log /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-verify-1.log, `auth.spec.ts:68 sign out returns to sign-in and documents is protected again` passed, 99 passed 2 skipped, `verify: 8 gates green at 932d33e8`; not rerun in the lane

## Prove it for real — Playwright MCP

- [x] Sign in, open the documents list, sign out from the account menu; expected: the URL is `/sign-in` with no `next`, the form shows, Back does not show the old page's user — evidence: scripted walk (Chromium, no MCP) /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-walk-final.log and /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-walk/walk.mjs; framenavigated recorded `/sign-in`,`/sign-in` only, final URL `/sign-in`, form shown, account menu gone, Back stays on `/sign-in`; screenshots .pr-media/sign-out-redirect-race/documents-before-1280.png, .pr-media/sign-out-redirect-race/documents-after-1280.png, .pr-media/sign-out-redirect-race/documents-before-375.png, .pr-media/sign-out-redirect-race/documents-after-375.png
- [x] Sign out while on a document page; expected: the same, no `next=%2Fdocuments%2F...` at any point in the history — evidence: same walk on `/documents/<id>`; no URL with `next` during sign-out (also 375 and 5 runs under CPU throttle rate 4 for list and document, 10/10 clean); .pr-media/sign-out-redirect-race/document-before-1280.png, .pr-media/sign-out-redirect-race/document-after-1280.png, .pr-media/sign-out-redirect-race/document-before-375.png, .pr-media/sign-out-redirect-race/document-after-375.png. Back from the document page returns to `/documents`, which RequireSession sends to `/sign-in?next=%2Fdocuments` with the form and no user: expected, see Edge cases

## Edge cases found during execution

- [x] Second tab sharing the storage state, left open on `/documents` before the sign-out; after it, a bubbling `visibilitychange` on the second tab refetches `/api/me` and redirects it to sign-in — evidence: /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-walk-final.log (first attempt used a non-bubbling event, which the query library's window listener never sees: walk script error, not a defect); .pr-media/sign-out-redirect-race/second-tab-1280.png
- [x] Back after signing out from a document page lands on `/documents`, then `/sign-in?next=%2Fdocuments` with the form and no user — outcome: expected, it is the protected-route redirect for the page being returned to, not a race; no regression test needed — evidence: walk log, 'document page' lines
- [x] Five sign-outs from the list and five from a document under CDP CPU throttle rate 4 — expected: no `next`, bare `/sign-in` — evidence: 10/10 passed, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-walk-final.log

## Adversarial review

- [x] Claim 1: no history entry carries `next` during sign-out — attack: inspect `history.length` and every entry after sign-out; result: held. history.length is unchanged by sign-out (3->3 from the list, 4->4 from a document: replace); framenavigated during sign-out never carried `next` in 22 runs (/private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-walk-final.log). `next` appears only after Back to the pre-sign-out entry.
- [x] Claim 2: a failed sign-out never leaves the reader on a sign-in form while signed in — attack: abort, then answer 500 to the sign-out request; result: held. Request aborted: URL stays `/documents`, account menu still shown. Request answered 500: the hook carries on, passes through sign-in and returns to `/documents`, still signed in; after the abort a reload still shows the signed-in user (/private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/signout-walk-final.log)

## Coverage honesty

- The race window itself is timing-dependent; the order pin does not prove the URL, and the reorder alone does not close the race when the sign-in render is slow. The `sign-out-flush-sync` lane closes it and carries the slow-render test.
