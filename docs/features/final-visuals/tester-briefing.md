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

### How to run

```bash
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

- The summary card finds a summary author by name and actor among `timeline.authors` (`authorNamed`), because `SummaryAuthor` carries no id. Two people with the same name resolve to the first one, and a name missing from the timeline throws `MissingAuthorError`. The clean fix is an `id` on `SummaryAuthor` from G4, with stored rows migrated. The panel only renders the card once the timeline has loaded.
- The chart hint ("Click the chart or use ← → …") is still drawn by `Streamgraph` under the chart, not on one line with the filter. `streamgraph.tsx` is not in my list.
- The bottom panel is 42 % of the area at every width. The 58 % at 375 px of design section 1.1 is not implemented.
- `useAreaHeight` measures the parent of the `aside`. G2 must give that parent a definite height that holds the editor and the panel (a flex column with `min-h-0`), or the panel stays at 240 px.
- While the panel is collapsed at the bottom the timeline is still fetched and polled, because the chips need it. Side collapsed stops the polling as before.
- `isPanelOpenByDefault()` is the answer for G2's initial `isOpen` (`useState(isPanelOpenByDefault)`); I do not own the state.
- `top-edits.tsx` has its own `calloutStyleOf` that repeats the swatch's hue and saturation style. `topic-swatch.tsx` is not mine; one shared helper would remove it.
- `SummarizeHandle` in `timeline-panel.tsx` and G4's `SummarizeControl` are the same shape; G2 passes G4's hook result as is.
- Dead after this lane, for G4 Step 39: `useSummarizeEdits` in `use-selection-summary.ts`, `summarizeDisabledReason`, `errorForSelection` and `selectionVolume` in `selection-summary.ts`, `use-topics.ts`, `SummaryTooSoonError` in `timeline-api.ts` and the unused copy constants.
- `apps/web/src/features/editor/document-page.tsx` does not typecheck until G2 passes `position`, `isOpen`, `onOpenChange` and `summarize`; it is the only typecheck error.
- On the integration base, `libs/types/src/constants.ts` declared `DOCUMENT_READY_POLL_MS` and `DOCUMENT_READY_GIVE_UP_MS` twice, which stopped every run that imports `@superdoc-collab/types`; I removed the second pair in my working tree only and did not commit it.
- Nothing here was seen in a browser. Real layout, scrolling, the 42 % height, pointer dragging, focus rings and contrast are untested beyond jsdom.
