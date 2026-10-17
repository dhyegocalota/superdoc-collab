# Test plan: web readability (lane C2)

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

Nothing visible may change, so this plan proves three things: each new helper failed before it existed, each move kept its pinning test green before and after, and the proof suites of the two splits did not change.

## The failing test first

Each red commit precedes its implementation commit in `git log --oneline main..HEAD`. Run the named test at the red commit (`git stash; git checkout <red>; cd apps/web && npx vitest run <path>`) and record the failure line.

- [ ] `libs/types/src/text.test.ts::presentOrNull reads a missing search parameter as null` — input: `presentOrNull(new URLSearchParams().get('term'))`; expected at red: `pnpm --filter @superdoc-history/types typecheck` fails with TS2345 (`string | null` not assignable to `string | undefined`); green: `null`.
- [ ] `apps/web/src/features/timeline/max-band-volume.test.ts::the largest band volume, or zero without bands` — input: bands of volume 7 and 9, then no bands; expected at red: `expected 0 to be 9`; green: `9`, then `0`.
- [ ] `apps/web/src/features/timeline/author-of.test.ts::author names follow the keys and join with a comma` — input: keys `['bruno', 'ana']`; expected at red: `expected '' to be 'Bruno, Ana'`; green: `'Bruno, Ana'`.
- [ ] `apps/web/src/lib/api.test.ts::readJson names the subject and the status of a failed response` — input: a 403 response, subject `Members request`; expected at red: an assertion failure, because the stub rejects with a `SyntaxError` from the empty body instead of the expected `ApiRequestError`; green: rejects with `ApiRequestError('Members request failed with status 403')`.
- [ ] `apps/web/src/features/documents/document-query-keys.test.ts::a document key nests its segments under the documents key` — input: `segments: [DocumentResource.Members]`; expected at red: `expected [] to deeply equal [ 'documents', 'doc-1', 'members' ]`; green: equal.
- [ ] `apps/web/src/lib/api.test.ts::polling continues at its interval until the document is gone` — input: interval 5000 with no error, an `ApiRequestError`, a `DocumentUnavailableError`; expected at red: `expected false to be 5000`; green: `5000`, `5000`, `false`.
- [ ] `apps/web/src/lib/use-reset-after-retry.test.ts::a retry-later error resets once its wait is over` — input: `RetryLaterError` with 3000 ms, fake timers; expected at red: reset called 0 times after 3000 ms; green: 0 times at 2999 ms, once at 3000 ms.
- [ ] `apps/web/src/features/timeline/timeline-api.test.ts::a summary requested too soon carries the wait from Retry-After` — input: 429 with `Retry-After: 12`; expected at red: the error carries `retryAfterSeconds: 12` and no `retryAfterMs`; green: `retryAfterMs: 12000`.
- [ ] `apps/web/src/lib/use-window-message.test.ts::a window message reaches the latest handler and none after unmount` — input: handler swapped once, one message, unmount, one message; expected at red: second handler called 0 times; green: first 0, second 1, still 1 after unmount.
- [ ] `apps/web/src/lib/use-escape-key.test.ts::Escape calls the latest handler while enabled` — input: handler swapped once, Escape on `document.body`; expected at red: 0 calls; green: first 0, second 1.
- [ ] `apps/web/src/features/timeline/bin-containing.test.ts::a time inside a bin finds that bin and its index` — input: a time inside and at the start of the second bin; expected at red: `expected null to deeply equal { index: 1, … }`; green: `{ index: 1, bin }` both times.
- [ ] `apps/web/src/features/timeline/use-bin-selection.test.ts::selecting a bin with a version travels to it, a bin without one only selects it` — input: `selectIndex(0)` then `selectIndex(2)` (bin 2 has version 7); expected at red: `expected null to be 0`; green: index 0 without travel, then index 2 and `onTravel(bins[2].start)`.
- [ ] `apps/web/src/features/editor/superdoc-options.test.ts::the options open the file in its room as the signed-in user at the viewport zoom` — input: a Join room, viewing mode, the session user; expected at red: `expected {} to deeply equal { selector: …`; green: the full object with `serverUrl: 'ws://localhost:3000/collaboration/doc-1'` and `zoom: { mode: 'manual' }`.
- [ ] `apps/web/src/components/error-message.test.tsx::an error message is announced as an alert` — input: a message as children; expected at red: no element with role `alert`; green: one alert with the text.
- [ ] `apps/web/src/features/auth/auth-card.test.tsx::a root error is announced as an alert` — input: a form whose root error is set on mount; expected at red: no element with role `alert`; green: one alert reading the root error.
- [ ] Confirmed every red fails for the right reason: each failure above is an assertion message, never `Cannot find module` or `is not a function` (the inert stubs listed in each task make sure of it).

