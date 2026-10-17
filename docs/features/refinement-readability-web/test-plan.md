# Test plan: web readability (lane C2)

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

Nothing visible may change, so this plan proves three things: each new helper failed before it existed, each move kept its pinning test green before and after, and the proof suites of the two splits did not change.

## The failing test first

Each red commit precedes its implementation commit in `git log --oneline main..HEAD`. Run the named test at the red commit (`git stash; git checkout <red>; cd apps/web && npx vitest run <path>`) and record the failure line.

- [x] `libs/types/src/text.test.ts::presentOrNull reads a missing search parameter as null` — input: `presentOrNull(new URLSearchParams().get('term'))`; expected at red: `pnpm --filter @superdoc-history/types typecheck` fails with TS2345 (`string | null` not assignable to `string | undefined`); green: `null`. — evidence: red fe93133 (TS2345 `string | null` not assignable to `string | undefined`), green d6fdb58
- [x] `apps/web/src/features/timeline/max-band-volume.test.ts::the largest band volume, or zero without bands` — input: bands of volume 7 and 9, then no bands; expected at red: `expected 0 to be 9`; green: `9`, then `0`. — evidence: red c650b10 (`expected +0 to be 9`), green cab93ec
- [x] `apps/web/src/features/timeline/author-of.test.ts::author names follow the keys and join with a comma` — input: keys `['bruno', 'ana']`; expected at red: `expected '' to be 'Bruno, Ana'`; green: `'Bruno, Ana'`. — evidence: red c650b10 (`expected '' to be 'Bruno, Ana'`), green cab93ec
- [x] `apps/web/src/lib/api.test.ts::readJson names the subject and the status of a failed response` — input: a 403 response, subject `Members request`; expected at red: an assertion failure, because the stub rejects with a `SyntaxError` from the empty body instead of the expected `ApiRequestError`; green: rejects with `ApiRequestError('Members request failed with status 403')`. — evidence: red 172a332 (`expected SyntaxError: Unexpected end of JSON input to deeply equal Error: Members request failed with status…`), green fd95348; the class is pinned too since a433ad9
- [x] `apps/web/src/features/documents/document-query-keys.test.ts::a document key nests its segments under the documents key` — input: `segments: [DocumentResource.Members]`; expected at red: `expected [] to deeply equal [ 'documents', 'doc-1', 'members' ]`; green: equal. — evidence: red fdbfeca (`expected [] to deeply equal [ 'documents', 'doc-1', 'members' ]`), green 5b323e1
- [x] `apps/web/src/lib/api.test.ts::polling continues at its interval until the document is gone` — input: interval 5000 with no error, an `ApiRequestError`, a `DocumentUnavailableError`; expected at red: `expected false to be 5000`; green: `5000`, `5000`, `false`. — evidence: red 97386f6 (`expected false to be 5000`), green dcacac3
- [x] `apps/web/src/lib/use-reset-after-retry.test.ts::a retry-later error resets once its wait is over` — input: `RetryLaterError` with 3000 ms, fake timers; expected at red: reset called 0 times after 3000 ms; green: 0 times at 2999 ms, once at 3000 ms. — evidence: red ab16839 (`expected "vi.fn()" to be called 1 times, but got 0 times`), green 3f032ff
- [x] `apps/web/src/features/timeline/timeline-api.test.ts::a summary requested too soon carries the wait from Retry-After` — input: 429 with `Retry-After: 12`; expected at red: the error carries `retryAfterSeconds: 12` and no `retryAfterMs`; green: `retryAfterMs: 12000`. — evidence: red ab16839 (`expected Error … { retryAfterSeconds: … } to match object`), green 3f032ff
- [x] `apps/web/src/lib/use-window-message.test.ts::a window message reaches the latest handler and none after unmount` — input: handler swapped once, one message, unmount, one message; expected at red: second handler called 0 times; green: first 0, second 1, still 1 after unmount. — evidence: red 2246958 (`expected "vi.fn()" to be called 1 times, but got 0 times`), green 897720d
- [x] `apps/web/src/lib/use-escape-key.test.ts::Escape calls the latest handler while enabled` — input: handler swapped once, Escape on `document.body`; expected at red: 0 calls; green: first 0, second 1. — evidence: red 2246958 (`expected "vi.fn()" to be called 1 times, but got 0 times`), green 897720d
- [x] `apps/web/src/features/timeline/bin-containing.test.ts::a time inside a bin finds that bin and its index` — input: a time inside and at the start of the second bin; expected at red: `expected null to deeply equal { index: 1, … }`; green: `{ index: 1, bin }` both times. — evidence: red d2f3028 (`expected null to deeply equal { index: 1, bin: { …(3) } }`), green 40ca285
- [x] `apps/web/src/features/timeline/use-bin-selection.test.ts::selecting a bin with a version travels to it, a bin without one only selects it` — input: `selectIndex(0)` then `selectIndex(2)` (bin 2 has version 7); expected at red: `expected null to be 0`; green: index 0 without travel, then index 2 and `onTravel(bins[2].start)`. — evidence: red e2233ef (`expected null to be +0`, `expected null to be 1`, spy 0 times), green af6a539
- [x] `apps/web/src/features/editor/superdoc-options.test.ts::the options open the file in its room as the signed-in user at the viewport zoom` — input: a Join room, viewing mode, the session user; expected at red: `expected {} to deeply equal { selector: …`; green: the full object with `serverUrl: 'ws://localhost:3000/collaboration/doc-1'` and `zoom: { mode: 'manual' }`. — evidence: red 4f7f2f3 (`expected {} to deeply equal { selector: <div></div>, …(5) }`), green 1cbf6df
- [x] `apps/web/src/components/error-message.test.tsx::an error message is announced as an alert` — input: a message as children; expected at red: no element with role `alert`; green: one alert with the text. — evidence: red 37a353b (`Unable to find an accessible element with the role "alert"`), green 8fd1a34
- [x] `apps/web/src/features/auth/auth-card.test.tsx::a root error is announced as an alert` — input: a form whose root error is set on mount; expected at red: no element with role `alert`; green: one alert reading the root error. — evidence: red b44df94 (`Unable to find role="alert"`), green a0bc370
- [x] Confirmed every red fails for the right reason: each failure above is an assertion message, never `Cannot find module` or `is not a function` (the inert stubs listed in each task make sure of it). — evidence: each red above rerun at its red commit in a scratch worktree; all fail on an assertion, none on a missing module or function. Task 13's red included

