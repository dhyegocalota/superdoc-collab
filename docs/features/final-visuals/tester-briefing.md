# Tester briefing: Final visuals

Written by the developer sub-agents when their steps are done. A developer does not run `test-plan.md` and does not declare the feature works. Each group appends its own section.

## G1 foundations (developer-1, branch `feat/final-visuals-g1`)

### What changed

- `libs/types/src/author-colors.ts`: `authorColorKeyOf`, `authorColorSlot` (FNV-1a over UTF-8 bytes), `AuthorColorSlot` (1 to 6), `AUTHOR_COLOR_SLOT_COUNT`, `AGENT_KEY_SUFFIX`, `IMPORTED_KEY_PREFIX`, `HASH_OFFSET_BASIS`, `HASH_PRIME`. It takes `Pick<EventAuthor, 'id' | 'name'>`, so any `EventAuthor` is accepted as is. An agent's `id` with the `#agent` suffix loses it; `id: null` becomes `imported:` plus the trimmed lowercase name.
- `libs/types/src/constants.ts`: `DOCUMENT_READY_POLL_MS`, `DOCUMENT_READY_GIVE_UP_MS`, `CURSOR_GLOW_MS`, `JUMP_FAILED_NOTICE_MS`.
- `libs/types/src/timeline.ts`: `SummarizeStep`, `SUMMARIZE_COOLDOWN_MS`, `SUMMARIZE_BUSY_MESSAGE`; `SelectionSummaryView.step` is left to G4. `SELECTION_SUMMARY_COOLDOWN_MS` and `TOPICS_REFRESH_TOO_SOON_MESSAGE` are still there for G4 to remove.
- `apps/web/src/lib/breakpoints.ts`, `use-theme.ts` (`useTheme`, `ThemePreference`, `THEME_STORAGE_KEY`, `isThemePreference`).
- `apps/web/index.html`: inline script that adds `dark` before the bundle.
- `apps/web/src/styles/globals.css`: `--paper`, `--topic-tint-lightness`, `--author-1` to `--author-6`, dark `--primary` at `oklch(0.55 0.2 263)`, `bg-paper` and `bg-author-N` in `@theme inline`, `.topic-tint`, the `--sd-ui-*` and `--sd-layout-page-bg` mapping.
- `apps/web/src/components/ui/`: `toggle-group.tsx`, `tooltip.tsx`, `tabs.tsx`, and `dropdown-menu.tsx` with `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`.
- `apps/web/src/components/`: `user-avatar.tsx` (`UserAvatar`, `UserAvatarSize` 24 and 32), `brand-link.tsx`, `app-top-bar.tsx`.
- `apps/web/src/features/account/`: `account-menu.tsx`, `account-copy.ts`.
- `apps/web/src/features/auth/`: `use-sign-out.ts`, `sign-out-menu-item.tsx` (`SignOutMenuItem`, used by the account menu); `SignOutButton` is unchanged in behaviour.
- `apps/web/src/app/providers.tsx`: mounts `useTheme()` once; hook instances in one tab stay in step through a window event.
- Copy landed per lead: editor, timeline and connected-apps copy files, and the `PanelPosition` enum in `features/timeline/use-panel-position.ts` (enum only). `TIMELINE_HEADING`, `RESIZE_PANEL_LABEL` and `TIMELINE_TOGGLE_LABEL` changed value.

### How to run

```bash
pnpm install --frozen-lockfile
pnpm --filter @superdoc-collab/types test:unit
pnpm --filter @superdoc-collab/web test:unit src/lib src/styles src/components src/features/account src/features/auth/sign-out-button.test.tsx
```

### Red today, green after

Failure texts are what the red run printed at the red commit. A row marked "changed" had its test corrected in the green commit because the first version was wrong, not the code.

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `libs/types/src/author-colors.test.ts::authorColorKeyOf joins an agent to its person and imports by trimmed lowercase name` (c4d18f5) | `Error: authorColorKeyOf is not implemented for Ana` | key rule implemented (4657002) |
| `…::authorColorSlot returns 1 to 6 and the same value on repeat`, `…spreads many keys over all six slots`, `…follows the 32-bit FNV-1a of the key` (c4d18f5) | `Error: authorColorSlot is not implemented for u1` | FNV-1a, 32-bit, modulo 6 plus 1 |
| `libs/types/src/constants.test.ts::the waiting page, jump glow and jump notice durations are in milliseconds` (443e217) | `AssertionError: expected [ undefined, undefined, …(2) ] to deeply equal [ 2000, 300000, 1200, 3000 ]` | constants added |
| `libs/types/src/timeline.test.ts::SummarizeStep lists idle, grouping and summarizing` (858a5a4) | `TypeError: Cannot convert undefined or null to object` | enum added |
| `…::the summarize cooldown is thirty seconds and the busy message is one sentence` (858a5a4) | `AssertionError: expected undefined to be 30000` | constants added |
| `apps/web/src/lib/breakpoints.test.ts::minWidthQuery builds the query for 1536` (ee52870) | `Error: minWidthQuery is not implemented` | query built |
| `apps/web/src/lib/use-theme.test.tsx::useTheme adds dark to html for Dark and stores the choice` and six siblings (cb2a64d) | `Error: useTheme is not implemented` | hook implemented |
| `apps/web/src/lib/theme-script.test.ts::index.html sets dark before the bundle and reads THEME_STORAGE_KEY` (ca9cfd7, dbb07df) | `AssertionError: expected false to be true` and `Error: index.html has no inline script` for the rows that run the script. The first version failed with `The URL must be of scheme file` and the css-as-raw version with an empty string, both test bugs, fixed in ed2c7f4 and dbb07df | inline script in `index.html` |
| `apps/web/src/styles/globals.test.ts` seven tests (6ad114e, ed2c7f4) | `AssertionError: expected null to be 'oklch(1 0 0)'`, `expected 'oklch(0.62 0.2 263)' to be 'oklch(0.55 0.2 263)'`, `expected [ null, null, null, null, null, null ] to deeply equal [ '#2e39b8', … ]`, `globals.css has no .topic-tint block` | tokens added |
| `components/ui/toggle-group.test.tsx::arrow keys move selection between two items` (965d21d) | `Failed to resolve import "./toggle-group"` | primitive added. Changed: I dropped a "one item has tabindex 0" test, because Radix makes the group the tab stop |
| `…/tooltip.test.tsx::opens on keyboard focus` (8d079a5) | `Failed to resolve import "./tooltip"` | primitive added |
| `…/tabs.test.tsx::selects one tab panel at a time` (97bc66f) | `Failed to resolve import "./tabs"` | primitive added |
| `…/dropdown-menu.test.tsx::exports a label, a separator and a radio group with radio items` (96850e0) | `AssertionError: expected [ 'undefined', 'undefined', …(2) ] to deeply equal [ 'function', … ]` | parts added. Changed: the test uses a controlled group, because Radix has no `defaultValue` on the dropdown radio group |
| `components/user-avatar.test.tsx::renders initials on the author colour at 24 and 32 px` (edcf31e) | `Failed to resolve import "./user-avatar"` | component added |
| `components/brand-link.test.tsx::links to documents, named "SuperDoc Collab, back to documents", with no arrow` and `components/app-top-bar.test.tsx::renders the brand link and the right slot in a 52 px bar` (fa828f4) | `Failed to resolve import "./brand-link"` and `"./app-top-bar"` | components added. Changed: brand link test reads `document.body`, since `renderWithProviders` returns no container |
| `features/account/account-menu.test.tsx` six tests (4984f86) | `Failed to resolve import "./account-menu"` | menu added |
| `features/auth/sign-out-button.test.tsx::renders as a menu item and still signs out` (58c27ba) | `TestingLibraryElementError: Unable to find role="menuitem" and name "Sign out"` | item added |

### Hypotheses to attack

1. Hypothesis: the same user id gives the same colour slot on every client, and an agent shares its person's slot. Break it by: compare `authorColorSlot(authorColorKeyOf(...))` for `u1`, `u1#agent` and an imported name with odd casing or spaces, and non-ASCII names.
2. Hypothesis: the page is never light for a dark reader on reload. Break it by: set `superdoc-collab.theme` to `dark`, `system` with a dark OS, an unknown value, and block storage; reload each time and watch the first paint.
3. Hypothesis: a theme change in one tab reaches the other tab and the version iframe. Break it by: open two tabs, choose Dark in one, look at the other without reloading.
4. Hypothesis: the account menu stays open after a theme choice and closes after a link or Sign out. Break it by: keyboard only (Enter, Space, arrows, Escape) and then at 375 px.
5. Hypothesis: the primary Summarize/Share buttons in dark mode reach AA. Break it by: measure white on dark `--primary` and the `--author-N` backgrounds.
6. Hypothesis: choosing a theme in the account menu is never undone by an OS theme change under Light or Dark. Break it by: choose Dark, then flip the OS theme.

### Known gaps

## Known gaps

- <what the developer knows is missing or untested>

## G6 waiting page (developer-6)

### What changed

