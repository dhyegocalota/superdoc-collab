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

### Known gaps

- Share is not primary and not an icon below `sm`: `share-dialog.tsx` is not in G2's ownership.
- The "Loading document…" reason is still the page's loading paragraph; `LOADING_DOCUMENT_REASON_ID` is exported for Step 23 to put on it, and Download stays disabled after that paragraph is gone, until SuperDoc's `onReady`.
- The print view fails (toast) when the last page has no text after 600 frames; a document whose last page is an image only would fail that way.
- Nothing here was seen in a browser.
