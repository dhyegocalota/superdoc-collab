# Test plan: Final visuals

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path). Red-first names and the failure text each red run must print are in [plan.md](plan.md), Steps 1 to 59.

## The failing test first

- [ ] Group 1 (foundations), Steps 1 to 13a — input: the named test files; expected: each named test red, its failure text as recorded in plan.md, committed alone before the implementation. Step 4a is the copy-only commit and is green on arrival.
- [ ] Group 2 (editor chrome), Steps 14 to 23 — input: the named test files; expected: each named test red before its implementation commit. Step 23 runs after Groups 3, 4, 5, 6 and 7 merge into the lane.
- [ ] Group 3 (Edits panel), Steps 24 to 31a — input: the named test files; expected: each named test red before its implementation commit.
- [ ] Group 4 (Summarize job), Steps 32 to 39 — input: the named test files; expected: each named test red; Step 35 red as `expected 202 to be 404`. Step 39 and the client names of Step 35 wait for G3 Step 26.
- [ ] Group 5 (members and cursors), Steps 40 to 44a — input: the named test files; expected: red before implementation. Steps 43 to 44a use the DOM route of the spike answer.
- [ ] Group 6 (waiting page), Steps 45 to 50 — input: the named test files; expected: red before implementation. Step 50 runs after G2 Step 23 and G8 Step 57.
- [ ] Group 7 (pages), Steps 51 to 55 — input: the named test files; expected: red before implementation.
- [ ] Confirmed each red run fails for the right reason: `git log` shows the red commit before the implementation commit, and the printed failure matches plan.md; no red run fails on a typo or missing import of an unrelated module.

## Unit

