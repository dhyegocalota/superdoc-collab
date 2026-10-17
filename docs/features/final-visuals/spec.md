# Final visuals

**Status:** Approved
**Owner approval:** approved 2026-10-17 (design.md section 7, every recommendation)
**Tier:** 🟡
**ADRs:** [0009](../../adr/0009-design-system.md), [0015](../../adr/0015-topics-recompute-trigger-and-identity.md), [0031](../../adr/0031-one-summarize-job-runs-only-what-is-stale.md)
**Not changing:** the history pipeline, the summary cache key and its freshness rule (ADR 0012), the filter grammar, the time-travel keyboard path, auth flows, the connection banner, the creator reservation and socket limits, and every API shape except the Summarize endpoint's answers and the removed topics refresh.

Input: [design.md](design.md), approved in full. Its mockups and probes live in `.pr-media/final-visuals/design/` (git-ignored). Section numbers below refer to design.md.

## Problem

The product works, but the chrome around the document does not. The walk of 2026-10-17 found no formatting toolbar, a page that overflows the canvas at 1280 with the panel open, a documents header that pushes Sign out off a 375 px screen, a title that is always an input, two separate LLM buttons with one invisible job between them, grey avatars that match no cursor, no dark mode toggle, and a dead end for readers who open a document before its owner has synced it once.

## Goals

| Ask | Goal |
|---|---|
| A1 | One top bar on every signed-in page holds the brand link, the title (editor), members, Find, Use with AI, Share, Download, More actions and the account menu. Below `sm`, the secondary actions fold into More actions. |
| A2 | The Edits panel opens at the bottom by default, and at the side from the wide breakpoint when no position is stored. |
| A3 | A toolbar row under the top bar holds SuperDoc's trimmed toolbar and the Summarize edits button. |
| A4 | The brand link on every page opens the documents list. |
| A5 | Download is a split button: DOCX by default, PDF through a print view. |
| A6 | The account menu holds Settings, Connected apps, Admin (admins only), the theme choice (Light, Dark, System) and Sign out. The theme applies before first render and across tabs. |
| A7 | The title reads as text and becomes an input on click. Enter saves, Escape cancels. |
| A8 | The panel position toggle is persisted. The collapsed bottom bar shows topic chips. The bottom layout is two columns. |
| A9 | One Summarize edits action starts one server job that runs only the stale steps. |
| A10 | Each person has one colour in the header, the avatars and their SuperDoc cursor. |
| A11 | A member's avatar scrolls the editor to that member's cursor, or says why it cannot. |
| A13 | A document opened before its owner's first sync shows a waiting page that enters on its own. |
| R | Excellent at 320, 375, 768, 1024, 1280, 1536, 1920 and 2560 px: no horizontal page scroll, no clipped controls, no layout jump on load or theme switch. The test plan has one box per width. |

## Non-goals

- The connection banner and its states: feature `connection-state` (ask 12).
- The creator reservation and socket limits: feature `room-admission`.
- Server PDF conversion. The PDF is a print view (option 6.1 A).
- A real logo asset. The brand mark is a `FileText` icon in a primary square (owner decision 7.15).
- Colour by author as a page setting (option 6.5 C).
- Distinct colours within one document: colours are a hash (option 6.9 A), so collisions are accepted.

## Design

### Data flow

**1. The Summarize job.**

- The client sends one `POST` to `selectionSummaryApiPath(documentId)` with the current selection query, as today. The request starts the job or answers at once.
- The job runs these checks in order, and starts only what is stale:
  1. Topics: regroup when the topic status is failed, or when `computedAtSequence` is older than the newest projected edit. A failed regroup keeps the ready topics (ADR 0015).
  2. Selection summary: write it when it is missing, failed, or stamped with another cursor or topics time.
  3. Topic sentences: rewrite each topic whose sentence is older than its newest run, as `SummariesService` does today.
- If nothing is stale, the job makes no model call and the answer is 200.
- The job sets a `SummarizeStep` (`Idle`, `Grouping`, `Summarizing`) that the selection view returns as `step`. The client polls the existing selection path with `pollWhileAvailable` while the step is not `Idle`.
- The answers are:
  - 202 with the view while a job runs (started or already running).
  - 200 with the view when the summary is cached, the selection is empty, or nothing is stale. The client shows "The summary is up to date." on a 200 that started no job.
  - 429 with `Retry-After` and one message, `SUMMARIZE_BUSY_MESSAGE`, for any wait. The seconds are the longer of the remaining cooldown and the model's busy wait.
  - 503 with the reason when the model is unavailable, as today.