## Pinning tests (green before and after their change)

Each is committed alone, before the commit it pins. Evidence: the pin commit hash, then a green run at the following implementation commit.

- [ ] `sign-in-page.test.tsx::a 429 says how many seconds to wait` — input: the sign-in client answers 429 with `X-Retry-After: 30`; expected: the alert reads `Too many attempts. Try again in 30 seconds.`, before and after Task 1's rename and Task 15's card.
- [ ] `streamgraph.test.tsx::$key without a selection selects bin $expected` — input: no selected bin, keys ArrowRight, ArrowLeft, Home, End on a three-bin chart; expected: `onSelectIndex` last called with 0, 2, 0, 2, before and after Task 4.
- [ ] `streamgraph.test.tsx::another key selects nothing` — input: key `a` with bin 1 selected; expected: `onSelectIndex` never called.
- [ ] `streamgraph-layout.test.ts::label positions stay where they are for a crowded chart` — input: five bands over 40 bins at 480 px; expected: the inline snapshot written before Task 5 (at least one `null` label, at least two placed) still matches after it.
- [ ] `document-query-keys.test.ts::every document key keeps its value` — input: each of the ten builders with fixed arguments; expected: the literal arrays listed in the test, before and after Task 7.
- [ ] `document-query-keys.test.ts::the timeline prefix reaches the timeline and its bin edits, and the documents prefix never reaches the file` — input: six cached keys; expected: the timeline prefix finds exactly the timeline and bin-edits keys; the `['documents']` prefix does not find the file key.
- [ ] `sign-up-page.test.tsx::sign-up asks for a name, an email and a new password and links to sign-in` — input: the sign-up page; expected: the heading, `autocomplete="name"`, `type="email"`, `autocomplete="new-password"`, and a link to `/sign-in`, before and after Task 15.
- [ ] `sign-up-page.test.tsx::sign-up sends the three fields once` — input: Ada, ada@example.com, a long password; expected: one call with exactly those three fields.
- [ ] `upload-dialog.test.tsx::a server failure shows its status and a rejected file afterwards shows only the rejection` — input: a valid file answered 500, then a pdf; expected: first alert `Upload failed with status 500`, then exactly one alert reading `NOT_A_DOCX_MESSAGE`, before and after Task 16.

## Unit

- [ ] `api.test.ts::readJson returns the body of a successful response` — input: a 200 with `{ members: [] }`; expected: resolves to `{ members: [] }`.
- [ ] `api.test.ts::assertOk lets a successful response through and refuses a failed one` — input: 204, then 500 with subject `Members request`; expected: no throw, then `Members request failed with status 500`.
- [ ] `api.test.ts::a 404 means the document is unavailable` — input: 404, then 403; expected: `DocumentUnavailableError(DOCUMENT_UNAVAILABLE_MESSAGE)`, then no throw.
- [ ] `author-of.test.ts::an unknown author key throws instead of printing nothing` — input: key `carla` not in the authors; expected: throws.
- [ ] `use-reset-after-retry.test.ts::any other error, or none, never resets` — input: an `ApiRequestError`, then `null`, 3000 ms later; expected: reset never called.
- [ ] `use-reset-after-retry.test.ts::unmounting before the wait cancels the reset` — input: unmount, then 3000 ms; expected: reset never called.
- [ ] `use-escape-key.test.ts::a disabled hook, another key and a handled Escape do nothing` — input: Escape while disabled, Enter while enabled, an Escape with `defaultPrevented`; expected: 0 calls.
- [ ] `use-escape-key.test.ts::an Escape stopped before it reaches the document does nothing` — input: an inner element that stops propagation, Escape on it; expected: 0 calls.
- [ ] `bin-containing.test.ts::a time outside every bin, no time or no timeline finds nothing` — input: one millisecond before the first bin, exactly the end of the last bin, `null`, no timeline; expected: `null` four times.
- [ ] `use-bin-selection.test.ts::the selection starts at the moment in the URL and follows it` — input: `at` inside bin 1, then `null`; expected: index 1 and bin 1, then `null` and `null`.
- [ ] `use-bin-selection.test.ts::clearing the selection goes back to live` — input: `clearSelection()` with bin 1 selected; expected: index `null`, `onBackToLive` once.
- [ ] `error-message.test.tsx::an inset error message is still one alert with its text` — input: `className="p-4"`; expected: exactly one alert with the text.
- [ ] `auth-card.test.tsx::the card titles the form, labels its field, submits its values and links onward` — input: type `ada@example.com`, submit; expected: title, description, an email-typed field labelled Email, a link to `/sign-up`, and `onSubmit` called once with `{ email: 'ada@example.com' }`.
- [ ] `auth-card.test.tsx::while submitting the button shows the pending label and is disabled` — input: a submit that never resolves; expected: a disabled button named `Signing in…`.