- [ ] `apps/web/src/lib/use-theme.test.tsx::useTheme` — input: stored `superdoc-collab.theme` = `dark`, then a `storage` event with `light`; expected: `html` has no `dark` class after the event, and `localStorage` holds `light`.
- [ ] Edge: unknown stored value — input: `superdoc-collab.theme` = `blue`; expected: key removed, System applied, `html` class follows `prefers-color-scheme`.
- [ ] Edge: System follows the OS live — input: System chosen, matchMedia changes from light to dark; expected: `dark` class added with no reload.
- [ ] `apps/web/src/features/timeline/use-panel-position.test.tsx::usePanelPosition` — input: width 1600 with no stored value; expected: `Side`, toggle visible.
- [ ] Edge: boundary 1536 — input: width 1535, then 1536, nothing stored; expected: `Bottom` at 1535, `Side` at 1536.
- [ ] Edge: stored value `diagonal` at 1600 — input: `superdoc-collab.edits-panel` = `diagonal`; expected: key removed, position `Side`.
- [ ] Edge: stored `side` at 800 — input: width 800; expected: `Bottom`, toggle hidden, stored value kept.
- [ ] `apps/web/src/features/editor/use-opened-document.test.tsx::polling` — input: fake timers, 149 polls at `NOT_READY` then 200; expected: `isNotReady` true through poll 149, data present after the 200, no `isPaused`.
- [ ] `…::give-up` — input: 150 polls at `NOT_READY`, then ten minutes with the document hidden and zero polls; expected: `isPaused` true after poll 150, and hidden time adds no poll.
- [ ] Edge: keep waiting — input: paused, then `keepWaiting()`; expected: count restarts at 0, polling resumes, `isPaused` false.
- [ ] Error path — input: a 500 response; expected: error card state, no polling, `keepWaiting` absent from the card, retry refetches exactly once.
- [ ] Error path: 404 or 403 on open — input: a 404, then a 403; expected: `DOCUMENT_UNAVAILABLE_MESSAGE` on the error card, no `Try again`, no polling.
- [ ] `apps/web/src/features/editor/document-title.test.tsx::DocumentTitle` — input: click, type `  New name  `, Enter; expected: one rename request with `New name`.
- [ ] Edge: empty title — input: clear the input, Enter; expected: old title restored, zero requests.
- [ ] Edge: Escape — input: type `Other`, Escape; expected: old title shown, zero requests, focus back on the title button.
- [ ] Error path: rename fails — input: rename returns 500; expected: `RENAME_FAILED_MESSAGE` under the top bar, title keeps its old value.
- [ ] `apps/web/src/features/editor/download-menu.test.tsx::DownloadMenu` — input: click the main part; expected: `onDownloadDocx` called once, `onDownloadPdf` not called.
- [ ] Edge: PDF failure — input: `onDownloadPdf` rejects; expected: toast `The PDF could not be prepared.` and no file download started.
- [ ] `…::print` — input: Download PDF with `window.print` stubbed and a four-page export; expected: when `print` is called the last `.superdoc-page` has text, the print view is mounted off-screen, and `afterprint` unmounts it.
- [ ] `apps/web/src/features/editor/find-button.test.tsx::FindButton` — input: click; expected: `emit` called once with `search:open`.
- [ ] `apps/web/src/features/editor/superdoc-options.test.ts::toolbar and search` — input: the built options; expected: the excluded ids include accept, reject, ruler, measurement unit, document mode, search, `linked-style`, `copy-format`, `clear-formatting` and `ai`; `ui.search` is true.
- [ ] `apps/web/src/features/editor/superdoc-editor.test.tsx::page colour` — input: the editor classes; expected: `bg-paper` is present and `bg-background` is absent for `.superdoc-page`.
- [ ] `apps/web/src/features/editor/editor-toolbar-row.test.tsx::inert` — input: `isPastVersion` true; expected: the toolbar container is `inert`, the Summarize button is not, and the row is absent for a reader.
- [ ] `apps/web/src/features/editor/editor-header.test.tsx::More actions` — input: an owner, then a reader; expected: the owner's menu lists `Use with AI`, `Download PDF` and `Delete`; the reader's menu renders with only the items the role allows and no `Delete`.
- [ ] `apps/web/src/features/editor/document-page.test.tsx::summarize with the panel collapsed` — input: panel collapsed, click Summarize; expected: the panel opens and the card shows Grouping. `data-position` is `bottom` with the editor area first in the DOM below 1024, and `side` at 1536 with Side stored.
- [ ] `apps/web/src/features/timeline/panel-position-toggle.test.tsx::PanelPositionToggle` — input: ArrowRight then Enter; expected: `Side` chosen once and stored.
- [ ] `apps/web/src/features/timeline/timeline-collapsed-bar.test.tsx::chips` — input: five topics with 9, 7, 5, 3, 1 edits; expected: three chips (9, 7, 5); a click filters and opens the panel.
- [ ] `apps/web/src/features/timeline/use-summarize.test.tsx::useSummarize` — input: a URL selection and a cached timeline query; expected: one POST with that selection, `binMs` and `timeZone` from the cache; `isRunning` while the step is not idle; `retryAfterSeconds` after a 429.
- [ ] `apps/web/src/features/timeline/timeline-notices.test.tsx::Retry summary` — input: click; expected: the panel's `summarize` called once.
- [ ] `apps/web/src/features/timeline/summarize-edits-button.test.tsx::states` — input: idle, then running; expected: enabled, then disabled with `Summarizing…` and `aria-busy`.
- [ ] `apps/web/src/components/user-avatar.test.tsx::UserAvatar` — input: name `Ana` and `colorSlot` 1, size 32; expected: initials `A`, background `var(--author-1)`, 32 px square, no online dot unless `isOnline`.
- [ ] `apps/web/src/components/brand-link.test.tsx::BrandLink` — input: render; expected: a link named `SuperDoc Collab, back to documents` to the documents list, with no arrow.
- [ ] `apps/web/src/features/account/account-menu.test.tsx::AccountMenu` — input: a member, then an admin; expected: Settings, Connected apps, Light, Dark, System and Sign out for both, `Admin` for the admin only.
- [ ] `documents-page.test.tsx`, `settings-page.test.tsx`, `connected-apps-page.test.tsx`, `admin-page.test.tsx` — input: render each page; expected: each header is `AppTopBar` with the brand link and account menu, no Sign out button, and documents adds only Use with AI.
- [ ] `apps/web/src/features/connected-apps/use-with-ai-dialog.test.tsx::tabs` — input: open the dialog as a reader, then as an editor; expected: one client tab panel at a time; two prompts naming the document for the reader, three for the editor.
- [ ] `apps/web/src/app/providers.test.tsx::Providers` — input: a `storage` event with `dark`; expected: `html` gains `dark`.
- [ ] Edge: one-word name — input: name `Bruno`; expected: initials `B`, no second letter.
- [ ] `libs/types/src/author-colors.test.ts::authorColorSlot` — input: `u1`, `u2`, the same `u1` again; expected: each slot 1 to 6, `u1` equal twice.
- [ ] Hex rule — input: the six `--author-N` tokens; expected: each matches `^#[0-9a-f]{6}$`, and the value SuperDoc receives as `user.color` is that same string.
- [ ] Edge: agent key — input: `authorColorKeyOf({ userId: 'u1', name: 'Ana', isAgent: true })`; expected: `u1`, equal to the person's own key.
- [ ] Edge: imported author — input: `{ userId: null, name: ' Chris Crawford ', isAgent: false }`; expected: `imported:chris crawford`.
- [ ] `apps/web/src/features/editor/members.test.tsx::Members jump rules` — input: members Ana (self), Bruno (live, position known), Clara (offline), Dev (online, no position); expected: Bruno a button, Ana, Clara, Dev each `aria-disabled` with the reason as description.
- [ ] Edge: past version shown — input: the same members with `isPastVersion` true; expected: every member `aria-disabled`, reason `Go back to live to jump to a cursor`.
- [ ] Edge: seven members — input: seven members; expected: four avatars and `3 more people`; the menu lists the three.
- [ ] Edge: five and six members — input: five, then six; expected: five avatars and no menu, then four avatars and `2 more people`; menu items for members who cannot be jumped to are `aria-disabled` with their reasons.
- [ ] `apps/web/src/features/editor/use-member-cursors.test.ts::jumpTo` — input: a container with a `.v2-collaboration-overlay__remote-caret` labelled `Bruno`; expected: `scrollIntoView({ block: 'center' })` once, `Jumped`.
- [ ] Edge: glow — input: fake timers after a jump; expected: the matching `__remote-selection` has the glow class at 1199 ms and not at `CURSOR_GLOW_MS` (1200 ms).
- [ ] Error path: no caret — input: no caret element labelled `Bruno`; expected: `NotFound`, tooltip `Bruno’s cursor could not be found.` for `JUMP_FAILED_NOTICE_MS`.
- [ ] `apps/web/src/features/editor/waiting-for-document.test.tsx::WaitingForDocument` — input: the waiting view, then entering; expected: `Preparing the document…`, `Back to documents`, a `role="status"` region, and `The document is ready.` announced there on entering.
- [ ] `apps/web/src/features/versions/version-view-page.test.tsx::readiness` — input: a non-Ready readiness; expected: the error card, no polling.
- [ ] Edge: paused view — input: the paused view; expected: `We stopped checking after 5 minutes. Its owner has not opened it once.`, `Keep waiting` first.
- [ ] Edge: title from cache — input: the documents cache holds the title; expected: the title shows; without the cache entry, a `Skeleton` shows.
- [ ] `apps/server/src/insights/summarize-service.test.ts::summarize chain` — input: topics stale, summary stale, sentences fresh; expected: calls `['topics', 'summary']` in order, outcome `Started`.
- [ ] Edge: all fresh — input: all three fresh, inside the cooldown; expected: zero model calls, outcome `UpToDate`, answer 200 from the route (checked before the cooldown).
- [ ] Edge: one job per document — input: a POST for another selection while the job runs; expected: 202, outcome `Running`, the view mirrors the document job's `step`.
- [ ] Error path: failed step — input: the summary step throws; expected: `step` returns to `Idle` and the view's failure text carries the step's message.
- [ ] Error path: failed regroup — input: the topics model call throws; expected: previous ready topics kept, step failure reported, the summary step not run.
- [ ] `apps/server/src/insights/insights-routes.test.ts::429 answer` — input: POST twice within `SUMMARIZE_COOLDOWN_MS` with something stale, the model busy wait 12 s, the cooldown remaining 8 s; expected: 429, `Retry-After: 12`, body message `SUMMARIZE_BUSY_MESSAGE` once. The agent's summarize tool answers the same message.
- [ ] Edge: boundary — input: a POST 29 999 ms after the last model call, then one at 30 000 ms (cooldown remaining exactly 0), with something stale; expected: 429, then the job starts and the answer is 202.
- [ ] `apps/web/src/components/app-top-bar.test.tsx::AppTopBar` — input: render with a right slot; expected: the brand link at the left and the slot at the right in a 52 px bar. The 375 fold is checked in the walk, and the More actions items in `editor-header.test.tsx`.

