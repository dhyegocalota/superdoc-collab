# Final visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Author this list with every box empty. A sub-agent ticks its own line with evidence. A wrong step is struck through with the reason, not deleted.

**Goal:** One top bar, toolbar row, Edits panel position, theme, author colours, member jump, one Summarize job and a waiting page on every signed-in page, proven at eight widths in light and dark.

**Architecture:** Shared chrome first (tokens, theme, breakpoints, shadcn primitives, `AppTopBar`, `UserAvatar`), then five lanes that each own one screen area. The server gains one Summarize job that calls the existing topics and summaries services and runs only stale steps. Nothing new is stored and no dependency is added.

**Tech Stack:** React 19, React Router, TanStack Query 5, Tailwind 4, shadcn components on the installed `radix-ui` 1.8.1, SuperDoc 2.23.0, Hono, SQLite, Vitest, Testing Library, Playwright.

**Spec:** [spec.md](spec.md). Design sections 1, 2, 4 and 5 are the build input: [design.md](design.md). ADR: [0031](../../adr/0031-one-summarize-job-runs-only-what-is-stale.md).

**Tier:** 🟡

**Seam:** `features/editor/document-page.tsx` composes the editor shell. The top bar, the toolbar row and the Edits panel plug into it. The Summarize job plugs into `apps/server/src/insights/` behind the existing routes.

**Assumptions (decided, owner can override):**
- The spec's `SummarizeStep` has `Idle`, `Grouping` and `Summarizing`. ADR 0031 also lists `Done` and `Failed`. The spec wins: "done" is the view without a running step, and "failed" is the view's failure field. The ADR's evidence line is corrected in Group 4.
- ADR 0031 names `summarize-job.test.ts` and `use-summarize.test.ts`. This plan uses `summarize-service.test.ts` and `use-selection-summary.test.ts`, the names the spec fixes. The ADR evidence line changes in Group 8.
- The cooldown is `KeyedCooldown` from `apps/server/src/limits/keyed-cooldown.ts`, not a new `DocumentCooldown`.
- `SummarizeEditsButton` and `useSelectionSummary` stay in `features/timeline/`, where they are today. The spec's `features/editor/` paths for them are wrong.
- `SignOutButton` stays at `features/auth/sign-out-button.tsx` and becomes the account menu's item in place.
- `UnavailableNotice` is removed. The waiting error card takes its place for other errors, and the members-unavailable case keeps `DOCUMENT_UNAVAILABLE_MESSAGE` on the same card. Group 6 stops and asks the lead if that case needs more than the card.
- A pinned width of 240 px wins when the area is shorter than 480 px, so the panel never falls below its minimum.
- The jump to cursor is planned as the spec asks: awareness position, then block id, then `scrollToElement`. Group 5 starts only after the lead forwards the pending spike answer. If the spike drops the jump, Group 5's jump steps are struck through and avatars stay plain.

## File map