- Cooldowns:
  - `SUMMARIZE_COOLDOWN_MS` (30 s, renamed from `SELECTION_SUMMARY_COOLDOWN_MS`, same value) is per document. It is consumed when the job starts its first model call (ADR 0012).
  - `TOPIC_REFRESH_COOLDOWN_MS` is retired with the refresh endpoint.
  - `SUMMARY_MIN_INTERVAL_MS` is retired. Reading the summaries no longer starts a rewrite; sentence rewrites happen only inside a Summarize click.
  - `TOPIC_RECOMPUTE_MIN_INTERVAL_MS` stays for the automatic recompute of ADR 0015.
- Removed: `POST /api/documents/:documentId/topics/refresh`, its path helper `topicsRefreshApiPath`, `RefreshOutcome`, `TopicsService.refresh`, and the call to `refreshStale` on read.
- The new orchestration lives in `apps/server/src/insights/summarize-service.ts`, which calls the topics and summaries services. The job runner's per-key guard stays as it is.

**2. Theme.**

- `apps/web/index.html` carries an inline script that runs before the bundle. It reads `THEME_STORAGE_KEY` (`superdoc-collab.theme`) and adds `dark` to `document.documentElement` for Dark, or for System when `prefers-color-scheme: dark` matches. The script cannot import, so a Vitest test reads `index.html` and asserts that its key equals the constant.
- `useTheme()` applies the class, writes the choice, listens to the `storage` event for other tabs, and follows `prefers-color-scheme` live under System.
- The version frame is same-origin. It loads the same shell, so it runs the same script and receives the same `storage` event.
- An unknown stored value is removed, and System applies.

**3. Panel position.**

- The key is `PANEL_POSITION_STORAGE_KEY` (`superdoc-collab.edits-panel`). Its value is a `PanelPosition` (`Bottom`, `Side`).
- `usePanelPosition()` returns `{ position, choosePosition }`.
  - Below `LARGE_BREAKPOINT_PX`, the position is always `Bottom` and the toggle is hidden.
  - From `LARGE_BREAKPOINT_PX`, a stored value wins.
  - With no stored value, the position is `Side` at or above `WIDE_BREAKPOINT_PX` and `Bottom` below it. It follows the viewport through `matchMedia` until the user chooses.
- A stored value that is not a `PanelPosition` is removed and treated as absent.
- Breakpoints are constants in `apps/web/src/lib/breakpoints.ts`: `LARGE_BREAKPOINT_PX = 1024` (Tailwind `lg`), `WIDE_BREAKPOINT_PX = 1536` (Tailwind `2xl`), and `minWidthQuery(px)`.

**4. Author colours.**

- `authorColorKeyOf(author)` in `libs/types/src/author-colors.ts` returns the key by kind:
  - An account: its user id.
  - An agent acting for a person: the person's user id, with `AGENT_KEY_SUFFIX` (`#agent`) removed.
  - A DOCX author with no account (`id` is null): `imported:` plus the name, trimmed and lowercased.
- `authorColorSlot(key)` hashes the key with FNV-1a (constants `HASH_OFFSET_BASIS` and `HASH_PRIME`) and returns `AuthorColorSlot`, 1 to 6, modulo `AUTHOR_COLOR_SLOT_COUNT`. No request is needed, so every client agrees.
- Components use `var(--author-N)`. The palette is hex and the same in both modes.
- At mount, `SuperDocEditor` reads each token with `getComputedStyle(document.documentElement)`. It passes the current user's colour as `user.color` and all six as `colors`. SuperDoc then broadcasts the colour through awareness, so remote cursors match the avatars. The spike confirms the accepted format (see the open questions).

**5. The waiting page.**

- `useOpenedDocument` treats 409 `NOT_READY` as a state, not an error. While the answer stays 409, it polls every `DOCUMENT_READY_POLL_MS`.
- The give-up rule counts polls, so hidden time does not count. After `DOCUMENT_READY_GIVE_UP_MS` of polls, polling stops and the page shows the paused state. TanStack's default `refetchIntervalInBackground: false` pauses polling while the tab is hidden.
- "Keep waiting" resets the count. A 200 enters the normal flow. Any other error shows the error card, and "Try again" refetches once.
- `WaitingForDocument` replaces `UnavailableNotice` for every role. `DOCUMENT_NOT_READY_MESSAGE` is no longer shown.

**6. SuperDoc options that change.** All in `apps/web/src/features/editor/superdoc-options.ts`.