- `libs/types/src/constants.ts`: `DOCUMENT_READY_POLL_MS` (2 s) and `DOCUMENT_READY_GIVE_UP_MS` (5 min), a mirror of G1; the lead keeps G1's version at merge.
- `apps/web/src/features/editor/editor-api.ts`: `DocumentNotReadyError`. `openDocument` throws it on 409 `NOT_READY` and throws `DocumentUnavailableError` on 404.
- `apps/web/src/features/editor/use-opened-document.ts`: returns `{ data, error, isFetchedAfterMount, readiness, keepWaiting, retry }`. `DocumentReadiness` is `Opening`, `Ready`, `Waiting`, `Paused`, `Failed`, `Unavailable`. `error` is `null` while waiting or paused. The give-up counts answers (150), so hidden time never counts.
- `apps/web/src/features/editor/waiting-for-document.tsx` and `waiting-copy.ts`: the page and its copy.
- Step 50 is pending: `unavailable-notice.tsx` and `DOCUMENT_NOT_READY_MESSAGE` stay until G2 and G8 stop importing them.

### Integration G2 must do in `document-page.tsx`

1. Read `readiness`, `keepWaiting` and `retry` from `useOpenedDocument`.
2. Replace both `UnavailableNotice` returns with one early return when the readiness is `Waiting`, `Paused`, `Failed` or `Unavailable` (`isUnavailable` from `useMembers` maps to `Unavailable`): `<WaitingForDocument documentId={documentId} readiness={readiness} onKeepWaiting={keepWaiting} onRetry={retry} />`. `Opening` keeps rendering `OpeningDocument`.
3. In `waiting-for-document.tsx`, the `<header>` (brand link plus title or skeleton) is a placeholder made of `HomeLink`. Swap the whole header element for `AppTopBar` in one line; keep the title branch (cached title, else `Skeleton`) as `AppTopBar`'s title slot.
4. `document-page.test.tsx::a 409 not ready shows the owner message and never builds the editor` is red until step 2 lands: the hook no longer returns an error for 409. G2 rewrites it to expect the waiting card. `e2e/documents.spec.ts` line 91 waits for `DOCUMENT_NOT_READY_MESSAGE` and is G8's to move to `PREPARING_DOCUMENT_MESSAGE`.
5. After that, delete `unavailable-notice.tsx` and `DOCUMENT_NOT_READY_MESSAGE` (step 50); `DocumentNotReadyError` already uses `DOCUMENT_NOT_READY_ERROR` as its message.

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `editor-api.test.ts::a 409 NOT_READY throws DocumentNotReadyError, not a generic error` (`1fb396c`) | `expected Error: The owner has not opened this docu… to be an instance of DocumentNotReadyError` | `5e50263` throws the typed error |
| `editor-api.test.ts::the open request targets the document path` | pin, green when it landed | |
| `use-opened-document.test.tsx::a NOT_READY answer is a state that polls every 2 s and enters on 200` (`26f67bd`) | `expected 'ready' to be 'waiting'` | `ffa5adb` |
| `…::after 150 polls the state is paused, and ten minutes hidden with zero polls keeps it waiting` | `expected 'ready' to be 'paused'` | `ffa5adb` |
| `…::ten minutes hidden with zero polls keeps it waiting` | `expected 'ready' to be 'waiting'` | `ffa5adb` |
| `…::keepWaiting restarts the count` | `expected 'ready' to be 'paused'` | `ffa5adb` |
| `…::a non-409 error stays an error and retry refetches once` | `expected 'ready' to be 'failed'` | `ffa5adb` |
| `…::a 404 is unavailable, not a failure to retry` | `expected 'ready' to be 'unavailable'` | `ffa5adb` |
| `waiting-for-document.test.tsx` (6 tests, `c2a914d`) | the stub threw `WaitingForDocument is not implemented`, so each query found the router error page ("Unexpected Application Error!") | `9dbb452` |

### Hypotheses to attack

1. Hypothesis: a document opened before its owner's first sync shows the waiting card and enters on its own within about 2 s of the owner opening it. Break it by: opening as a reader first, then the owner; also reload while waiting.
2. Hypothesis: polling stops after 150 answers (5 minutes of visible waiting) and a hidden tab never polls. Break it by: leaving the tab hidden for 6 minutes, then showing it; the card must still say "Preparing the document…".
3. Hypothesis: "Keep waiting" resumes polling at once and gives another 5 minutes. Break it by: clicking it twice quickly; clicking it after the owner has opened the document.
4. Hypothesis: a 500 or a dropped connection shows "Try again", which refetches once and does not poll. Break it by: going offline while waiting, then back online and clicking Try again.
5. Hypothesis: the card is never wider than the viewport minus 32 px and the page has no horizontal scroll from 320 to 2560 px; the card sits 120 px from the canvas top, 64 px below 640 px. Break it by: resizing through 320, 375, 639, 640, 1280 and 2560, in light and dark.
6. Hypothesis: the card text is announced once (`role="status"`; the error card uses `role="alert"`) and polling never re-renders it. Break it by: a screen reader pass while waiting for a minute.
7. Hypothesis: the title shows only when the documents list cache already holds the document (opened from the list), and a skeleton shows when entering by a share link or a reload. Break it by: both entries.

### Known gaps

- The first answer counts as one of the 150, so the card pauses after 149 intervals (4 minutes 58 seconds) following the first answer. After "Keep waiting" the count restarts from the refetch it triggers.
- The title is read once per render from the cache with `getQueryData`; it does not subscribe, so a title that arrives while the card is up appears at the next render.
- The header is a placeholder until G2 swaps in `AppTopBar`; the account menu is absent until then.
- The use-opened-document tests settle fake timers with a 100 ms advance after each step; changing TanStack's notify scheduling could need a bigger value.
- No test measures layout (widths, 120 px and 64 px offsets); those need the browser walk.

### G6 addendum: version view and 403 (Step 49a)

- `version-view-page.tsx` uses `useOpenedDocumentWithoutPolling`. A 409, 404, 403 or failed open shows the unavailable message (a failed open shows its own message), posts Failed to the parent and never builds SuperDoc. `Opening` keeps the session skeleton.
- A 403 on the open route is unavailable, like 404: no Try again.
- Red `c9ad092` (`Unable to find role="alert"`; `expected "fetch" to be called 1 times, but got 2 times`; `expected Error: The document could not be loaded. to be an instance of DocumentUnavailableError`), green `238b70f`.
- Hypothesis: a version opened for a document that was never committed shows the unavailable notice in the frame and never polls. Break it by: opening a version URL for a reader before the owner's first sync and watching the network for repeated document requests.
- Step 13 changed: the sign-out menu item is `SignOutMenuItem` (red a5d061d, green 7d75944); the first menu-item-in-button version (58c27ba, f69197e) was reverted, so no page breaks and typecheck is clean.
- Extra red/green pairs: Providers theme (6bc3922, 7f1beb4), shared choice across hook instances (b5c515c, 91b82f0).
- `apps/web/src/lib/copy-rules.test.ts` does not scan `account-copy.ts`; its owner can add it.
- The account trigger has `aria-label` but no `Tooltip` yet (design section 2 lists one); the Tooltip primitive is ready for whoever wires the top bars.
- `home-link.tsx` is untouched; G8 deletes it. `BrandLink` imports `HOME_LINK_LABEL` from `features/editor/editor-copy.ts`.
- Nothing here was seen in a browser. Real Radix pointer, focus and animation behaviour, the contrast numbers and the first-paint theme are untested beyond jsdom.

## G2 editor chrome, Steps 14 to 22 (developer-2, branch `feat/final-visuals-g2`)

Step 23 (`document-page.tsx` integration) is not done; it waits for the merge of G3, G4, G5 and G7.

### What changed