## E2E (Playwright specs)

Specs live in `e2e/final-visuals.spec.ts` unless noted. Each runs against the fake model.

- [ ] `e2e/final-visuals.spec.ts::rename and cancel` — steps: open a document as owner, click the title, type `Renamed`, Enter, then click, type `Discard`, Escape; expected: the title reads `Renamed`, the second change is not saved after a reload.
- [ ] `…::download DOCX` — steps: click Download; expected: a download named `<title>.docx` starts, and the page shows no error.
- [ ] `…::download PDF through the print view` — steps: open More download formats, choose Download PDF with `window.print` stubbed; expected: the stub is called once, and the print view's container height equals the page count times 1056 and its last page has text when the stub is called.
- [ ] `…::theme and panel across reload` — steps: choose Dark in the account menu, choose the side panel at 1600 px, reload; expected: `html` has `dark` before the first paint, the side panel is still chosen.
- [ ] `…::summarize fresh, stale and up to date` — steps: summarize on a fresh document, edit one paragraph, summarize again, then summarize a third time; expected: first call shows Grouping, then Summarizing, then the sentence; the second call rewrites only what is stale; the third shows `The summary is up to date.` and makes no model request.
- [ ] `…::jump to a member's cursor with two browsers` — steps: browser A (owner) and browser B (member) open the document, B types in the middle, A clicks B's avatar; expected: A's page scrolls so B's caret is visible, B's selection glows for 1200 ms, A's status reads `Moved to <B name>’s cursor.`
- [ ] `…::waiting page enters on its own` — steps: browser B opens the document before the owner A syncs it (A uploads, B opens); A syncs; expected: B shows `Preparing the document…`, then enters the editor without a reload, within 2 polls of A's sync.
- [ ] `…::waiting page pauses and resumes` — steps: B waits with the clock advanced 5 minutes and no sync; expected: `The document is not ready yet` with `Keep waiting`; clicking it resumes polling.
- [ ] `e2e/timeline.spec.ts`, `topics-on-open.spec.ts`, `selection-summary.spec.ts`, `documents.spec.ts`, `time-travel.spec.ts`, `auth.spec.ts` — steps: run the full suite; expected: every spec passes, with the removed Regroup and refresh tests replaced by their Summarize equivalents, and `auth.spec.ts` signing out through the account menu.