- `ui.toolbar`: `{ container, responsiveTo: 'container', excludeItems: TOOLBAR_EXCLUDED_ITEMS }`. The excluded items are tracked-change accept and reject, ruler, measurement unit, document mode and search. The names come from SuperDoc 2.23.0's types at build time.
- `ui.search: true`, so Cmd+F and Ctrl+F open the Find bar.
- `zoom: { mode: 'fit-width', fitWidth: { max: 100 } }` at every width. This replaces the viewport switch of refinement-ux-care for the editor; the lead reconciles the two specs. A zoom change made from the toolbar's menu is left alone.
- `user.color` and `colors`, from data flow 4.
- `inert` on the toolbar container while a past version is shown.
- The print view alone sets `layoutEngineOptions.virtualization.enabled: false` (option 6.1 A).

### Interfaces

**libs/types**

| Path | Name | Change |
|---|---|---|
| `timeline.ts` | `SummarizeStep` (enum: `Idle`, `Grouping`, `Summarizing`) | new |
| `timeline.ts` | `SelectionSummaryView.step` | new field |
| `timeline.ts` | `SUMMARIZE_COOLDOWN_MS` | renamed from `SELECTION_SUMMARY_COOLDOWN_MS` |
| `timeline.ts` | `SUMMARIZE_BUSY_MESSAGE` | new |
| `timeline.ts` | `TOPICS_REFRESH_TOO_SOON_MESSAGE` | removed |
| `author-colors.ts` | `AuthorColorSlot`, `AUTHOR_COLOR_SLOT_COUNT`, `AGENT_KEY_SUFFIX`, `authorColorKeyOf`, `authorColorSlot`, `HASH_OFFSET_BASIS`, `HASH_PRIME` | new |
| `constants.ts` | `DOCUMENT_READY_POLL_MS`, `DOCUMENT_READY_GIVE_UP_MS`, `CURSOR_GLOW_MS`, `JUMP_FAILED_NOTICE_MS` | new, in milliseconds |
| `routes.ts` | `topicsRefreshApiPath`, `REFRESH_SEGMENT` | removed |

`RECOVERED_NOTICE_MS` and `ConnectionState` belong to feature `connection-state`. They are not listed here.

**apps/server**

| Path | Change |
|---|---|
| `insights/insights-routes.ts` | Removes `POST /:documentId/topics/refresh`. The selection `POST` maps busy and too-soon to 429 with one message, and starts `summarize-service`. |
| `insights/summarize-service.ts` | New. Runs the three checks of data flow 1 in order. |
| `insights/selection-summaries-service.ts` | Renames the cooldown constant. Its `request` calls the Summarize service. Its `read` returns `step`. |
| `insights/summaries-service.ts` | `refreshStale` leaves the read path and becomes a Summarize step. `SUMMARY_MIN_INTERVAL_MS` removed. |
| `insights/topics-service.ts` | `refresh`, `RefreshOutcome`, `TOPIC_REFRESH_COOLDOWN_MS` removed. `compute` is called by the Summarize service. |
| `insights/insights-job-runner.ts` | Unchanged. |

**apps/web: shared and changed**

| Path | Change |
|---|---|
| `index.html` | Inline theme script (data flow 2). |
| `lib/use-theme.ts` | `useTheme()`, `ThemePreference` (`Light`, `Dark`, `System`), `THEME_STORAGE_KEY`. |
| `lib/breakpoints.ts` | `LARGE_BREAKPOINT_PX`, `WIDE_BREAKPOINT_PX`, `minWidthQuery`. |
| `components/ui/toggle-group.tsx`, `components/ui/tooltip.tsx`, `components/ui/tabs.tsx` | New shadcn components, from the installed `radix-ui`. |
| `components/ui/dropdown-menu.tsx` | Adds `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`. |
| `components/app-top-bar.tsx` | New. The right slot is passed by each page. |
| `components/brand-link.tsx` | Moved from `features/editor/home-link.tsx`; mark and name, no arrow. |
| `components/user-avatar.tsx` | New. Sizes 24 and 32 px, colour slot, agent badge, online dot. |
| `styles/globals.css` | Tokens `--paper`, `--topic-tint-lightness`, `--author-1` to `--author-6`, the dark `--primary` at `oklch(0.55 0.2 263)`, and the `--sd-ui-*` mapping of design 3.2. |

**apps/web: account, documents and editor**