Every path has one owner. A shared file goes to one group, and the other groups reach it through the props or exports the owner adds first.

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/{author-colors.ts,author-colors.test.ts,constants.ts,timeline.ts,index.ts}` (additions only), `apps/web/src/styles/globals.css`, `apps/web/index.html`, `apps/web/src/lib/{use-theme.ts,breakpoints.ts}` and tests, `apps/web/src/components/ui/{toggle-group.tsx,tooltip.tsx,tabs.tsx,dropdown-menu.tsx}` and tests, `apps/web/src/components/{user-avatar.tsx,brand-link.tsx,app-top-bar.tsx}` and tests, `apps/web/src/features/account/*`, `apps/web/src/features/auth/sign-out-button.tsx` and tests | `developer-1` |
| G2 | `apps/web/src/features/editor/{editor-header.tsx,document-title.tsx,download-menu.tsx,download-format.ts,find-button.tsx,editor-toolbar-row.tsx,superdoc-options.ts,superdoc-zoom.ts,superdoc-editor.tsx,editor-copy.ts,document-page.tsx}` and tests, `apps/web/src/features/versions/print-view.tsx` and test | `developer-2` |
| G3 | `apps/web/src/features/timeline/{use-panel-position.ts,panel-position-toggle.tsx,timeline-panel.tsx,timeline-collapsed-bar.tsx,resize-handle.tsx,use-panel-width.ts,timeline-copy.ts,contributor-avatars.tsx,top-edits.tsx,selection-summary-card.tsx}` and tests | `developer-3` |
| G4 | `apps/server/src/insights/{insights-routes.ts,summarize-service.ts,selection-summaries-service.ts,summaries-service.ts,topics-service.ts}` and their tests, `libs/types/src/{timeline.ts,routes.ts}` removals (after G1), `apps/web/src/features/timeline/{use-selection-summary.ts,use-topics.ts (deleted),summarize-edits-button.tsx,timeline-api.ts}` and tests, `docs/adr/0031-one-summarize-job-runs-only-what-is-stale.md` evidence line | `developer-4` |
| G5 | `apps/web/src/features/editor/{members.tsx,use-member-cursors.ts}` and tests, `use-members.ts` only if needed | `developer-5` |
| G6 | `apps/web/src/features/editor/{use-opened-document.ts,editor-api.ts,waiting-for-document.tsx,waiting-copy.ts,unavailable-notice.tsx (deleted)}` and tests, `libs/types/src/documents.ts` (remove `DOCUMENT_NOT_READY_MESSAGE` last) | `developer-6` |
| G7 | `apps/web/src/features/documents/documents-page.tsx`, `apps/web/src/features/settings/settings-page.tsx`, `apps/web/src/features/connected-apps/{connected-apps-page.tsx,use-with-ai-dialog.tsx,connected-apps-copy.ts,connect-snippets.tsx}`, `apps/web/src/features/admin/admin-page.tsx` and tests | `developer-7` |
| G8 | `e2e/final-visuals.spec.ts` (new), `e2e/timeline.spec.ts`, `e2e/topics-on-open.spec.ts`, `e2e/selection-summary.spec.ts`, `e2e/documents.spec.ts`, `e2e/time-travel.spec.ts`, `e2e/auth.spec.ts`, `.claude/rules/web-ui.md`, the revisit lines of three learnings, deletion of `apps/web/src/features/editor/home-link.tsx` | `developer-8` |

Shared-file owners:
- `superdoc-editor.tsx`, `document-page.tsx`, `editor-header.tsx`, `editor-copy.ts`: G2. G5 receives `superdocRef` as a prop. G6 and G3 land their exports first, and G2's last step in `document-page.tsx` imports them.
- `timeline-panel.tsx`, `timeline-copy.ts`: G3. G4 passes `step` through the card's `view` prop.
- `members.tsx`, `use-members.ts`: G5. `use-members.ts` is changed only by an additive field, if at all.
- `libs/types/src/timeline.ts`, `routes.ts`: G1 adds the new names. G4 removes the old ones after G1 merges.

## Sequencing

- G1 runs first and alone. Every other group imports its tokens, components, enums and constants.
- G2, G3, G4, G5, G6 and G7 run in parallel, one worktree each. Each group's last step is an integration step only where it needs another group's export.
- G2's integration step in `document-page.tsx` needs G3's `usePanelPosition`, G6's `useOpenedDocument` return and `WaitingForDocument`, and G7's `UseWithAiDialog`. The lead merges G3, G6 and G7 into G2's lane before that step runs.
- G4 removes `TOPICS_REFRESH_TOO_SOON_MESSAGE`, `topicsRefreshApiPath` and `SELECTION_SUMMARY_COOLDOWN_MS` only after G1 has merged, because G1 adds their replacements.
- G8 runs last. It deletes `home-link.tsx` only after `grep` shows no consumer.

## Steps

Each red step's test is written first and committed alone. Stubs throw `<name> is not implemented`, so typecheck stays green and the red run reaches the named assertion.

### G1 foundations

- [x] **Step 1: author colour keys.** Test `libs/types/src/author-colors.test.ts::authorColorKeyOf joins an agent to its person and imports by trimmed lowercase name`. Input: `{ userId: 'u1', name: 'Ana', isAgent: true }` and `{ userId: null, name: ' Chris Crawford ', isAgent: false }`. Expected: `'u1'` and `'imported:chris crawford'`. Red: `authorColorKeyOf is not implemented`. Evidence: red c4d18f5, green 4657002.
- [x] **Step 2: author colour slot.** Test `libs/types/src/author-colors.test.ts::authorColorSlot returns 1 to 6 and the same value on repeat`. Input: `'u1'` twice. Expected: an integer 1 to 6, equal both times. Red: `authorColorSlot is not implemented`. Evidence: red c4d18f5, green 4657002.
- [x] **Step 3: timing and shared constants.** Test `libs/types/src/constants.test.ts::waiting and jump timings are milliseconds`. Expected: `DOCUMENT_READY_POLL_MS` 2000, `DOCUMENT_READY_GIVE_UP_MS` 300000, `CURSOR_GLOW_MS` 1200, `JUMP_FAILED_NOTICE_MS` 3000. Red: `expected undefined to be 2000`. Evidence: red 443e217, green 28aee46.
- [x] **Step 4: Summarize contract additions.** Test `libs/types/src/timeline.test.ts::SummarizeStep lists idle, grouping and summarizing`. Expected: `['idle', 'grouping', 'summarizing']`. Also add `SUMMARIZE_COOLDOWN_MS` (30000), `SUMMARIZE_BUSY_MESSAGE` and `SelectionSummaryView.step`. Red: `TypeError: Cannot convert undefined or null to object`. Evidence: red 858a5a4, green d1bb168.
- [x] **Step 5: breakpoints.** Test `apps/web/src/lib/breakpoints.test.ts::minWidthQuery builds the query for 1536`. Expected: `(min-width: 1536px)`. Also `LARGE_BREAKPOINT_PX` is 1024 and `WIDE_BREAKPOINT_PX` is 1536. Red: `minWidthQuery is not implemented`. Evidence: red ee52870, green 2706632.
- [x] **Step 6: theme hook.** Test `apps/web/src/lib/use-theme.test.tsx::useTheme adds dark to html for Dark and stores the choice`. Also `…::an unknown stored value is removed and System applies`. Red: `useTheme is not implemented`. Evidence: red cb2a64d, green 2849cc9.
- [x] **Step 7: theme script before first render.** Test `apps/web/src/lib/theme-script.test.ts::index.html sets dark before the bundle and reads THEME_STORAGE_KEY`. Input: the file text. Expected: it contains `superdoc-collab.theme`, `classList.add('dark')` and a `<script>` before `/src/main.tsx`. Red: `expected false to be true`. Evidence: red ca9cfd7 and dbb07df, green caf0773.
- [x] **Step 8: tokens.** Test `apps/web/src/styles/globals.test.ts::--paper is oklch(1 0 0) in :root and .dark`. Also `…::dark --primary is oklch(0.55 0.2 263)` and `…::--author-1 to --author-6 are the six hex values of spec 3.3`. Red: `expected null not to be null`. Evidence: red 6ad114e and ed2c7f4, green b6b2db1.
- [x] **Step 9: shadcn primitives.** Tests `toggle-group.test.tsx::arrow keys move selection between two items`, `tooltip.test.tsx::opens on keyboard focus`, `tabs.test.tsx::selects one tab panel at a time`, and `dropdown-menu.test.tsx::exports DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup and DropdownMenuRadioItem`. Red: `Failed to resolve import "./toggle-group"`, and `expected undefined to be a function` for the dropdown parts. Evidence: red 965d21d, 8d079a5, 97bc66f, 96850e0, green eb747c1.
- [x] **Step 10: user avatar.** Test `apps/web/src/components/user-avatar.test.tsx::renders initials on the author colour at 24 and 32 px`. Input: `{ name: 'Bruno Lima', colorSlot: 2, size: 24, isAgent: false, isOnline: true }`. Expected: text `BL`, `var(--author-2)` background, width 24px, online dot present. Red: `Failed to resolve import "./user-avatar"`. Evidence: red edcf31e, green df0f329.
- [x] **Step 11: brand link and top bar.** Tests `apps/web/src/components/brand-link.test.tsx::links to documents, named "SuperDoc Collab, back to documents", with no arrow` and `apps/web/src/components/app-top-bar.test.tsx::renders the brand link and the right slot in a 52 px bar`. Red: `Failed to resolve import "./brand-link"`. Evidence: red fa828f4, green d64b103.
- [x] **Step 12: account menu.** Tests `apps/web/src/features/account/account-menu.test.tsx::lists Settings, Connected apps, the theme radio group and Sign out, and Admin only for admins`. Also `…::choosing Dark adds the dark class at once`. Red: `Failed to resolve import "./account-menu"`. Evidence: red 4984f86, green 2182d16.
- [x] **Step 13: sign out as a menu item.** Test `apps/web/src/features/auth/sign-out-button.test.tsx::renders as a menu item and still signs out`. Red: `Unable to find role "menuitem" with name "Sign out"`. Evidence: red 58c27ba, green f69197e.

### G2 editor chrome

- [ ] **Step 14: title.** Tests `apps/web/src/features/editor/document-title.test.tsx::click shows an input with the title selected, Enter saves and Escape restores`. Also `…::an empty value restores the old title and sends no request`, and `…::a reader gets an h1 and no button`. Red: `Failed to resolve import "./document-title"`.
- [ ] **Step 15: download.** Tests `download-menu.test.tsx::the main part downloads DOCX and the chevron offers Download PDF` and `download-format.test.ts::DownloadFormat lists Docx and Pdf`. Red: `Failed to resolve import "./download-menu"`.
- [ ] **Step 16: find.** Test `find-button.test.tsx::click emits search:open on the editor instance`. Input: a fake instance with a spy on `emit`. Expected: spy called once with `'search:open'`. Red: `Failed to resolve import "./find-button"`.
- [ ] **Step 17: SuperDoc options.** Tests `superdoc-options.test.ts::ui.toolbar excludes accept, reject, ruler, measurement unit, document mode and search`, `…::ui.search is true`, `…::user.color and colors come from the palette arguments`, and `superdoc-zoom.test.ts::zoom is fit-width with max 100 at every width`. Red: `expected undefined to equal [ ... ]`.
- [ ] **Step 18: print view.** Test `apps/web/src/features/versions/print-view.test.tsx::the frame is pageCount × 1056 px and virtualization is off`. Input: `pageCount: 4`. Expected: frame height 4224 px, and the options passed have `layoutEngineOptions.virtualization.enabled === false`. Red: `Failed to resolve import "./print-view"`.
- [ ] **Step 19: toolbar row.** Test `editor-toolbar-row.test.tsx::renders the toolbar container, and Summarize edits sits at the right`. Red: `Failed to resolve import "./editor-toolbar-row"`.
- [ ] **Step 20: header order.** Test `editor-header.test.tsx::at 1280 the right slot order is Members, Find, Use with AI, Share, Download, More actions, account`. Input: an owner's `OpenedDocument`. Expected: DOM order of those labels. Red: `expected "Download" to come after "Share"`, or the current `TitleInput` lookup failure.
- [ ] **Step 21: editor colours.** Test `superdoc-editor.test.tsx::passes the current author colour and six palette colours to SuperDoc`. Input: mocked `superdoc` module, computed style for `--author-1` to `--author-6`. Expected: the constructor receives `user.color` equal to the current user's token and `colors` with six values. Red: `expected undefined to equal "#2e39b8"`.
- [ ] **Step 22: editor copy.** Test `editor-copy.test.ts::cursor and member copy`. Input: `goToCursorLabel('Bruno')`. Expected: `'Go to Bruno’s cursor'`. Red: `goToCursorLabel is not a function`.
- [ ] **Step 23: integration.** Test `document-page.test.tsx::below 1024 the editor is above the panel, from 1536 a stored Side puts the panel beside the page`. Red: `expected "flex-col" to contain "lg:flex-row"`, once Groups 3 and 6 have merged into this lane.

### G3 Edits panel

- [ ] **Step 24: panel position.** Tests `apps/web/src/features/timeline/use-panel-position.test.tsx::below 1024 px the position is Bottom and the toggle is hidden even when Side is stored`, `…::at 1536 px with nothing stored the position is Side and follows matchMedia`, and `…::a stored value that is not a PanelPosition is removed and treated as absent`. Red: `usePanelPosition is not implemented`.
- [ ] **Step 25: position toggle.** Test `panel-position-toggle.test.tsx::two items, arrow keys move, Enter stores the choice`. Red: `Failed to resolve import "./panel-position-toggle"`.
- [ ] **Step 26: panel header.** Tests `timeline-panel.test.tsx::the heading reads Edits and the header has no Regroup topics button`, and `…::the Timeline toggle is gone and the collapse button is named Edits panel`. Red: `expected "Regroup topics" not to be in the document`.
- [ ] **Step 27: collapsed bar.** Test `timeline-collapsed-bar.test.tsx::shows the three largest topic chips, and a click filters and opens the panel`. Input: five topics with edit counts 9, 7, 5, 3, 1. Expected: chips 9, 7 and 5 only; click on the 7 filter sets it. Red: `Failed to resolve import "./timeline-collapsed-bar"`.
- [ ] **Step 28: panel height.** Test `use-panel-width.test.ts::bottom height is 42 percent of the area, at least 240 and at most the area minus 240`. Inputs: area 1000 → 420; area 400 → 240. Red: `usePanelHeight is not implemented`.
- [ ] **Step 29: resize handle.** Test `resize-handle.test.tsx::the row handle is a separator with aria-orientation horizontal and ↑ ↓ step 24 px`. Red: `expected null to be "horizontal"`.
- [ ] **Step 30: avatars and top edits.** Tests `contributor-avatars.test.tsx::AuthorAvatar renders UserAvatar in the author colour and the imported label for a null id`, and `top-edits.test.tsx::each topic callout has the tinted background token`. Red: `expected "bg-muted" to be ...`.
- [ ] **Step 31: summary steps.** Test `selection-summary-card.test.tsx::step grouping shows the grouping message, and step summarizing shows Topics grouped with a check`. Input: `view.step = 'grouping'`, then `'summarizing'`. Red: `Unable to find an element with the text: Grouping edits into topics…`.

### G4 Summarize job

- [ ] **Step 32: stale-only job.** Test `apps/server/src/insights/summarize-service.test.ts::makes no model call when topics, summary and sentences are fresh`. Input: fresh stamps for all three. Expected: zero model calls and outcome `UpToDate`. Red: `Cannot find module "./summarize-service"`.
- [ ] **Step 33: step order.** Tests `summarize-service.test.ts::regroups only when topics failed or are older than the newest edit, then summarizes, then rewrites stale sentences`. Expected call order `['topics', 'summary', 'sentences']`. Also `…::a failed regroup keeps the previous ready topics`. Red: `Cannot find module "./summarize-service"`.
- [ ] **Step 34: cooldown answers.** Tests `insights-routes.test.ts::a second POST inside the cooldown answers 429 with one Retry-After and SUMMARIZE_BUSY_MESSAGE`, and `…::the Retry-After is the longer of the cooldown and the model's busy wait`. Red: `expected message to equal SUMMARIZE_BUSY_MESSAGE; received the too-soon text`.
- [ ] **Step 35: removed refresh.** Test `insights-routes.test.ts::POST /:documentId/topics/refresh no longer exists`. Input: a POST as an editor. Expected: 404. Red: `expected 202 to be 404`. Then delete the route, `topics-service.refresh`, `RefreshOutcome`, and `topicsRefreshApiPath` with its test.
- [ ] **Step 36: view step and quiet answer.** Tests `insights-routes.test.ts::GET selection returns step idle when no job runs`, and `…::POST selection answers 200 and starts no job when nothing is stale`. Red: `expected undefined to be "idle"`, then `expected 202 to be 200`.
- [ ] **Step 37: rename and client poll.** Test `selection-summaries-service.test.ts::uses SUMMARIZE_COOLDOWN_MS (30000)`. Test `apps/web/src/features/timeline/use-selection-summary.test.tsx::polls while step is not idle and stops at idle`. Red: `expected undefined to be 30000`, then `expected 1 to be greater than 1` on the poll count.
- [ ] **Step 38: Summarize button.** Test `apps/web/src/features/timeline/summarize-edits-button.test.tsx::is never disabled, and while running reads Summarizing… with aria-busy`. Red: `expected <button> not to be disabled`.
- [ ] **Step 39: client cleanup.** Delete `apps/web/src/features/timeline/use-topics.ts` and `refreshTopics` in `timeline-api.ts`. Then `pnpm typecheck` and the unit suite pass. Red: none, this is a removal; its proof is the typecheck and the removed route test of Step 35. ADR 0031 evidence line corrected to the test names in the assumptions.

### G5 members and cursors

- [ ] **Step 40: member buttons.** Tests `apps/web/src/features/editor/members.test.tsx::a member with a live position is a button named Go to Bruno’s cursor`, and `…::an online member with no position, an offline member and the current user are aria-disabled with their reason`. Red: `Unable to find role "button" with name "Go to Bruno’s cursor"`.
- [ ] **Step 41: past version.** Test `members.test.tsx::while a past version is shown every member is aria-disabled with Go back to live to jump to a cursor`. Red: `expected aria-disabled to be "true"`.
- [ ] **Step 42: overflow.** Test `members.test.tsx::with seven members it shows four avatars and a button named 3 more people whose menu lists the rest`. Red: `expected 7 to be 4` on the avatar count.
- [ ] **Step 43: cursor route.** Test `apps/web/src/features/editor/use-member-cursors.test.ts::jumpTo scrolls to the block id of the member's cursor`. Input: awareness state `{ userId: 'bruno', blockId: 'b-17' }`, a spy on `scrollToElement`. Expected: spy called with `'b-17'`, outcome `Jumped`. Also `…::a stale position returns NotFound`. Red: `useMemberCursors is not implemented`. The awareness field and block-id call are the pending spike's answer.
- [ ] **Step 44: announcement.** Test `members.test.tsx::after a jump a status region reads Moved to Bruno’s cursor.`. Red: `Unable to find role "status" with text "Moved to Bruno’s cursor."`.

### G6 waiting page

- [ ] **Step 45: typed not-ready error.** Test `apps/web/src/features/editor/editor-api.test.ts::a 409 NOT_READY throws DocumentNotReadyError, not a generic error`. Red: `expected ApiRequestError to be DocumentNotReadyError`.
- [ ] **Step 46: polling.** Tests `use-opened-document.test.tsx::a NOT_READY answer is a state that polls every 2 s and enters on 200`. Red: `expected undefined to be true` on `isNotReady`.
- [ ] **Step 47: give-up counts polls.** Test `use-opened-document.test.tsx::after 150 polls the state is paused, and ten minutes hidden with zero polls keeps it waiting`. Expected: paused after 150 polls, not after 300000 ms of hidden time. Red: `expected false to be true`.
- [ ] **Step 48: keep waiting and errors.** Tests `use-opened-document.test.tsx::keepWaiting restarts the count` and `…::a non-409 error stays an error and retry refetches once`. Red: `keepWaiting is not a function`.
- [ ] **Step 49: waiting card.** Tests `waiting-for-document.test.tsx::the waiting state shows Preparing the document… and Back to documents`, `…::the paused state shows the five-minute message and Keep waiting first`, and `…::the title shows when the documents cache holds it, and a skeleton otherwise`. Red: `Failed to resolve import "./waiting-for-document"`.
- [ ] **Step 50: remove dead notice.** Delete `unavailable-notice.tsx` and `DOCUMENT_NOT_READY_MESSAGE` from `libs/types/src/documents.ts`. Red: none; proof is `pnpm typecheck` after G2's integration step.

### G7 pages

- [ ] **Step 51: documents header.** Test `apps/web/src/features/documents/documents-page.test.tsx::the header holds Use with AI and the account menu only, and Upload is the primary action`. Red: `found link "Connected apps"`.
- [ ] **Step 52: settings and connected apps headers.** Tests `settings-page.test.tsx::the header has the brand link and the account menu, and no Sign out button`, and `connected-apps-page.test.tsx::the header has no Back to documents link`. Red: `found button "Sign out"`.
- [ ] **Step 53: admin header.** Test `admin-page.test.tsx::the header uses AppTopBar`. Red: `expected the Settings link to be absent from the header`.
- [ ] **Step 54: Use with AI dialog.** Tests `use-with-ai-dialog.test.tsx::tabs show one client at a time`, and `…::a reader sees two example prompts that name the document, an editor sees three`. Red: `Failed to resolve import "./use-with-ai-dialog"`.
- [ ] **Step 55: copy.** Test `connected-apps-copy.test.ts::documentPrompts adds the fix prompt only when canEdit is true`. Red: `documentPrompts is not a function`.

### G8 E2E and docs

- [ ] **Step 56: new flows.** Write `e2e/final-visuals.spec.ts` with the flows of the Playwright MCP section, first as failing specs. Red: each test fails on the missing selector named in its title.
- [ ] **Step 57: moved specs.** Update `e2e/timeline.spec.ts` (drop the Regroup test), `topics-on-open.spec.ts` (drop the refresh), `selection-summary.spec.ts` (Summarize in the toolbar row), `documents.spec.ts` (Download split), `time-travel.spec.ts` (refresh tests become 404 or removed), and `auth.spec.ts` (Sign out in the account menu). Red: each spec fails before its step and passes after the groups merge.
- [ ] **Step 58: docs move with the code.** Update `.claude/rules/web-ui.md` (theme, panel position, toolbar, print view). Append a `Revisited` line to `docs/learnings/2026-10-17-a-disabled-button-never-shows-its-title.md`, `docs/learnings/2026-10-16-superdoc-reader-needs-viewing-mode.md` and `docs/learnings/2026-10-17-keydown-inside-an-iframe-never-reaches-the-parent.md`. `apps/web/README.md` changes only if its purpose changes, which it does not.
- [ ] **Step 59: dead file.** Delete `apps/web/src/features/editor/home-link.tsx` after `grep -rn "home-link" apps/web/src` finds no import. Red: none; proof is the typecheck.

## Review Focus

- A stored theme value that is not a `ThemePreference` (e.g. `blue`). Expected: removed from storage, System applies. Test: Step 6.
- A stored panel value that is not a `PanelPosition`. Expected: removed, position from the width. Test: Step 24.
- A title saved as empty or only spaces. Expected: old title restored, no request. Test: Step 14.
- A PDF of a long document, where pages outside the viewport are not painted. Expected: the print frame is `pageCount × 1056` px. Test: Step 18.
- A waiting page left open in a hidden tab. Expected: hidden time does not count toward the five minutes. Test: Step 47.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 to 5 | a helper rounds or misses a case | the unit test named in the step fails | revert the lane commit |
| 7 | the script runs after the bundle and the page flashes light | `theme-script.test.ts` red; the Playwright MCP theme box shows a light frame on load | move the script above the module tag |
| 8 | dark primary fails contrast or paper turns black | token test red; the dark Summarize button reads low contrast in the walk | restore the previous values |
| 17 | `excludeItems` names do not match SuperDoc 2.23.0 | `pnpm typecheck` fails on the option type | correct the names from the installed types |
| 17 | zoom fit-width causes horizontal scroll at 320 | the 320 width box shows `scrollWidth` above `clientWidth` | restore the viewport switch and report it to the lead |
| 18 | virtualization still hides pages | PDF page count below the document's pages | raise the frame height before printing |
| 21 | colours differ between cursor and avatar | the two-browser jump box shows different colours | pass the token value to SuperDoc again |
| 24 | side default below 1536 | the 1280 width box shows the panel beside the page | correct `WIDE_BREAKPOINT_PX` |
| 27 | chips use the wrong sort | the collapsed bar test shows chips 5 and 3 | sort by edit count descending |
| 34 | busy answer uses two messages | the 429 test's message assertion | restore the single constant |
| 36 | the job never reports `idle` | the polling test runs forever | reset the step when the job ends |
| 43 | awareness has no block id | the spike answer is missing or the test is red | strike Steps 40 to 44's jump parts, keep plain avatars |
| 47 | polling counts wall time | the fake-timer test reports paused early | count polls, not time |
| 52 | a page header overflows at 320 | the 320 width box shows a clipped control | move the action into More actions |
| 57 | a moved E2E selector stays old | the E2E spec fails on the old selector | update the selector with the new control |

**Steps with no backout:** none. Each removal step (Steps 35, 39, 50, 59) reverts with its lane commit, which restores the removed endpoint, file or message and its tests.

## Overlap with connection-state

The feature `connection-state` is built in parallel and also edits `document-page.tsx`, `superdoc-editor.tsx` and `use-members.ts`. This feature keeps its changes to those files additive: a new prop, a new function, or one new call site. It does not reorder existing JSX. `document-page.tsx` gets the banner slot above the toolbar row as one new element. `use-members.ts` gets one new field, and only if Group 5 needs it. The lead merges the two lanes.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md` with the red names and the failure texts the red runs printed.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** screenshots and video recorded and uploaded at the eight widths in light and dark.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