## Pinning tests (green before and after their change)

Each is committed alone, before the commit it pins. Evidence: the pin commit hash, then a green run at the following implementation commit.

- [x] `sign-in-page.test.tsx::a 429 says how many seconds to wait` — input: the sign-in client answers 429 with `X-Retry-After: 30`; expected: the alert reads `Too many attempts. Try again in 30 seconds.`, before and after Task 1's rename and Task 15's card. — evidence: pin fc4358e 7 passed; 74ac4dd (Task 1) 7 passed; a0bc370 (Task 15) 7 passed
- [x] `streamgraph.test.tsx::$key without a selection selects bin $expected` — input: no selected bin, keys ArrowRight, ArrowLeft, Home, End on a three-bin chart; expected: `onSelectIndex` last called with 0, 2, 0, 2, before and after Task 4. — evidence: pin 8001997 29 passed; 8518ca4 (Task 4) 29 passed
- [x] `streamgraph.test.tsx::another key selects nothing` — input: key `a` with bin 1 selected; expected: `onSelectIndex` never called. — evidence: pin 8001997 29 passed; 8518ca4 (Task 4) 29 passed
- [x] `streamgraph-layout.test.ts::label positions stay where they are for a crowded chart` — input: five bands over 40 bins at 480 px; expected: the inline snapshot written before Task 5 (at least one `null` label, at least two placed) still matches after it. — evidence: pin 681fdfb 5 passed; 89124ff (Task 5) 5 passed
- [x] `document-query-keys.test.ts::every document key keeps its value` — input: each of the ten builders with fixed arguments; expected: the literal arrays listed in the test, before and after Task 7. — evidence: pin c21f651 2 passed; 5b323e1 (Task 7) 3 passed
- [x] `document-query-keys.test.ts::the timeline prefix reaches the timeline and its bin edits, and the documents prefix never reaches the file` — input: six cached keys; expected: the timeline prefix finds exactly the timeline and bin-edits keys; the `['documents']` prefix does not find the file key. — evidence: pin c21f651 2 passed; 5b323e1 (Task 7) 3 passed
- [x] `sign-up-page.test.tsx::sign-up asks for a name, an email and a new password and links to sign-in` — input: the sign-up page; expected: the heading, `autocomplete="name"`, `type="email"`, `autocomplete="new-password"`, and a link to `/sign-in`, before and after Task 15. — evidence: pin ec382a5 2 passed; a0bc370 (Task 15) 2 passed
- [x] `sign-up-page.test.tsx::sign-up sends the three fields once` — input: Ada, ada@example.com, a long password; expected: one call with exactly those three fields. — evidence: pin ec382a5 2 passed; a0bc370 (Task 15) 2 passed
- [x] `upload-dialog.test.tsx::a server failure shows its status and a rejected file afterwards shows only the rejection` — input: a valid file answered 500, then a pdf; expected: first alert `Upload failed with status 500`, then exactly one alert reading `NOT_A_DOCX_MESSAGE`, before and after Task 16. — evidence: pin d77e1d4 6 passed; c995653 (Task 16) 6 passed. Since 0837b41 it expects `requestFailedMessage({ subject: UPLOAD_SUBJECT, status: 500 })`, which reads `Upload failed with status 500.` with the approved period