## The proof suites stay unchanged

- [ ] `git diff main..HEAD --stat -- apps/web/src/features/versions/time-travel.test.tsx apps/web/src/features/timeline/timeline-panel.test.tsx apps/web/src/features/editor/document-page.test.tsx` shows only Task 17's `jsonResponse` hunks; `git diff <Task 16 commit> --stat` before Task 17 shows none of the three.
- [ ] At the Task 11 commit, `cd apps/web && npx vitest run src/features/versions/time-travel.test.tsx` passes with the same test count as on `main`.
- [ ] At the Task 12 commit, `cd apps/web && npx vitest run src/features/timeline/timeline-panel.test.tsx` passes with the same test count as on `main`.
- [ ] At the Task 10 and Task 11 commits, `version-view-page.test.tsx` passes with only Task 1's import change in its diff (Task 13 later changes one more import path, for `DocumentMode`).
- [ ] At the Task 6 commit, `redirect-if-session.test.tsx` and `sign-out-flow.test.tsx` pass, and their diff is only the `vi.mock('@/lib/api', …)` line switched to the partial `importOriginal` form.
- [ ] `cd apps/web && npx vitest run` total at Task 18 = total on `main` + the new tests listed above (count them; record both numbers).

## E2E (Playwright specs)

No spec changes in this lane, so the whole suite is the regression net.

- [ ] `pnpm test:e2e` — steps: the full suite, including `auth.spec.ts`, `documents.spec.ts`, `timeline.spec.ts`, `time-travel.spec.ts`, `selection-summary.spec.ts`, `collaboration.spec.ts`; expected: every spec passes, same count as on `main`.
- [ ] `git diff main..HEAD --stat -- e2e` — expected: empty.

## Prove it for real — Playwright MCP

Two viewports: 1280×800 and 375×812. Compare each screenshot with the same screen on `main` (lane A merged): nothing may differ.

- [ ] Happy path, entry to exit: sign up a new user, upload `media-seed.docx`, type a sentence, open the timeline, click a bin with a version, press Escape, click Download; expected: the sign-up card, the documents list, the editor, the chart and the version banner look as on `main`; Escape returns to live; the download starts.
- [ ] Empty: a new blank document; expected: the panel says there are no edits yet, Regroup topics is disabled with its reason, no Top edits heading.
- [ ] Single: one edit by one author; expected: one band, its tooltip on hover reads the band name, the count and the author.
- [ ] Many: two authors editing for several minutes; expected: avatars in the same order as on `main` (largest contributor first, ties by author key).
- [ ] Rejected input: sign in with a wrong password; expected: the alert reads `AUTH_ERROR_MESSAGE` under the password field, nothing else changes. Upload a `.pdf`; expected: exactly one alert with the docx-only message.
- [ ] Rate limit: press Regroup topics twice in a row; expected: the too-soon message appears with its wait and goes away when the cooldown ends.
- [ ] Browser Back mid-flow: Back after opening a version; expected: back to live, the frame removed, the chart selection cleared.
- [ ] Reload mid-flow: reload while viewing a version (`?at=` in the URL); expected: the same bin is selected and its version shows.
- [ ] Escape order: focus a band while viewing a version and press Escape; expected: back to live once (one history entry popped). Type in the filter field and press Escape; expected: the version stays.
- [ ] Two authors in two browser contexts at once: Ana (owner) and Bruno (editor) open the same document; Ana deletes it; expected: Bruno sees the unavailable notice with a link to the documents list.
- [ ] Poll stop on 404: after Bruno's notice appears, watch his network log for two members intervals (10 s); expected: no further request to `/members`, `/timeline` or `/summaries`.
- [ ] Console and network clean: zero console errors, zero failed requests, other than the deliberate 401, 404 and 429 above.
- [ ] Desktop width: 1280×800; expected: panel width, resize handle (drag and arrow keys) and collapsed rail as on `main`.
- [ ] Narrow width: 375×812; expected: the auth cards, the documents list and the stacked panel as on `main`.
- [ ] Screenshots at `.pr-media/refinement-readability-web/`; video at `.pr-media/refinement-readability-web/walk.mp4`

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