- `features/editor/document-title.tsx` (`DocumentTitle`): button at rest, `Input` with the text selected on click or Enter, Enter or blur saves through the rename mutation, Escape and an empty value restore, focus returns to the button after Enter or Escape, a reader gets an `h1`. While the rename is pending the new title shows.
- `features/editor/download-format.ts` (`DownloadFormat`), `download-menu.tsx` (`DownloadMenu` split button, `useDownload`, `LOADING_DOCUMENT_REASON_ID`), `DOWNLOAD_FORMAT_LABELS` in `editor-copy.ts`. `useDownload({ superdoc, onDownloadDocx })` returns `download(format)` and the `printView` node. The DOCX path stays the page's `onDownloadDocx`; the PDF path exports with `triggerDownload: false`, shows the loading toast with `PDF_PRINT_HINT`, mounts `PrintView`, and dismisses the toast on `afterprint`; a failed export or print view shows `PDF_FAILED_MESSAGE`.
- `features/versions/print-view.tsx` (`PrintView`): a portal into `body`, `data-print-view`, 816 px wide, off-screen at `-10000px`, height `pageCount × 1056` px after `onReady`, `virtualization.enabled: false`, a bounded `requestAnimationFrame` loop (600 frames) until the last `.superdoc-page` has text, then `window.print()`. A `@media print` style hides every other child of `body`.
- `features/editor/find-button.tsx` (`FindButton`): `superdoc.emit('search:open')`, with a `Tooltip`.
- `features/editor/superdoc-options.ts`: `TOOLBAR_EXCLUDED_ITEMS` (`satisfies readonly ToolbarItemId[]`), `ui.toolbar` only when a container is given, `ui.search: true`, `user.color`, `colors`, `printSuperdocOptions`. `superdoc-zoom.ts`: `FIT_WIDTH_ZOOM`; the viewport switch (`initialZoomMode`, `followViewportZoom`, `NARROW_VIEWPORT_QUERY`) is gone.
- `features/editor/editor-toolbar-row.tsx` (`EditorToolbarRow`): 40 px row, toolbar container `flex-1 min-w-0` with `inert` support, Summarize at the right, nothing for a reader.
- `features/editor/editor-header.tsx` (`EditorHeader`): renders `AppTopBar` itself. Left: divider, `DocumentTitle`, Read only badge. Right: Members, Find, Use with AI, Share (owner), Download split, More actions, `AccountMenu`. Below `sm` Members and the Use with AI and Download bar items hide (CSS), and More actions carries Use with AI, Download .docx and Download PDF. Delete stays owner-only. A non-owner's More actions trigger hides at `sm` and above because its items are all `sm:hidden`.
- `features/editor/superdoc-editor.tsx`: `onSuperdocChange(superdoc | null)` replaces `superdocRef` (set from SuperDoc's `onReady`, cleared on destroy), `toolbarContainer` prop, `user.color` and six `colors` read with `getComputedStyle` from `--author-1` to `--author-6` (a missing token throws `MissingAuthorColorError`), page background `bg-paper`.
- `features/editor/opening-document.tsx`: header is `AppTopBar`.
- `features/editor/document-page.tsx`: only what is needed to compile: the instance as state, the new header and editor props, `isPastVersion` from the time-travel state, `renderUseWithAi` returns nothing, `toolbarContainer` is `null`. Step 23 replaces these.
- Mirrors, for the lead to drop at the merge: `summarize-edits-button.tsx` is G4's file copied (f5ccbc0); `members.tsx` only gains two optional props (a43f42f).
- New test helper `apps/web/src/testing/author-palette.ts`: installs and removes the six `--author-N` custom properties so jsdom can resolve them.

### Deviations from the prompt

- `EditorHeader` takes `renderUseWithAi: (trigger?: ReactNode) => ReactNode`, not a `ReactNode` slot. The bar calls it with no argument; More actions calls it with a `DropdownMenuItem` trigger, because G7's `UseWithAiDialog` takes a `trigger` prop and a dialog cannot live inside a closing menu otherwise. Step 23 passes `(trigger) => <UseWithAiDialog title={…} canEdit={…} trigger={trigger} />`.
- `DownloadMenu` is presentational (`isDisabled`, `onDownload(format)`); the PDF logic is the `useDownload` hook in the same file, so More actions can use the same handler.
- The editor's `onReady` is now set. `web-ui.md` forbids focusing from `onReady`; the test "the editor never takes the focus on its own" now asserts `document.body` keeps the focus after `onReady`.

### Red runs, as printed

| Step | Test | Failure text |
|---|---|---|
| 14 | `document-title.test.tsx` | `Error: DocumentTitle is not implemented` |
| 15 | `download-format.test.ts` | `AssertionError: expected [ 'docx' ] to deeply equal [ 'docx', 'pdf' ]` |
| 15 | `download-menu.test.tsx` | `Error: DownloadMenu is not implemented` |
| 16 | `find-button.test.tsx` | `Error: FindButton is not implemented` |
| 17 | `superdoc-options.test.ts` | `AssertionError: expected undefined to deeply equal [ …(10) ]`; `expected 'import { COLLABORATION_TOKEN_PLACEHOL…' to contain 'satisfies readonly ToolbarItemId[]'`; `TypeError: Cannot read properties of undefined (reading 'matchMedia')` |
| 17 | `superdoc-zoom.test.ts` | `AssertionError: expected undefined to deeply equal { mode: 'fit-width', …(1) }` |
| 18 | `print-view.test.tsx` | `Error: PrintView is not implemented` |
| 18 | `download-menu.test.tsx` (`useDownload`) | `Error: useDownload is not implemented` |
| 19 | `editor-toolbar-row.test.tsx` | `Error: EditorToolbarRow is not implemented` |
| 20 | `editor-header.test.tsx` | `Unable to find an accessible element with the role "button" and name "Find in document"` (and Download, More actions, `Rename Plan`); `expected "vi.fn()" to be called with arguments: [ ObjectContaining{…}, undefined ]` |
| 21 | `superdoc-editor.test.tsx` | `TypeError: Cannot set properties of undefined (setting 'current')` |
| opening | `opening-document.test.tsx` | `AssertionError: expected 'flex items-center gap-2 border-b px-4…' to be 'flex h-13 items-center gap-2 border-b…'` |

The red commits of Steps 17, 20 and 21 do not typecheck on purpose: their tests call the new signatures and the stub is the old code. Step 22 is a pin (`editor-copy.test.ts`).
## G3 Edits panel (developer-3, branch `feat/final-visuals-g3`)

### What changed

- `features/timeline/use-panel-position.ts`: `PanelPosition`, `PANEL_POSITION_STORAGE_KEY` (`superdoc-collab.edits-panel`), `usePanelPosition()` returning `{ position, choosePosition, canChoose }`, `isPanelOpenByDefault()`. Below 1024 px the position is Bottom and `canChoose` is false. From 1024 px a stored value wins; with nothing stored it is Side from 1536 px and Bottom below, following `matchMedia` live. An unknown stored value is removed. Every storage call is in try/catch. A choice is written, then announced on a window event, so every hook instance in the tab follows (the panel and `document-page` each call the hook).
- `panel-position-toggle.tsx`: `PanelPositionToggle({ position, onChoose })`, a single-select `ToggleGroup` with `PanelBottom` and `PanelRight`. Pressing the chosen item again does not call `onChoose`.
- `timeline-panel.tsx`: new props `{ documentId, role, position, isOpen, onOpenChange, summarize, onTravel, onBackToLive }`. Exports `PanelState`, `PanelColumn` (`data-column` on the two bottom columns), and `SummarizeHandle` (`{ summarize, isRunning, outcome, error, retryAfterSeconds }`, mirrors G4's `SummarizeControl`). The header is the heading "Edits", the time zone label (hidden below `sm`), a spacer, the position toggle (open and `canChoose`) and the collapse button named `TIMELINE_TOGGLE_LABEL`. `data-position` and `data-state` are on the `aside`. Bottom open: `border-t`, height from `usePanelHeight`, row handle on the top edge, grid `minmax(0,1fr) 380px` from `md` (one scrolling column below), chart column (notices, filter, streamgraph) and list column (summary card, then bin edits or Top edits). Side keeps today's one column, 40 % width, min 420 px, and the rail when collapsed. Bottom collapsed renders `TimelineCollapsedBar` in place of header and body.
- `timeline-collapsed-bar.tsx`: 44 px bar with "Edits", the three largest topic chips (`bandsByVolume`, exported from `top-edits.tsx`) and an expand button. A chip sets the topic filter (it does not toggle) and calls `onExpand`.
- `use-panel-width.ts`: `usePanelHeight({ areaHeight })` (42 %, min 240, max area minus 240, follows the area until the first resize) and `useAreaHeight()`, a callback ref that measures the parent element of the `aside`.
- `resize-handle.tsx`: `ResizeHandle({ position, size, minSize, maxSize, resizeTo, resizeBy })`. Bottom is a row separator (`aria-orientation="horizontal"`, ArrowUp grows, ArrowDown shrinks, pointer size is window height minus `clientY`). Side is the old column handle.
- `contributor-avatars.tsx`: `AuthorAvatar({ author })` renders `UserAvatar` at 24 px with `authorColorSlot(authorColorKeyOf(author))`, the agent badge, title `importedAuthorLabel(name)` for a null id. `top-edits.tsx`: the topic sentence is a `topic-tint` callout (`bg-muted` for the Other band).
- `selection-summary-card.tsx`: props `{ view, summarize, canRequest, authors }`. Grouping shows a spinner, `GROUPING_TOPICS_MESSAGE` and muted `NEXT_SUMMARIZING_LABEL`. Summarizing shows a check, `TOPICS_GROUPED_LABEL`, a spinner and `SUMMARIZING_EDITS_MESSAGE`. `outcome === UpToDate` adds `SUMMARY_UP_TO_DATE_MESSAGE`. An error shows its message, with `retryInLabel(retryAfterSeconds)` appended when a cooldown is set (no Retry button during a cooldown). `author-of.ts` gained `authorNamed`.
- `timeline-notices.tsx` is unchanged: the panel passes `summarize.summarize` as `onRetry`.
- Mirrors for G4, to drop at the merge: `libs/types/src/timeline.ts` gained `SummarizeOutcome` and an optional `step` on `SelectionSummaryView` (0f0f8ce). G4 makes `step` required.
- Outside my list: `apps/web/src/lib/keyboard.ts` gained `ArrowUp` and `ArrowDown` (5a58dc1, its own commit).

## G4 Summarize job (developer-4, branch `feat/final-visuals-g4`)

### What changed

- `apps/server/src/insights/summarize-service.ts` (new) — `SummarizeService.request` decides from three staleness checks whether to start one job per document, answers with `SummarizeOutcome` (`Started`, `AlreadyRunning`, `UpToDate`, `Busy`, `Unavailable`), and the job runs regroup, selection summary, sentences in that order, setting `SummarizeStep` on the selection service and returning to `Idle` in a `finally`.
- `apps/server/src/insights/topics-service.ts` — gains `isStale` and `regroup`; loses `refresh`, `RefreshOutcome`, `TOPIC_REFRESH_COOLDOWN_MS`, the cooldown and `forget`.
- `apps/server/src/insights/summaries-service.ts` — `refreshStale` becomes `isStale` and `rewriteStale`; the read-path refresh, `SUMMARY_MIN_INTERVAL_MS`, the cooldown and `forget` are gone.
- `apps/server/src/insights/selection-summaries-service.ts` — keeps `request` for the agent tool; gains `isStale`, `write`, `setStep`, the per-document step, `view.step`; the cooldown uses `SUMMARIZE_COOLDOWN_MS`.
- `apps/server/src/insights/insights-routes.ts` — selection POST goes through `summarize.request`; the topics refresh route and the read-path refresh are removed.
- `apps/server/src/insights/last-sequence.ts` (new) — `lastSequenceOf`, shared by topics and summaries.
- Outside my list, forced by the removals: `apps/server/src/http/app.ts` and `apps/server/src/server.ts` (wire `summarize`), `apps/server/src/collaboration/collaboration-runtime.ts` (drops the two `forget` calls), `apps/server/src/documents/documents-routes.test.ts` (cooldown/forget test now covers the selection service only).
- `libs/types/src/timeline.ts` — G1 mirror (`SummarizeStep`, `SUMMARIZE_COOLDOWN_MS`, `SUMMARIZE_BUSY_MESSAGE`, `SelectionSummaryView.step`, commit e9350e1); `SELECTION_SUMMARY_COOLDOWN_MS` removed. The lead keeps G1's version at merge.
- `apps/web/src/features/timeline/summarize-edits-button.tsx` — takes `{ isRunning, onSummarize }`, never disabled, `aria-busy`, `Sparkles`, label `SUMMARIZING_LABEL` while running.
- `apps/web/src/features/timeline/use-selection-summary.ts` — polls while `state` is running or `step` is not idle.
- `apps/web/src/features/timeline/timeline-api.ts` — `SummaryTooSoonError` now carries `SUMMARIZE_BUSY_MESSAGE`.
- `apps/web/src/features/timeline/timeline-copy.ts` — `SUMMARIZING_LABEL` (G3 mirror, commit 4189579).
- `docs/adr/0031-…md` — Evidence line names the real tests.

### HTTP contract of `POST /api/documents/:id/summaries/selection`

| Answer | When | Body | Header |
|--------|------|------|--------|
| 202 | job started, or one already runs | selection view with `state: running`, `step: grouping` or `summarizing` | none |
| 200 | nothing is stale (summary cached, selection empty, topics fresh, sentences fresh) | selection view, `step: idle` | none |
| 429 | cooldown running, hourly call budget spent, or all worker slots taken | `{ error: SUMMARIZE_BUSY_MESSAGE }` | one `Retry-After`, seconds, the longer of the remaining cooldown and the model busy wait |
| 503 | model not configured | `{ error: <reason> }` | `Retry-After: 1` |
| 400 | bad query | `{ error: INVALID_TIMELINE_QUERY_MESSAGE }` | none |
| 403, 404 | reader, stranger | as before | none |

`POST /api/documents/:id/topics/refresh` answers 404. `GET /api/documents/:id/summaries` never calls the model.

### Red today, green after

| Test | Red before because | Green after because |
|------|--------------------|---------------------|
| `apps/server/src/insights/summarize-service.test.ts` (all 7) | `Cannot find module './summarize-service'` (45708c9) | b63b57f |
| `insights-routes.test.ts::POST /:documentId/topics/refresh no longer exists` | `expected 202 to be 404` (dd2b2b3) | 4116a80 |
| `insights-routes.test.ts::a full worker answers 429 with SUMMARIZE_BUSY_MESSAGE` and `::an exhausted hourly cap answers 429 …` | `expected 503 to be 429` | 4116a80 |
| `insights-routes.test.ts::a second POST inside the cooldown answers 429 with one Retry-After and SUMMARIZE_BUSY_MESSAGE` and `::a second POST with the same filter is 200 from the cache and another filter inside the cooldown is 429` | `expected { Object (error) } to deeply equal { Object (error) }` (the too-soon text) | 4116a80 |
| `insights-routes.test.ts::the Retry-After is the longer of the cooldown and the model's busy wait` | `expected '30' to be '90'` | 4116a80 |
| `insights-routes.test.ts::POST selection answers 202 with the running step while a job runs, started or already running` | the 202 view did not report `step: summarizing` | 4116a80 |
| `apps/web/src/features/timeline/use-selection-summary.test.ts::polls while step is not idle and stops at idle` | `expected +0 to be 2 // Object.is equality` (37132b0) | 78d63e5 |
| `apps/web/src/features/timeline/summarize-edits-button.test.tsx::is never disabled, and while running reads Summarizing… with aria-busy` | `expect(element).toBeEnabled()` received the button with `disabled=""` | 78d63e5 |

Pins, green when they landed: `insights-routes.test.ts::GET selection returns step idle when no job runs`, `::POST selection answers 200 and starts no job when nothing is stale`, and `selection-summaries-service.test.ts::uses SUMMARIZE_COOLDOWN_MS (30000)` (the G1 mirror already exported the constant).

The plan names `use-selection-summary.test.tsx`; the file is `use-selection-summary.test.ts`.
## G5 members and cursors (developer-5, branch `feat/final-visuals-g5`)

### What changed

- `apps/web/src/features/editor/use-member-cursors.ts`: `useMemberCursors({ superdoc, container })` returns `namesWithCursor` and `jumpTo(member)`; `JumpOutcome` is `Jumped` or `NotFound`. It reads `.v2-collaboration-overlay__remote-caret` elements whose `__remote-label` text equals the member name AND whose background colour equals the member's `--author-N` colour (the overlay DOM carries no user id, only `data-peer-rank`, label and colour); more than one match counts as none, follows the overlay with a `MutationObserver`, calls `scrollIntoView({ block: 'center' })` and adds `member-glow` to the `__remote-selection` elements inside the caret's parent for `CURSOR_GLOW_MS`.
- `members.tsx`: `Members({ members, currentUserId, superdoc, isPastVersion })`. Reason order: past version, self, offline, online without caret, else enabled. Disabled buttons use `aria-disabled` and stay focusable. Above five members: four avatars and a `DropdownMenu` named `moreMembersLabel(rest)` whose disabled items show the reason as secondary text. A `role="status"` region reads `movedToCursorMessage` or `cursorNotFoundMessage`. A failed jump holds the tooltip open with the not-found text for `JUMP_FAILED_NOTICE_MS`.
- `members-copy.ts` (new, one function `overflowCountLabel` for the visible "+N"); `globals.css` gets `.member-glow` (commit a8a1a2b, the lead keeps one copy with G1).
- `Members` finds the editor container with `document.querySelector('[data-testid="document-editor"]')` once `superdoc` is non-null, so G2 only passes `superdoc` and `isPastVersion`.

### How to run

```bash
cd apps/web
pnpm exec vitest run src/features/editor/document-title.test.tsx
pnpm exec vitest run src/features/editor/download-menu.test.tsx
pnpm exec vitest run src/features/versions/print-view.test.tsx
pnpm exec vitest run src/features/editor/editor-header.test.tsx
pnpm typecheck
```

Same pattern for `find-button`, `superdoc-options`, `superdoc-zoom`, `editor-toolbar-row`, `superdoc-editor`, `opening-document`, `document-page` and `editor-copy`.

### Known red today

- `document-page.test.tsx::a 409 not ready shows the owner message and never builds the editor`: it expects the retired notice; G6 replaced it. Step 23 rewrites it.
- `pnpm typecheck` in this lane: `timeline-panel.tsx` still passes the old Summarize props (G3 and G4 merge fixes it); `versions/version-viewer.tsx` and `versions/version-view-page.test.tsx` use the removed `followViewportZoom` and `NARROW_VIEWPORT_QUERY` and the removed `viewport` option. Neither file is in any group's ownership. Raised with the lead.
- `libs/types/src/constants.ts` declares `DOCUMENT_READY_POLL_MS` and `DOCUMENT_READY_GIVE_UP_MS` twice in the lane base (G1 merge plus a G1 mirror for G6), which fails every Vitest run. I removed the duplicate in my working tree only and never committed it.

### Hypotheses for the tester

1. At 1280 the right slot reads Members, Find, Use with AI, Share, Download, More actions, account, and at 375 the header is one row with the secondary actions inside More actions. Break it by: 320, 375, 640 and 2560 px, a 60-character title, a reader and an owner.
2. Clicking the title opens an input with the text selected; Enter saves and refocuses the title button; Escape restores; an empty value restores. Break it by: renaming while another tab renames, a failed save, tabbing away mid-edit.
3. Download PDF opens the browser print dialog with every page of a long document, one SuperDoc page per Letter sheet, with the toast hint visible until the dialog closes. Break it by: a 40-page document, a document with images and tables, Calibri text, pressing Download PDF twice, cancelling the dialog, then downloading again. This is the least proven part: the unit tests fake SuperDoc, the `requestAnimationFrame` loop and `window.print`; whether SuperDoc paints every page of an off-screen container 816 px wide and `pageCount × 1056` px tall is untested.
4. Find in document opens SuperDoc's Find bar, and Cmd+F does too. Break it by: pressing Find before the editor is ready (nothing happens).
5. The toolbar hides accept, reject, ruler, measurement unit, document mode, search, linked styles, copy format, clear formatting and ai, and shows the rest. Break it by: reading the real toolbar at 320 to 2560 px.
6. The page is centred and fitted to the width at every width and never grows past 100 %. Break it by: choosing a zoom in the toolbar and then resizing the window.
7. The page stays white in dark mode and a remote caret matches that member's avatar colour. Break it by: two browsers, a user whose slot collides with another.
8. The editor header never shows a download that fails silently: a DOCX export failure shows `EXPORT_FAILED_MESSAGE` under the bar (still the page's job).

### Review fix: empty selection and the outcome across selections

- An empty selection or a document with no edits answers `UpToDate` with no summary; the card now says `NO_EDITS_TO_SUMMARIZE_MESSAGE` instead of "The summary is up to date." (red, then green: `selection-summary-card.test.tsx::an empty selection answered up to date shows the empty message…`).
- `useSummarize` (G4's file, one authorized edit) resets its mutation when the selection query key changes, so the outcome and error belong to the selection (`use-summarize.test.tsx::the outcome belongs to the selection: another bin does not inherit it`; red `expected 'up-to-date' to be null`).
- Hypothesis: after Summarize answers up to date on one bin, another bin or topic shows its own view with no up-to-date line. Break it by: switching bin, topic and filter right after the answer, and while a request is in flight.

### Review fix: one selection source

- `useSummarize` posts the selection the panel shows, not the URL. `SummarizeControl` gained `showSelection(selection)`; the panel calls it whenever its selection (filter, topic, selected bin) changes, so a bin without a version, or a click inside the scrub debounce gap, posts what the card shows. The URL selection is used until the panel has reported one.
- Tests: `use-summarize.test.tsx::a click during the scrub debounce gap posts the selection the panel shows, not the URL` (red `expected null to be '1792165200007'`), `timeline-panel.test.tsx::the panel tells the summarize control which selection it shows…` (red `expected last "vi.fn()" call to have been called with …`).
- The panel takes G4's `SummarizeControl`; the local `SummarizeHandle` and the dead Regroup copy are gone.
- Hypothesis: select a bin with no version mark, press Summarize at once, and the POST and the card both name that bin. Break it by: clicking Summarize right after a click on the chart, during a scrub, and with the panel collapsed.

### Known gaps

- Share is not primary and not an icon below `sm`: `share-dialog.tsx` is not in G2's ownership.
- The "Loading document…" reason is still the page's loading paragraph; `LOADING_DOCUMENT_REASON_ID` is exported for Step 23 to put on it, and Download stays disabled after that paragraph is gone, until SuperDoc's `onReady`.
- The print view fails (toast) when the last page has no text after 600 frames; a document whose last page is an image only would fail that way.
- Nothing here was seen in a browser.
pnpm install --frozen-lockfile
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline/use-panel-position.test.tsx
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline/panel-position-toggle.test.tsx
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline/use-panel-width.test.ts
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline/resize-handle.test.tsx
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline/contributor-avatars.test.tsx
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline/top-edits.test.tsx
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline/timeline-collapsed-bar.test.tsx
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline/selection-summary-card.test.tsx
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline/timeline-panel.test.tsx
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline/timeline-notices.test.tsx
pnpm --filter @superdoc-collab/web test:unit src/features/editor/use-member-cursors.test.ts
pnpm --filter @superdoc-collab/web test:unit src/features/editor/members.test.tsx
```

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `use-panel-position.test.tsx` six tests (658fe49) | `Error: usePanelPosition is not implemented` | hook implemented (3baf323) |
| `…::the panel starts collapsed below 1024 px and open from it` (ae0d012) | `Error: isPanelOpenByDefault is not implemented` | 51f1715 |
| `panel-position-toggle.test.tsx` two tests (cb9c8bb) | `Failed to resolve import "./panel-position-toggle" … Does the file exist?` | component added (c290301) |
| `use-panel-width.test.ts` two tests (428abac) | `Error: usePanelHeight is not implemented` | hook implemented (b181062) |
| `resize-handle.test.tsx::the row handle is a separator with aria-orientation horizontal…` (bbce3b6) | `Expected the element to have attribute: aria-orientation="horizontal"` `Received: aria-orientation="vertical"` | 114ec7b |
| `…::the row handle measures the pointer from the bottom of the window` | `expected "vi.fn()" to be called once with arguments: [ 300 ]`, got `1024` | 114ec7b |
| `…::the column handle stays vertical…` | pin, green when it landed | |
| `contributor-avatars.test.tsx::AuthorAvatar renders UserAvatar in the author colour…` (8ae842a) | `received value must be an HTMLElement or an SVGElement. Received has value: null` | cd506b1. Changed: the green run first printed `Expected element to have text content: CC  Received: C` for the name `' Chris Crawford '`, a code bug (untrimmed name), fixed in the same commit |
| `…::an agent shares its person colour` | `Expected the element to have class: bg-author-4  Received: absolute -right-1 -bottom-1 rounded-full bg-primary p-0.5 text-primary-foreground` | cd506b1 |
| `top-edits.test.tsx::each topic callout has the tinted background token` | `Expected the element to have class: topic-tint  Received: text-sm` | cd506b1 |
| `timeline-collapsed-bar.test.tsx` four tests (9424c90) | `Failed to resolve import "./timeline-collapsed-bar"` | component added (0b38d62) |
| `selection-summary-card.test.tsx` seven of fifteen (067dd28): the avatar title and colour, grouping and summarizing steps, request in flight, up to date, error with Retry summary, cooldown | `Unable to find an element with the title: Bob · AI.`, `…with the text: Grouping edits into topics….`, `…with the text: The summary is up to date.`, `Unable to find an accessible element with the role "button" and name "Retry summary"` | 0a73007 |
| `timeline-panel.test.tsx` eleven of thirty-nine (79c12a7): heading and no header buttons, collapse button, Side attributes, bottom columns, row handle, collapsed bar chip, position toggle stores, Side rail, Retry runs the job, failed summary retry, two same-name avatars | `expected document not to contain element, found <button`, `Unable to find role="alert"`, `Expected the element to have attribute: data-position="side"`, `expected null not to be null`, `aria-orientation="horizontal"`, `expected "vi.fn()" to be called once with arguments: [ true ]`, `Unable to find role="radiogroup" and name "Panel position"`, `expected "vi.fn()" to be called 1 times, but got 0 times`, `Unable to find an element with the title: Ana.` | c8ba6b6. Changed: the row-handle test stubs `getBoundingClientRect` to give the area a height, because an area of 0 px has no room to grow |
| `timeline-panel.test.tsx` the other 28 tests (79c12a7) | pins of behaviour kept: they were ported to the new props and passed on arrival | |
| `timeline-notices.test.tsx` two tests (342344a) | pin, green when it landed | |

The panel tests that drove the removed header buttons (Summarize disabled reasons, Regroup, topic refresh, cooldown notices) were deleted with the code. The cooldown and error cases live on the card tests, and the never-disabled button belongs to G4.

### Hypotheses to attack

1. Hypothesis: from 1024 px the toggle stores the choice at once and a reload keeps it; below 1024 px the panel is always at the bottom even with Side stored, and the toggle is hidden. Break it by: choose Side at 1280, reload, shrink to 900, grow back; store `floating` in localStorage by hand; block storage in a private window.
2. Hypothesis: with nothing stored the panel is beside the page from 1536 px and below it under the page, following the window live. Break it by: dragging the window across 1536 with nothing stored, then with a stored choice.
3. Hypothesis: the bottom panel's height is 42 % of its parent, never below 240 or above the parent minus 240, and the row handle moves it with the pointer and with ↑ ↓. Break it by: heights of 400, 667 and 1440 px; dragging past both limits; resizing the window while dragged.
4. Hypothesis: from 320 to 2560 px nothing scrolls horizontally: the grid is one column below 768 px, chips in the collapsed bar truncate, the filter box fills the width below 768 px and is 18 rem wide above. Break it by: 320, 375, 767, 768, 1023, 1024, 1535, 1536, 2560, in light and dark, with long topic names and long author names.
5. Hypothesis: each bottom column scrolls on its own from 768 px; below it the whole body scrolls as one. Break it by: many topics with a long summary and a selected bin with many runs.
6. Hypothesis: collapsed at the bottom the bar shows the three largest topics by edit volume, a chip click filters by that topic and opens the panel, and the expand button opens it. Break it by: a document with one topic, none, two topics of equal volume, a topic that is already filtered, a document that loads slowly.
7. Hypothesis: collapsed at the side the rail is as before and shows no chips. Break it by: collapsing at 1600 px and reloading.
8. Hypothesis: every avatar is the person's colour, the same in the header, Top edits, the bin edits and the summary card; an AI shares its person's colour and keeps the badge; a DOCX author with no account reads "Name, imported from the DOCX". Break it by: two people with the same name, an AI and its person in one summary, a person who has since left the document.
9. Hypothesis: the tinted callout is readable in light and dark and follows the topic hue. Break it by: measuring contrast of the text on the tint in both themes, for the yellow and orange topics.
10. Hypothesis: the card shows the grouping step and then the summarizing step, "up to date" with the sentence, an error with Retry summary, and a cooldown with the seconds and no Retry. Break it by: running Summarize with the model slow, with nothing stale, with the model failing, twice within the cooldown.
11. Hypothesis: the card is announced once per change (`aria-live="polite"`) and a cached summary never scrolls the page. Break it by: a screen reader pass and by opening the panel with a cached summary.

### Known gaps

- The summary card resolves a summary author by name and actor among `timeline.authors` (`authorByName`, owner decision). A name not found is coloured and titled as an imported author, never a throw. Two people with the same name resolve to the first one. An `id` on `SummaryAuthor` would remove the lookup.
- The chart hint ("Click the chart or use ← → …") is still drawn by `Streamgraph` under the chart, not on one line with the filter. `streamgraph.tsx` is not in my list.
- The bottom panel defaults to 58 % of the area below 640 px (`useIsCompact`, `COMPACT_PANEL_HEIGHT_SHARE`) and 42 % from it. Hypothesis: crossing 640 px with no manual resize switches the height; after a resize the chosen height holds. The panel test's `getBoundingClientRect` stub now yields 580 because jsdom reports no match for any media query.
- `useAreaHeight` measures the parent of the `aside`. G2 must give that parent a definite height that holds the editor and the panel (a flex column with `min-h-0`), or the panel stays at 240 px.
- While the panel is collapsed at the bottom the timeline is still fetched and polled, because the chips need it. Side collapsed stops the polling as before.
- `isPanelOpenByDefault()` is the answer for G2's initial `isOpen` (`useState(isPanelOpenByDefault)`); I do not own the state.
- `top-edits.tsx` has its own `calloutStyleOf` that repeats the swatch's hue and saturation style. `topic-swatch.tsx` is not mine; one shared helper would remove it.
- G2 passes G4's hook result as is; the panel's prop type is `SummarizeControl`.
- Dead after this lane, for G4 Step 39: `useSummarizeEdits` in `use-selection-summary.ts`, `summarizeDisabledReason`, `errorForSelection` and `selectionVolume` in `selection-summary.ts`, `use-topics.ts`, `SummaryTooSoonError` in `timeline-api.ts` and the unused copy constants.
- `apps/web/src/features/editor/document-page.tsx` does not typecheck until G2 passes `position`, `isOpen`, `onOpenChange` and `summarize`; it is the only typecheck error.
- On the integration base, `libs/types/src/constants.ts` declared `DOCUMENT_READY_POLL_MS` and `DOCUMENT_READY_GIVE_UP_MS` twice, which stopped every run that imports `@superdoc-collab/types`; I removed the second pair in my working tree only and did not commit it.
- Nothing here was seen in a browser. Real layout, scrolling, the 42 % height, pointer dragging, focus rings and contrast are untested beyond jsdom.
## G7 pages and Use with AI (developer-7, branch `feat/final-visuals-g7`)

### What changed

- `documents-page.tsx`, `settings-page.tsx`, `connected-apps-page.tsx` and `admin-page.tsx` use `AppTopBar` with `AccountMenu`. The loose links, the user name, the "Documents" back link and `SignOutButton` left every header.
- Documents header right slot: `UseWithAiDialog` (title `null`, so the library prompts) then `AccountMenu`. In the Mine section "Upload .docx" is the default `Button` (primary) and "New document" is `variant="outline"`.
- `use-with-ai-dialog.tsx` is new. Props: `{ title: string | null; canEdit: boolean; trigger?: ReactNode }`. `title === null` shows `LIBRARY_PROMPTS`; otherwise `documentPrompts({ title, canEdit })`. Without `trigger` it renders an outline `Button` with `Bot` and `USE_WITH_AI_LABEL`; with `trigger` that node is the `DialogTrigger` child (it must forward a ref and props, so a plain element or a `Button`, never a function component that drops them).
- `connect-snippets.tsx` exports `ClientSnippet({ client })`, used by the dialog's tab panels and by the page's `ConnectSnippets`.
- Focus returns to the trigger through Radix's own `DialogTrigger`; no `onCloseAutoFocus` was needed. G2 must add one only if its trigger lives in More actions and unmounts when the menu closes.
- `sign-out-flow.test.tsx` signs out through the account menu.

### How to run

One file at a time: `pnpm exec vitest run src/features/<path>.test.tsx` from `apps/web`.

### Red today, green after

| Step | Test | Red text | Red | Green |
|---|---|---|---|---|
| 51 | `documents-page.test.tsx` header and Use with AI | `Unable to find role="button" and name "Account, Ada"` | f050f13 | 7e45459 |
| 52 | `settings-page.test.tsx` header | `Unable to find an accessible element with the role "button" and name "Account, Ada"` | 24ff1b8 | c0af70a |
| 52 | `connected-apps-page.test.tsx` header | `Unable to find an accessible element with the role "link" and name "SuperDoc Collab, back to documents"` | 24ff1b8 | bcee930 |
| 53 | `admin-page.test.tsx` header | `Unable to find role="button" and name "Account, Ada"` | 66e2900 | b35e00d |
| 54 | `use-with-ai-dialog.test.tsx` | stub threw `UseWithAiDialog is not implemented`; 6 of 7 failed with `Unable to find role="dialog" and name "Use this document with your AI"` | fafec05 | 6c0a3ae |
| 55 | `connected-apps-copy.test.ts` | pin, green on landing | 5e3a015 | |
| | `sign-out-flow.test.tsx` through the account menu | pin | 76bb92d | |

### Hypotheses to attack

1. Hypothesis: the documents header is one row from 320 to 2560 px and nothing is pushed off screen. Break it by: resizing through 320, 375, 639, 640 and 1280 with a long user name.
2. Hypothesis: the dialog is never wider than the viewport minus 32 px, is 560 px from `sm`, and scrolls inside the viewport at 375 (Claude Code snippet tab, then Cursor, whose JSON is the tallest). Break it by: 375 x 667, and a 320 x 480 viewport in landscape.
3. Hypothesis: opening the dialog focuses the first tab and Escape returns focus to the Use with AI button. Break it by: keyboard only, then a pointer open and a Close button click.
4. Hypothesis: "Manage connected apps" navigates to the Connected apps page and the dialog is gone there. Break it by: clicking it, then browser Back.
5. Hypothesis: the account menu is the only way to Sign out, Settings, Connected apps and Admin from these four pages. Break it by: signing in as an admin and as a user.
6. Hypothesis: Upload .docx is visibly the primary action and New document the outline one, in light and dark. Break it by: measuring contrast of the primary fill in dark mode.

### Known gaps

- `libs/types/src/constants.ts` on the integration base declared `DOCUMENT_READY_POLL_MS` and `DOCUMENT_READY_GIVE_UP_MS` twice, which made every test that imports `@superdoc-collab/types` fail to parse. I removed the duplicate lines only in my working tree to run the loop and did not commit it; the lead owns the fix.
- `BACK_TO_DOCUMENTS_LABEL` in `connected-apps-copy.ts` and `SignOutButton`, `HomeLink` are now unused; G8 deletes them (copy file was additions-only for G7).
- The dialog shows no MCP URL snippet of its own; the ChatGPT tab is the URL. The Connected apps page still lists the URL snippet.
- Nothing here was seen in a browser; widths, scrolling and real focus are untested beyond jsdom.
pnpm --filter @superdoc-collab/server exec vitest run src/insights src/documents/documents-routes.test.ts src/agent
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline/summarize-edits-button.test.tsx src/features/timeline/use-selection-summary.test.ts src/features/timeline/timeline-api.test.ts
```

### Hypotheses to attack

1. Hypothesis: a click on Summarize with fresh topics, summary and sentences makes zero model calls and answers 200. Break it by: click twice in a row with one selection, count calls in the server log.
2. Hypothesis: topics are regrouped only when the last compute failed or `computedAtSequence` is older than the newest edit. Break it by: edit one block inside an existing topic and click; then click again with no edit.
3. Hypothesis: the card sees `grouping` then `summarizing` then `idle` while polling. Break it by: slow the model and watch the GET selection answers.
4. Hypothesis: a second click inside 30 s on a stale selection answers 429 with one `Retry-After` and one message, whatever the underlying wait. Break it by: click, change the filter, click again; exhaust the hourly cap and repeat.
5. Hypothesis: a failed regroup leaves the previous topics and bands in place. Break it by: make the model fail on the topics call and compare the chart before and after.
6. Hypothesis: deleting a document clears the cooldown and the step. Break it by: start a job, delete the document, create another.

### Known gaps

- Pending G3 merge (Step 39): `use-topics.ts`, `refreshTopics`, `TopicsRefreshTooSoonError`, and in libs/types `topicsRefreshApiPath`, `REFRESH_SEGMENT`, `TOPICS_REFRESH_TOO_SOON_MESSAGE` stay because `timeline-panel.tsx` imports them. After G3 lands, delete them and their tests (`timeline-api.test.ts`, `libs/types/src/routes.test.ts`, `timeline-panel.test.tsx`).
- G3 files that must change to compile after the merge: `timeline-panel.tsx` (pass `isRunning` from `view.step !== idle` or the mutation pending state to `SummarizeEditsButton`; drop `disabledReason`, `reasonId`, the Regroup button, `useRefreshTopics`, `regroupDisabledReason`), `timeline-notices.tsx` (its retry used `refreshTopics.mutate`; point it at Summarize), `selection-summary-card.tsx` (show "Grouping edits into topics…" and "Summarizing edits…" from `view.step`; `SummaryTooSoonError` now carries `SUMMARIZE_BUSY_MESSAGE`), and their tests. Eight `timeline-panel.test.tsx` tests fail today because they expect a disabled button and the refresh message; `timeline-panel.test.tsx`, `selection-summary-card.test.tsx`, `selection-summary.test.ts`, `document-page.test.tsx` and `time-travel.test.tsx` fixtures need `step: SummarizeStep.Idle` to typecheck.
- `e2e/timeline.spec.ts` still has "Regroup topics recomputes the names from the current text"; G8 owns it.
- A document with no topic status yet is not stale for the job: the first computation stays with the GET topics `ensure`. A topic set still computing is also not stale.
- A failed regroup does not stop the job: the selection summary and the sentences still run on the previous topics.
- The selection summary only goes stale on a regroup for topic selections, because only they stamp `topicsUpdatedAt`.
- The agent tool `summarize_selection` still calls `selection.request` and keeps its own too-soon message; it does not run the Summarize job.
- No test drives the full browser flow; the tester walks it.

### G4 update after the plan review (commits 9fd322d red, d969633 red, next green)

- The POST body is the selection view plus `outcome` (`started`, `running`, `up-to-date`); 202 for `started` and `running`, 200 for `up-to-date`. Refusals stay 429 and 503. `SummarizeOutcome` and `SummarizeResponse` live in `libs/types/src/timeline.ts`; the service-only refusals are `SummarizeRefusal` in `summarize-service.ts`.
- Sentences are stale when older than the topic set (their `computedAtSequence` is below the topic set's); a rewrite stamps the topic set's sequence. The spec's "newest run" wording is dropped.
- A failed regroup sets the view failure to `GROUPING_FAILED_MESSAGE` (in libs/types, not `timeline-copy.ts`, because the server writes it) until the next Summarize; a failed selection summary keeps `SELECTION_SUMMARY_FAILED_MESSAGE`. There is no separate `SUMMARIZING_FAILED_MESSAGE`.
- The MCP tool `summarize_selection` now calls the Summarize service and answers `SUMMARIZE_BUSY_MESSAGE`.
- New hook `apps/web/src/features/timeline/use-summarize.ts` (`useSummarize({ documentId })` returning `summarize`, `isRunning`, `outcome`, `error`, `retryAfterSeconds`). `useSummarizeEdits` and `summarizeDisabledReason` are gone; `timeline-panel.tsx` (G3) still imports them, so `timeline-panel.test.tsx`, `document-page.test.tsx` and `time-travel.test.tsx` fail at render until G3 lands.
- The button is enabled when idle; while running it is disabled, reads Summarizing…, has `aria-busy`.
- `step: SummarizeStep.Idle` added to every view fixture in web tests.
- Kept for G3: `SELECTION_SUMMARY_COOLDOWN_MS`, `use-topics.ts`, `refreshTopics`, `topicsRefreshApiPath`, `REFRESH_SEGMENT`, `TOPICS_REFRESH_TOO_SOON_MESSAGE`.
- Wiring edits outside my list: `apps/server/src/http/app.ts` (`summarize` in `InsightsServices`), `apps/server/src/server.ts` (builds the service), `apps/server/src/collaboration/collaboration-runtime.ts` (removed the topics and summaries `forget` calls).
- Gap: `SelectionSummariesService.request` and its tests remain although no route or tool calls it any more.

### G4 folded tests: `SelectionSummariesService.request` removed

`request`, `SelectionRequestOutcome`, `SelectionRequestResult` and the per-selection job key are gone. Tests that only drove `request` were ported to `write`, `isStale` and `read` (still in `selection-summaries-service.test.ts`, green pins) or deleted. For mutation checks, break the covering test's rule and expect the covering test to fail:

| Deleted test | Rule it pinned | Surviving test that covers it |
|---|---|---|
| the cooldown is shared by every filter of one document | one cooldown per document, another document free | `insights-routes.test.ts::a second POST inside the cooldown answers 429 with one Retry-After and SUMMARIZE_BUSY_MESSAGE` (other filter, same document) |
| a second request while one runs is free | a running job spends no second call | `summarize-service.test.ts::a second request while the job runs is already running and spends no second call` and `insights-routes.test.ts::POST selection answers 202 with the running step while a job runs, started or already running` |
| a request over the hourly cap is busy and writes nothing | no call over the cap | `insights-routes.test.ts::an exhausted hourly cap answers 429 with the seconds until a slot frees`; the ported `a write over the hourly cap writes nothing` covers the write side |
| TooSoon halves of `a new edit marks the summary stale…`, `a topic recompute makes the summary stale`, `a model failure is stored…`, `after a failure at an unchanged stamp…` | cooldown refusal | the same routes cooldown test and `the Retry-After is the longer of the cooldown and the model's busy wait` |
| the `Cached` and `Empty` outcome assertions | nothing stale means no call | `summarize-service.test.ts::makes no model call when topics, summary and sentences are fresh` and `insights-routes.test.ts::POST selection answers 200 and starts no job when nothing is stale` |
| agent tool busy and too-soon paths | busy answer for the MCP tool | `agent-tools.test.ts::summarize_selection answers busy with retryAfterSeconds` and `::summarize_selection starts the summary and then reads it, and the cooldown answers with retryAfterSeconds` |
## G8 E2E and docs (developer-8, branch `feat/final-visuals-g8`)

### What changed

- `e2e/final-visuals.spec.ts` (new, 22 tests): top bar and toolbar row, rename with Enter and Escape, Download docx, Download PDF with `window.print` stubbed, theme across reload, the version frame following the theme, panel position at 1280 and 1536, the collapsed bar at 375, Summarize (steps then `Try again in N s.`, and up to date), jump to a member's caret and the offline reason, the waiting page, the Use with AI dialog, and one test per width of 320, 375, 768, 1024, 1280, 1536, 1920 and 2560 in light and dark.
- `e2e/editor.ts`: `topBar`, `toolbarRow`, `brandLink`, `accountTrigger`, `titleButton`, `downloadButton`, `downloadOptionsButton`, `chooseTheme`, `signOut`, `REMOTE_CARET_SELECTOR`. `e2e/timeline.ts`: `summarizeButton` now lives inside the toolbar row; `waitForSummarizeResponse`.
- Moved specs: `timeline.spec.ts` (the Regroup test became "Summarize edits regroups the topics from the current text"), `topics-on-open.spec.ts` (title only: it had no refresh to drop), `selection-summary.spec.ts` (the cached-summary test clicks Summarize and expects "The summary is up to date." with no new model call instead of a disabled button), `documents.spec.ts` (waiting page text, title button, Download button), `time-travel.spec.ts` (reader has no toolbar row, new test that the toolbar container is `inert` in a version while Summarize stays live), `auth.spec.ts` (Sign out through the account menu).
- Docs: `.claude/rules/web-ui.md` (theme, panel position, toolbar, Find, print view, `user.color`, jump route), three `Revisited` lines, `docs/scenarios/core-realtime.md` (T4 says Summarize edits).
- Commits: `627bc97` (new spec and helpers), `8cf3211` (moved specs), `df1cefb` (docs), then the viewport fix for the jump test and this briefing.
- Step 59 is pending the G7 merge: `home-link.tsx` and `sign-out-button.tsx` are not deleted yet.

### How to run

Filter by the file path, not by the word `final-visuals`: the checkout path contains that word, so a bare filter selects the whole suite.

```
pnpm exec playwright test e2e/final-visuals.spec.ts
```

### Red today, green after (run on G1 + G6 only, `--timeout=30000`)

| Test | Red text today | Goes green when |
|------|----------------|-----------------|
| top bar and toolbar row | `getByRole('banner').getByRole('button', { name: 'Rename Final visuals …' })` not found | G2 |
| title renames on Enter, Escape restores | same locator, test timeout while waiting for the title button | G2 |
| Download docx | waiting for `getByRole('button', { name: 'Download', exact: true })` | G2 |
| Download PDF | waiting for `getByRole('button', { name: 'More download formats' })` | G2 |
| Dark in the account menu, version frame follows | waiting for `getByRole('banner').getByRole('button', { name: 'Account, Ana' })` | G2 and G7 |
| panel at the bottom at 1280, at the side at 1536 | `locator('aside[data-position]')` not found | G3 |
| collapsed bar at 375 | `getByTestId('timeline-collapsed-bar')` not found | G3 |
| Summarize steps and cooldown, up to date | waiting for `getByTestId('editor-toolbar-row').getByRole('button', { name: 'Summarize edits' })` | G2 and G4 |
| jump to a member's caret | `.v2-collaboration-overlay__remote-caret` was in the viewport before the click (the precondition was wrong at 800 px height; fixed by a 480 px viewport, not rerun) | G5 |
| waiting page enters on its own | `getByText('Preparing the document…')` not found | G2 |
| Use with AI dialog | waiting for `getByRole('button', { name: 'Use with AI' })` | G2 and G7 |
| eight width tests | `getByRole('banner').getByRole('button', { name: 'Account, Ana' })` not found | G2 and G7 |

Moved specs, not run red on purpose; they depend on:

- `timeline.spec.ts` (Summarize in the toolbar row), `selection-summary.spec.ts`, `time-travel.spec.ts` (toolbar row, inert container): G2 and G4.
- `documents.spec.ts` (waiting text, title button, Download button): G2.
- `auth.spec.ts` (Sign out in the account menu): G2 and G7.
- `topics-on-open.spec.ts`: title only, stays green.

The one full-suite attempt (killed early, first filter mistake) showed `auth.spec.ts` sign-out, `documents.spec.ts` rename and waiting, `selection-summary.spec.ts` summarize and `time-travel.spec.ts` inert failing, as expected.

### Hypotheses to attack

1. Hypothesis: after the merges every `final-visuals.spec.ts` test is green in one run with parallel workers. Break it by: running with `--workers=4` and a loaded machine.
2. Hypothesis: the Summarize steps are observed in order when they are observed at all. Break it by: a slower fake model; the test accepts zero, one or both step messages because the fake model answers instantly.
3. Hypothesis: the second Summarize click on a stale selection answers 429 with `Retry-After` and the card reads `Try again in N s.`. Break it by: waiting past 30 s before the second click.
4. Hypothesis: the top bar's top edge is 0 on every animation frame from the first one with a header, at all eight widths and after Dark. Break it by: slow fonts, a cold cache.
5. Hypothesis: the jump button scrolls Bruno's drawn caret into view in a 480 px tall window and the offline reason is the accessible description. Break it by: a 3-page document where Bruno's page is virtualized for Ana.

### Known gaps

- `e2e/tsconfig.json` has no `@/*` path, so `pnpm typecheck:e2e` fails on `apps/web/src/features/account/account-copy.ts` (`Cannot find module '@/lib/use-theme'`). Playwright resolves it at runtime. Fix is G1's: import `./../../lib/use-theme` relatively in `account-copy.ts`, or add the path to the e2e tsconfig.
- `PANEL_POSITION_STORAGE_KEY` does not exist yet in `use-panel-position.ts` (G3); `pnpm typecheck:e2e` reports it until the merge.
- No test reads the print view container height (page count times 1056 px): its selector is not in the tester briefing. The PDF test checks that `print` ran once, that the preparing toast showed, and that no `.superdoc-page` was empty at that moment.
- The cooldown test takes two real model-backed clicks inside 30 s of each other; nothing isolates the fake model's process-wide counters, so none is asserted.
- "Waiting page pauses and resumes" (test plan) is not an E2E here: it needs a five minute clock.
- Nothing here was seen in a browser after the merges.

### G2 Step 23: integration (red fa48cb2, green ef27dfd)

- `document-page.tsx` now: calls `useSummarize` once and `usePanelPosition`, holds the panel `isOpen` (starts from `isPanelOpenByDefault`), mounts `EditorToolbarRow` with the toolbar container held in state, and renders `SuperDocEditor` only once the container exists (readers have no row and wait for nothing). Summarize opens the panel and then runs. `UseWithAiDialog` plugs in through `renderUseWithAi`. A non-Ready readiness, and a members 404, render `WaitingForDocument`; `UnavailableNotice` is no longer imported (G6 Step 50 can delete it). The page layout is a column at the Bottom position and a row from 1024 px at the Side position.
- The red run printed `TypeError: Cannot read properties of undefined (reading 'collapsed')` (the panel got no position); the test mock matched the timeline and summaries routes by exact path, so it now matches before the query string.
- Version viewer (0ccf7d3, lead option A): it passes no toolbar, takes the author palette from the new `author-palette.ts` and fits the width at every width. `followViewportZoom`, `initialZoomMode` and `NARROW_VIEWPORT_QUERY` are gone. Share is now the primary button.
- Gap: `WaitingForDocument` (G6's file) still draws its own placeholder header, not `AppTopBar`, so the bar can jump between the waiting page and the editor.
- Gap: `renderUseWithAi` is a render prop; the title passed to the dialog is the current document title.
- `pnpm typecheck` is clean in this lane. Only single test files were run; no package suite.
| `use-member-cursors.test.ts` five tests (e222bc2) | `Error: useMemberCursors is not implemented` | hook implemented (394f101) |
| `members.test.tsx` eight tests (9ccaf5b) | `TestingLibraryElementError: Unable to find role="button" and name "Go to Bruno’s cursor"`, `Unable to find an accessible element with the role "button" and name "Ana, online"`, `...with the role "button" and name "2 more people"` | component rewritten (4bf160a). One assertion in the last test was corrected in the green commit: the tooltip stays open on focus, so it now asserts the not-found text is gone, not the tooltip |

### Hypotheses to attack

1. Hypothesis: a click on an enabled avatar centres the remote caret and the selection glows for 1.2 s, with focus staying on the avatar. Break it by: two browsers, one far down a long document, then the second browser on a virtualized page.
2. Hypothesis: the enabled state follows carets appearing and leaving. Break it by: the other user clicks in and out of the document, switches tab, or selects text.
3. Hypothesis: every disabled avatar shows its reason on keyboard focus. Break it by: Tab through the header, a past version, and a user who is offline.
4. Hypothesis: with six or more members the menu lists the rest with reasons and a jump from the menu works. Break it by: Escape, arrows, and a member whose caret left while the menu was open.
5. Hypothesis: a peer who renames themselves to another member does not make that member jumpable, unless the colour is forged too. Break it by: two accounts with identical names, and a console edit of the awareness user.

### Known gaps

- `editor-header.tsx` still calls `Members` without the two new props: typecheck and `editor-header.test.tsx` fail until G2's merge wires `superdoc` and `isPastVersion`.
- The glow targets every `__remote-selection` inside the caret's parent element. If SuperDoc puts all users' selections in one shared layer, all of them glow; the real DOM needs the browser walk.
- A failed jump from the "+N" menu is only announced in the status region; the menu has closed, so there is no tooltip.
- No user id reaches the overlay DOM, so a peer who forges both name and colour can still hijack a jump (limit recorded in `.claude/rules/web-ui.md`). Two members with the same name and colour make both unjumpable. A name SuperDoc truncates or decorates reads as "not in the document". `hasCursor(member)` replaced `namesWithCursor`; `authorColorOf` in G2's `author-palette.ts` is now exported (one word).
- Nothing here was seen in a browser; Radix tooltip and menu behaviour were exercised in jsdom only.
- Found on the integration branch: `libs/types/src/constants.ts` declares the two document-ready constants twice; I removed the duplicates only in my worktree, uncommitted.

### G4 security minors (red 5293de5)

- `summarize_selection` (MCP, `history:read` token) runs `SummarizeScope.SummaryOnly`: it writes the selection summary and never regroups topics or rewrites sentences. Tests: `agent-tools.test.ts::summarize_selection never regroups the topics, even when they are stale` and `summarize-service.test.ts::the summary-only scope writes the summary and leaves stale topics and sentences alone`. Red was `expected "regroup" to not be called at all` and `[topics, summary, sentences]` instead of `[summary]`.
- `TopicsService.regroup` goes through the `topics:<id>` job key: it starts the job when none runs and awaits `InsightsJobRunner.settled(key)` either way, so an editor's Summarize and an automatic recompute share one model call. Test: `topics-service.test.ts::a regroup awaits the topics job that is already running and the model is called once` (red: 3 calls).
- Side effect: the regroup now holds a second process-wide job slot while the Summarize job waits on it, so a full worker answers the regroup busy sooner than before.
- `SELECTION_SUMMARY_TOO_SOON_MESSAGE` deleted from `libs/types` (no consumer).

### G6 addendum: "The document is ready." announcement

- `readiness-announcement.tsx` renders a persistent polite `role="status"` region (visually hidden) above every state of `DocumentPage` (opening, waiting, error, editor). It fills with `DOCUMENT_READY_ANNOUNCEMENT` only when the readiness moves from `Waiting` or `Paused` to `Ready`. `document-page.tsx` wraps its four returns in one helper so the region keeps its identity across states.
- Red `095d5f3`: `moving from Waiting to Ready announces that the document is ready` and the Paused variant fail on `toHaveTextContent`; `a document that opens Ready at once announces nothing` is a pin. Green is the commit after it.
- `document-page.test.tsx::the header stays while the document opens` now finds its status region by text, because the page has a second status region.
- Hypothesis: a screen reader says "The document is ready." once when a waiting page gives way to the editor, and says nothing when a document opens at once. Break it by: a screen reader pass of both entries; a reload on the editor; Keep waiting then ready.
- Gap: no page-level test drives Waiting to Ready through `DocumentPage`; the unit tests cover the component only.