## Unit

- [x] `api.test.ts::readJson returns the body of a successful response` — input: a 200 with `{ members: [] }`; expected: resolves to `{ members: [] }`. — evidence: web suite 306 passed at 2c8f32c, with typecheck and format:check clean
- [x] `api.test.ts::assertOk lets a successful response through and refuses a failed one` — input: 204, then 500 with subject `Members request`; expected: no throw, then `Members request failed with status 500`. — evidence: web suite 306 passed at 2c8f32c, with typecheck and format:check clean
- [x] `api.test.ts::a 404 means the document is unavailable` — input: 404, then 403; expected: `DocumentUnavailableError(DOCUMENT_UNAVAILABLE_MESSAGE)`, then no throw. — evidence: web suite 306 passed at 2c8f32c, with typecheck and format:check clean
- [x] `author-of.test.ts::an unknown author key throws instead of printing nothing` — input: key `carla` not in the authors; expected: throws. — evidence: web suite 306 passed at 2c8f32c, with typecheck and format:check clean
- [x] `use-reset-after-retry.test.ts::any other error, or none, never resets` — input: an `ApiRequestError`, then `null`, 3000 ms later; expected: reset never called. — evidence: web suite 306 passed at 2c8f32c, with typecheck and format:check clean
- [x] `use-reset-after-retry.test.ts::unmounting before the wait cancels the reset` — input: unmount, then 3000 ms; expected: reset never called. — evidence: web suite 306 passed at 2c8f32c, with typecheck and format:check clean
- [x] `use-escape-key.test.ts::a disabled hook, another key and a handled Escape do nothing` — input: Escape while disabled, Enter while enabled, an Escape with `defaultPrevented`; expected: 0 calls. — evidence: web suite 306 passed at 2c8f32c, with typecheck and format:check clean
- [x] `use-escape-key.test.ts::an Escape stopped before it reaches the document does nothing` — input: an inner element that stops propagation, Escape on it; expected: 0 calls. — evidence: web suite 306 passed at 2c8f32c, with typecheck and format:check clean
- [x] `bin-containing.test.ts::a time outside every bin, no time or no timeline finds nothing` — input: one millisecond before the first bin, exactly the end of the last bin, `null`, no timeline; expected: `null` four times. — evidence: web suite 306 passed at 2c8f32c, with typecheck and format:check clean
- [x] `use-bin-selection.test.ts::the selection starts at the moment in the URL and follows it` — input: `at` inside bin 1, then `null`; expected: index 1 and bin 1, then `null` and `null`. — evidence: web suite 306 passed at 2c8f32c, with typecheck and format:check clean
- [x] `use-bin-selection.test.ts::clearing the selection goes back to live` — input: `clearSelection()` with bin 1 selected; expected: index `null`, `onBackToLive` once. — evidence: web suite 306 passed at 2c8f32c, with typecheck and format:check clean
- [x] `error-message.test.tsx::an inset error message is still one alert with its text` — input: `className="p-4"`; expected: exactly one alert with the text. — evidence: web suite 306 passed at 2c8f32c, with typecheck and format:check clean
- [x] `auth-card.test.tsx::the card titles the form, labels its field, submits its values and links onward` — input: type `ada@example.com`, submit; expected: title, description, an email-typed field labelled Email, a link to `/sign-up`, and `onSubmit` called once with `{ email: 'ada@example.com' }`. — evidence: web suite 306 passed at 2c8f32c, with typecheck and format:check clean
- [x] `auth-card.test.tsx::while submitting the button shows the pending label and is disabled` — input: a submit that never resolves; expected: a disabled button named `Signing in…`. — evidence: web suite 306 passed at 2c8f32c, with typecheck and format:check clean