## Prove it for real — Playwright MCP

Each width box uses one of these common checks, on the documents list, the editor with the panel open and collapsed, and the waiting page:

- (a) `document.documentElement.scrollWidth <= window.innerWidth`.
- (b) Every visible button's bounding box lies inside the viewport and does not overlap its neighbour.
- (c) The top bar is 52 px and the toolbar row is 40 px (`h-10`, border included) at load and 500 ms after a theme switch, so nothing jumps.
- (d) The console has zero errors and the network has zero failed requests, other than the fake model's expected 429 in the busy check.

Width boxes, each run in both themes (light is chosen in the account menu, dark too):

- [ ] Width 320, light — viewport 320×640; expected: checks (a) to (d) hold; members hidden; Use with AI in More actions.
- [ ] Width 320, dark — viewport 320×640, Dark chosen; expected: checks (a) to (d) hold, same layout as light.
- [ ] Width 375, light — viewport 375×812; expected: checks (a) to (d) hold; panel collapsed by default; `Use with AI`, `Download PDF` and `Delete` sit in More actions, not in the bar.
- [ ] Width 375, dark — viewport 375×812, Dark chosen; expected: checks (a) to (d) hold, same layout as light.
- [ ] Width 768, light — viewport 768×1024; expected: checks (a) to (d) hold; panel at the bottom.
- [ ] Width 768, dark — viewport 768×1024, Dark chosen; expected: checks (a) to (d) hold, same layout as light.
- [ ] Width 1024, light — viewport 1024×768; expected: checks (a) to (d) hold; the position toggle visible; panel at the bottom by default.
- [ ] Width 1024, dark — viewport 1024×768, Dark chosen; expected: checks (a) to (d) hold, same layout as light.
- [ ] Width 1024, Side chosen — viewport 1024×768, the toggle set to Side; expected: checks (a) to (d) hold; the panel beside the page with no clipped control.
- [ ] Width 1280, light — viewport 1280×800; expected: checks (a) to (d) hold; the page centred with no horizontal scroll; panel at the bottom.
- [ ] Width 1280, dark — viewport 1280×800, Dark chosen; expected: checks (a) to (d) hold, same layout as light.
- [ ] Width 1280, Side chosen — viewport 1280×800, the toggle set to Side; expected: checks (a) to (d) hold; the page fits beside the panel with no horizontal scroll.
- [ ] Width 1536, light — viewport 1536×864; expected: checks (a) to (d) hold; panel at the side by default with no stored choice.
- [ ] Width 1536, dark — viewport 1536×864, Dark chosen; expected: checks (a) to (d) hold, same layout as light.
- [ ] Width 1920, light — viewport 1920×1080; expected: checks (a) to (d) hold; panel at the side; the page centred.
- [ ] Width 1920, dark — viewport 1920×1080, Dark chosen; expected: checks (a) to (d) hold, same layout as light.
- [ ] Width 2560, light — viewport 2560×1440; expected: checks (a) to (d) hold; the page capped at 100 % zoom, centred.
- [ ] Width 2560, dark — viewport 2560×1440, Dark chosen; expected: checks (a) to (d) hold, same layout as light.

Flows in the browser, from entry to exit:

- [ ] Happy path, rename: owner signs in, opens a document, renames it; expected: the new title is shown, the documents list shows it after a Back.
- [ ] Happy path, download DOCX and PDF: owner downloads both formats; expected: `.docx` downloads at once; the PDF goes through the print dialog with the hint `Choose “Save as PDF” in the print dialog.`
- [ ] Happy path, theme and panel across reload: choose Dark and the side panel, reload; expected: no light frame before the first paint, the side panel remains.
- [ ] Theme with a past version: open a past version, switch the theme in the account menu; expected: the frame's `html` class follows with no reload.
- [ ] Find: press Cmd+F (Ctrl+F off macOS) in the editor, then click Find; expected: the Find bar opens both times.
- [ ] Trimmed toolbar: open the editor as an editor; expected: no ruler, measurement unit, document mode, search, accept, reject, linked style, copy format, clear formatting or AI item.
- [ ] Toolbar row: owner and reader; expected: the row is 40 px high for the owner and absent for the reader.
- [ ] Two-column bottom layout: panel at the bottom at 1280; expected: the chart's right edge is left of the edits list's left edge.
- [ ] First paint at 1536: clear storage, load at 1536×864 while recording `data-position`; expected: it is `side` from the first frame and never `bottom` first.
- [ ] Brand link: click it on the editor, settings, connected apps and admin pages; expected: the documents list opens each time.
- [ ] Happy path, Summarize fresh, stale and up to date: the three runs of the E2E flow; expected: as the E2E box.
- [ ] Empty: a document with no edits; expected: the chart shows `No edits yet`, Summarize opens the panel with `No edits to summarize`.
- [ ] Single: one edit; expected: one band, one topic chip in the collapsed bar.
- [ ] Many: 30 edits across four people; expected: chips show the three largest, the member overflow shows `+N` above five members.
- [ ] Rejected input: a title of 300 characters; expected: the server answers exactly as it does today for that length, and the page has no horizontal scroll.
- [ ] Browser Back mid-flow: press Back during the Summarize steps; expected: the document page stays, the steps finish in the card.
- [ ] Reload mid-flow: reload while the waiting page polls; expected: the page polls again and enters on the next 200.
- [ ] Two authors in two browser contexts: both open one document; expected: each sees the other's cursor in the other's colour (same hash slot) and the avatars match.
- [ ] Latency and disconnect: throttle the network to Slow 3G during Summarize, then cut the connection for 3 s; expected: the Summarize card shows the busy or error copy, then Retry works after reconnection.
- [ ] Console and network clean: zero console errors and zero failed requests, other than the expected 429 in the busy check.
- [ ] Screenshots at `.pr-media/final-visuals/walk/`; video at `.pr-media/final-visuals/walk/walk.webm`.

## Mutation checks

- [ ] Restore `POST /:documentId/topics/refresh` in `insights-routes.ts` — input: the removed-route test of Step 35 (the `topics-service` refresh tests are deleted with the code); expected: it goes red with `expected 202 to be 404`. Restore the route after the run.
- [ ] Restore the second button in `timeline-panel.tsx` (the `Regroup topics` header button) — input: the header test of Step 26; expected: it goes red with `expected "Regroup topics" not to be in the document`. Restore after the run.

## Adversarial review

The reviewer picks three claims and tries to refute each.

- [ ] Claim 1: the theme class lands before the first paint in every browser — attack: throttle the bundle, load the page with Dark stored, capture the first frame; result: refuted | held.
- [ ] Claim 2: the jump works on a virtualized page — attack: put the target block on a page far outside the viewport, jump; result: refuted | held.
- [ ] Claim 3: the give-up counts polls, not wall time — attack: hide the tab for ten minutes with zero polls, then show it; result: refuted | held.

## Coverage honesty

- Calibri is not bundled. Print output uses a substitute font, and line breaks can differ on a machine that has Calibri. The PDF check counts pages, not glyphs.
- The print dialog is the browser's. The test stubs `window.print` and does not read the saved file. iOS share sheets are not tested.
- The jump depends on the spike's pending answer for the awareness field. The two-browser box proves the route only as far as the spike confirms it.
- The remote caret colour in SuperDoc rests on the spike's PARTIAL answer, six-digit hex only. The two-browser box checks the colour on screen, not the engine's internals.
- Screen readers are not run. Announcements are checked as DOM live regions, not as spoken output.
- Connection-state behaviour belongs to its own feature and is out of this plan's test scope, except the shared `document-page.tsx` layout.
- Widths are checked at one height each. Landscape phones and in-between widths are not.
- Edge cases found during execution go here as new checkboxes, each with its regression test. None are listed yet.