| Path | Change |
|---|---|
| `features/account/account-menu.tsx`, `features/account/account-copy.ts` | New. `DropdownMenu` with `modal={false}`, aligned end, 224 px. |
| `features/editor/editor-header.tsx` | Becomes the editor's right slot of `AppTopBar`. |
| `features/editor/document-title.tsx` | New. Replaces `TitleInput`. |
| `features/editor/download-menu.tsx`, `features/editor/download-format.ts` | New. `DownloadFormat` (`Docx`, `Pdf`). |
| `features/editor/find-button.tsx` | New. Opens the Find bar, or falls back to the toolbar item (option 6.4). |
| `features/editor/editor-toolbar-row.tsx` | New. Toolbar container and the Summarize button. |
| `features/editor/waiting-for-document.tsx` | New. Ask 13. |
| `features/editor/use-member-cursors.ts` | New. Awareness positions by user id, through the spike's route. |
| `features/editor/members.tsx` | Jump buttons or `aria-disabled` buttons with a reason. Above five members, a "+N" menu. |
| `features/editor/superdoc-zoom.ts` | Keeps only the cap of data flow 6. |
| `features/editor/editor-copy.ts`, `features/editor/waiting-copy.ts` | Copy for titles, downloads, members, waiting (design section 4). `waiting-copy.ts` holds the waiting strings. |
| `features/editor/document-page.tsx`, `features/editor/use-opened-document.ts` | Waiting state and polling (data flow 5). |
| `features/documents/` | Upload becomes the primary action of the documents page, and the top bar of the page carries Use with AI and account only (option 6.6). |

**apps/web: timeline and connected apps**

| Path | Change |
|---|---|
| `features/timeline/use-panel-position.ts` | New. `PanelPosition` (`Bottom`, `Side`), `PANEL_POSITION_STORAGE_KEY`, `usePanelPosition`. |
| `features/timeline/panel-position-toggle.tsx` | New. A `ToggleGroup` with two items. |
| `features/timeline/timeline-panel.tsx` | Takes the position, loses the two header buttons, gains the toggle and the collapsed bar with topic chips. |
| `features/timeline/timeline-copy.ts` | Panel and summary copy. `importedAuthorLabel`. |
| `features/timeline/contributor-avatars.tsx` | Renders `UserAvatar` with the author's colour. |
| `features/connected-apps/use-with-ai-dialog.tsx`, `features/connected-apps/connected-apps-copy.ts` | New dialog with `Tabs` per client. |
| `features/versions/print-view.tsx` | New, PDF option A only. |

### Failure handling

| Failure | Behaviour |
|---|---|
| Rename fails | `RENAME_FAILED_MESSAGE` under the top bar. The title keeps its old value. |
| DOCX export fails | `EXPORT_FAILED_MESSAGE` under the top bar. |
| PDF preparation fails | Toast `downloadFailedMessage(DownloadFormat.Pdf)`. No file is downloaded. |
| A Summarize step fails | The card shows the step's message and "Retry summary", which reruns the whole job. A failed regroup keeps the old topics (ADR 0015). |
| Busy or cooling down | One 429 answer with one countdown, the longer wait. The card reads "Try again in N s.". |
| Unknown stored theme or panel value | Removed from storage, then treated as absent. |
| Awareness position is stale | The button stays. The tooltip shows the cursor-not-found copy for `JUMP_FAILED_NOTICE_MS`. |
| Waiting page error | The error card, "Try again" refetches once. |
| Waiting page gives up | The paused card, "Keep waiting" restarts the count. |

## Open questions → answers

Every answer is the recommendation of design.md section 7, approved by the owner on 2026-10-17. The four spike rows are pending.