## The proof suites stay unchanged

- [x] `git diff main..HEAD --stat -- apps/web/src/features/versions/time-travel.test.tsx apps/web/src/features/timeline/timeline-panel.test.tsx apps/web/src/features/editor/document-page.test.tsx` shows only Task 17's `jsonResponse` hunks; `git diff <Task 16 commit> --stat` before Task 17 shows none of the three. — evidence: against the C2 base 2a39004 (lane A merged; lane A is not on `main` yet) every hunk in the three files is a `jsonResponse` change from 2146fda; `git diff 2a39004 c995653 --stat` on them is empty
- [x] At the Task 11 commit, `cd apps/web && npx vitest run src/features/versions/time-travel.test.tsx` passes with the same test count as on `main`. — evidence: 40ca285: 23 passed, the same 23 as on the hooks lane's base 2efd828. 2a39004 has 21, after `main`'s a1acca3 folded two cases
- [x] At the Task 12 commit, `cd apps/web && npx vitest run src/features/timeline/timeline-panel.test.tsx` passes with the same test count as on `main`. — evidence: af6a539: 41 passed, the same 41 as on 2efd828 and 2a39004
- [x] At the Task 10 and Task 11 commits, `version-view-page.test.tsx` passes with only Task 1's import change in its diff (Task 13 later changes one more import path, for `DocumentMode`). — evidence: 897720d 10 passed, 40ca285 10 passed; no C2 commit other than 74ac4dd touches `version-view-page.test.tsx`
- [x] At the Task 6 commit, `redirect-if-session.test.tsx` and `sign-out-flow.test.tsx` pass, and their diff is only the `vi.mock('@/lib/api', …)` line switched to the partial `importOriginal` form. — evidence: fd95348: web 290 passed; both files changed by one line each, the `vi.mock` factory
- [x] `cd apps/web && npx vitest run` total at Task 18 = total on `main` + the new tests listed above (count them; record both numbers). — evidence: 273 on `main` (176c0a9), 313 at 84236ec; +40 = 38 new tests − 1 folded + 3 more `test.each` cases

## E2E (Playwright specs)

No spec changes in this lane, so the whole suite is the regression net.

- [ ] `pnpm test:e2e` — steps: the full suite, including `auth.spec.ts`, `documents.spec.ts`, `timeline.spec.ts`, `time-travel.spec.ts`, `selection-summary.spec.ts`, `collaboration.spec.ts`; expected: every spec passes, same count as on `main`.
- [x] `git diff main..HEAD --stat -- e2e` — expected: empty. — evidence: empty against `main` 176c0a9 after the merge aff1805

## Prove it for real — Playwright MCP

Two viewports: 1280×800 and 375×812. Compare each screenshot with the same screen on `main` (lane A merged): nothing may differ.

- [ ] Happy path, entry to exit: sign up a new user, upload `media-seed.docx`, type a sentence, open the timeline, click a bin with a version, press Escape, click Download; expected: the sign-up card, the documents list, the editor, the chart and the version banner look as on `main`; Escape returns to live; the download starts. — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof
- [ ] Empty: a new blank document; expected: the panel says there are no edits yet, Regroup topics is disabled with its reason, no Top edits heading. — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof
- [ ] Single: one edit by one author; expected: one band, its tooltip on hover reads the band name, the count and the author. — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof
- [ ] Many: two authors editing for several minutes; expected: avatars in the same order as on `main` (largest contributor first, ties by author key). — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof
- [ ] Rejected input: sign in with a wrong password; expected: the alert reads `AUTH_ERROR_MESSAGE` under the password field, nothing else changes. Upload a `.pdf`; expected: exactly one alert with the docx-only message. — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof
- [ ] Rate limit: press Regroup topics twice in a row; expected: the too-soon message appears with its wait and goes away when the cooldown ends. — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof
- [ ] Browser Back mid-flow: Back after opening a version; expected: back to live, the frame removed, the chart selection cleared. — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof
- [ ] Reload mid-flow: reload while viewing a version (`?at=` in the URL); expected: the same bin is selected and its version shows. — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof
- [ ] Escape order: focus a band while viewing a version and press Escape; expected: back to live once (one history entry popped). Type in the filter field and press Escape; expected: the version stays. — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof
- [ ] Two authors in two browser contexts at once: Ana (owner) and Bruno (editor) open the same document; Ana deletes it; expected: Bruno sees the unavailable notice with a link to the documents list. — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof
- [ ] Poll stop on 404: after Bruno's notice appears, watch his network log for two members intervals (10 s); expected: no further request to `/members`, `/timeline` or `/summaries`. — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof
- [ ] Console and network clean: zero console errors, zero failed requests, other than the deliberate 401, 404 and 429 above. — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof
- [ ] Desktop width: 1280×800; expected: panel width, resize handle (drag and arrow keys) and collapsed rail as on `main`. — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof
- [ ] Narrow width: 375×812; expected: the auth cards, the documents list and the stacked panel as on `main`. — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof
- [ ] Screenshots at `.pr-media/refinement-readability-web/`; video at `.pr-media/refinement-readability-web/walk.mp4` — BLOCKED: owner waived a separate tester for behaviour-preserving lanes; CI e2e is the proof

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: the flattened pin effect pins exactly when the old nested one did — attack: walk each of the four guards with `at` set before the timeline arrives, a bin without a version that later gets one, and a poll that reports a newer version; result: <refuted | held>
- [ ] Claim 2: no query key value changed, and rename or delete never refetches the DOCX blob — attack: log `queryClient.getQueryCache().getAll().map((query) => query.queryKey)` on the document page on `main` and on the branch, then rename the document and watch the network for `/download`; result: <refuted | held>
- [ ] Claim 3: every failure message is byte-identical — attack: for each of the 16 adopting functions, answer 500 in a scratch test on `main` and on the branch and compare `error.message`; result: <refuted | held>

## Coverage honesty

What is not tested and why.

- A fractional `Retry-After` header — the server only sends whole seconds; with a fraction the reset would now fire at the exact millisecond instead of the next whole second. Accepted.
- TanStack's interval timer when `refetchInterval` is a new curried function on each render — covered only indirectly by the polling suites; failure modes row 8.4 has the fallback.
- The sign-up 429 path — only sign-in pins it; both pages share `useAuthSubmit` and `AuthCard`, so one pin covers the shared code.
- Visual identity of rebuilt pages — asserted by screenshot comparison in the walk, not by an automated visual diff.