| Question | Options | Owner's answer | Date |
|---|---|---|---|
| Single Summarize job: what it runs (7.1) | (a) regroup only stale topics, then the summary, then the sentences · (b) always regroup · (c) chained on the client | Recommendation, 2026-10-17 (a); the cooldown and routes as in data flow 1 | 2026-10-17 |
| Breakpoint for the side panel (7.3) | 1440 · 1536 · 1920 | Recommendation, 2026-10-17: 1536 (`2xl`) | 2026-10-17 |
| The palette icon (7.4) | drop · theme cycle button · colour by author | Recommendation, 2026-10-17: drop | 2026-10-17 |
| Summarize placement (7.5) | toolbar row · SuperDoc item · panel header | Recommendation, 2026-10-17: toolbar row | 2026-10-17 |
| Upload DOCX placement (7.7) | documents page primary · every top bar | Recommendation, 2026-10-17: documents page | 2026-10-17 |
| Paper colour in dark mode (7.8) | `--paper` white · paper follows `--background` | Recommendation, 2026-10-17: `--paper`, white | 2026-10-17 |
| Dark primary contrast (7.9) | lower to 0.55 · keep | Recommendation, 2026-10-17: lower to 0.55 (4.82:1) | 2026-10-17 |
| Topic callout style (7.10) | tinted fill · left bar | Recommendation, 2026-10-17: tinted fill, `--topic-tint-lightness` | 2026-10-17 |
| shadcn components (7.11) | the three new components and the dropdown parts | Recommendation, 2026-10-17: add all | 2026-10-17 |
| Toolbar items (7.12) | default · trimmed | Recommendation, 2026-10-17: trimmed | 2026-10-17 |
| Panel heading (7.13) | "Timeline" · "Edits" | Recommendation, 2026-10-17: "Edits" | 2026-10-17 |
| SuperDoc chrome in our tokens (7.14) | map `--sd-ui-*` · leave grey | Recommendation, 2026-10-17: map | 2026-10-17 |
| Brand mark (7.15) | icon in a square plus name · name only | Recommendation, 2026-10-17: mark plus name | 2026-10-17 |
| Panel at 375 (7.16) | collapsed · open | Recommendation, 2026-10-17: collapsed | 2026-10-17 |
| Use with AI layout (7.17) | tabs per client · stacked snippets | Recommendation, 2026-10-17: tabs | 2026-10-17 |
| Author palette (7.18) | six slots on hues 235 to 355 · twelve on the wheel | Recommendation, 2026-10-17: six, as the `--author-N` hex | 2026-10-17 |
| How a colour is derived (7.19) | hash · member order · server slot | Recommendation, 2026-10-17: hash | 2026-10-17 |
| Avatar style (7.21) | solid fill · tint with ring | Recommendation, 2026-10-17: solid fill | 2026-10-17 |
| Imported DOCX authors (7.22) | coloured by name hash · grey | Recommendation, 2026-10-17: coloured | 2026-10-17 |
| Waiting page stop rule (7.24) | pause after 5 minutes · poll forever | Recommendation, 2026-10-17: pause after 5 minutes, counted in polls | 2026-10-17 |
| Spike: PDF through a print view with virtualization off (7.2, option 6.1 A) | print view · server conversion | Spike VIABLE, 2026-10-17: `virtualization.enabled: false` alone paints only the pages near the viewport, so the print view must be as tall as all its pages (the spike used 1280 × 8000) before printing; then every page carries its text and one 816 × 1056 page maps to one Letter sheet with `@page { size: Letter; margin: 0 }`. The print view is a same-origin frame sized to `pageCount × 1056` px. Fonts not bundled (Calibri) print with substitutes. | 2026-10-17 |
| Spike: top-bar Find button (7.6, option 6.4 A) | top-bar button · toolbar item | Spike VIABLE, 2026-10-17: the button calls `superdoc.emit('search:open')`, the same event the toolbar's search item sends; `ui.search.open()` returns ok and mounts nothing, so it is not used. `ui.search: true` stays for Cmd+F. | 2026-10-17 |
| Spike: jump to a member's cursor (7.20, section 1.13) | ship · drop | Recommendation, 2026-10-17; spike pending. If the spike confirms, awareness maps to a block id for `scrollToElement`. | 2026-10-17 |
| Spike: the `user.color` format (section 1.12, 3.3) | hex · another string | Spike PARTIAL, 2026-10-17: an explicit six-digit hex `user.color` is kept and drawn; hsl, rgb and named colours are stored but the remote-caret overlay replaces them with a palette colour, so the `--author-N` tokens are declared as six-digit hex and passed as is. `colors` only restricts the automatic palette. The remote caret drawn from the explicit colour is confirmed by the collaboration spike with two browsers. | 2026-10-17 |

The lead fills the four spike answers after the spikes.

## Test strategy summary

- **Unit (Vitest), per hook and pure function:** `usePanelPosition`, `useTheme`, `authorColorSlot` and `authorColorKeyOf`, `useOpenedDocument` polling and give-up, `DocumentTitle`, `DownloadMenu`, `PanelPositionToggle`, `UserAvatar`, `Members` jump rules, `WaitingForDocument`, the summarize chain in `summarize-service.ts`, and the 429 answer. Each red commit comes first.
- **E2E (Playwright), per flow:** sign in and open a document, rename a title, download DOCX and PDF, switch theme and panel position across a reload, summarize with fresh, stale and up-to-date selections, jump to a member's cursor, and open a document before its owner syncs, through the waiting page.
- **Playwright MCP walk:** each of the eight widths (320, 375, 768, 1024, 1280, 1536, 1920, 2560 px) in light and dark, sixteen boxes. Each box checks no horizontal scroll, no clipped control and no layout jump on load or theme switch.
- **Mutation checks:** the topics refresh tests in `insights-routes.test.ts` and `topics-service.test.ts` must fail when the refresh endpoint is restored. The two-button panel tests must fail when the second button is restored.
