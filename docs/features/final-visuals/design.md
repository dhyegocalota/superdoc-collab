# Final visuals: design

**Status:** Approved by the owner on 2026-10-17: every recommendation in section 7 taken as is. The spec is written from this document.
**Input:** the owner's thirteen asks (relayed by the lead on 2026-10-17; asks 10–13 added the same day, ask 12 bound by the owner's connection brief), the brief's mock, [ADR 0009](../../adr/0009-design-system.md), `.claude/rules/web-ui.md`, the [refinement-ux-care](../refinement-ux-care/spec.md) goals.
**Media:** every image named below lives in `.pr-media/final-visuals/design/` (git-ignored). The mockups are three self-contained HTML files in the same folder, `mockup-editor.html` (query parameters pick the state), `mockup-waiting.html` and `options-sheet.html?sheet=…`, written with the token values of `apps/web/src/styles/globals.css`.

## What is on screen today

Walked on 2026-10-17 at 1280 × 800 and 375 × 812 as `ana@example.com`, with the brief's DOCX uploaded and two edits typed.

| Screen | 1280 | 375 |
|---|---|---|
| Documents | `current-documents-1280.png` | `current-documents-375.png` |
| Editor, panel open | `current-editor-1280.png`, `current-timeline-open-1280.png` | `current-editor-375.png`, `current-timeline-open-375.png` |
| Editor, panel collapsed | `current-timeline-collapsed-1280.png` | `current-timeline-collapsed-375.png` |
| Settings | `current-settings-1280.png` | `current-settings-375.png` |
| Connected apps | `current-connected-apps-1280.png` | `current-connected-apps-375.png` |

What the walk found:

- **No formatting toolbar renders.** SuperDoc 2.23.0 draws its toolbar only once `ui.toolbar.container` resolves to an element; the app passes `ui: { comments }` only.
- **The page does not stay centred.** At 1280 with the side panel the 816 px page overflows and a horizontal scrollbar appears. With the panel collapsed the page sits left-aligned with a grey gap to its right.
- **The documents header overflows at 375.** Name, Connected apps, Settings and Sign out push "Sign out" off screen and the page scrolls sideways.
- **The title is always an input.** At 375 it shows "superdoc-e".
- **Two LLM buttons sit side by side** ("Summarize edits", "Regroup topics") with a third, invisible job writing the Top edits sentences. With the fake model the topics fail and the panel opens on "Topics unavailable".
- **Nothing toggles dark mode**, although `.dark` tokens exist.

Read from the code, not walked (they need a second account or a dropped connection):

- **Avatars are grey.** Every avatar (`Members`, `AuthorAvatar` in `contributor-avatars.tsx`) is `bg-muted` with initials. SuperDoc picks each cursor's colour from its own hash of the identity, so no avatar matches any cursor.
- **Topic hues use one arc.** Bands take hues from 205 down to 25, ordered by onset (`TOPIC_HUE_START`, `TOPIC_HUE_END` in `libs/history/src/timeline/stack.ts`): blue, green, yellow, orange. The magenta and violet half of the wheel is unused.
- **No connection state is shown.** The editor never reports a lost or failed connection.
- **An early reader hits a dead end.** A document opened before its creator's first sync answers 409 `NOT_READY`. The page shows "The owner has not opened this document yet." and a link back, and never retries (`UnavailableNotice`).

Facts proven on screen in a scratch page that mounts the installed SuperDoc build (no product code touched):

- **The built-in toolbar is the mock's toolbar.** `superdoc-toolbar-1280.png` shows it with default items: undo, redo, accept and reject tracked changes, zoom, font, size, bold, italic, underline, strike, colour, highlight, link, image, table, table actions, align, lists, indent, line height, ruler, overflow, search, measurement unit, document mode.
- **It can be themed from outside.** Its documented `--sd-ui-*` variables ("the 5-variable theme": `--sd-ui-text`, `--sd-ui-bg`, `--sd-ui-border`, `--sd-ui-action`, `--sd-ui-action-hover`, plus `--sd-ui-font-family` and `--sd-ui-toolbar-bg`) take our tokens in light and dark (`probe-toolbar-themed-ours-1280.png`, `probe-toolbar-themed-dark-1280.png`). This is the same mechanism `--sd-comment-highlight-*` already uses.
- **Mapping `--sd-ui-bg` also darkens the paper**, and DOCX text keeps its own dark colours: 1.57:1 contrast. Setting `--sd-layout-page-bg` keeps the paper white (`probe-toolbar-dark-white-paper-1280.png`).
- **A custom toolbar item is truncated.** `customItems` with `label: 'Summarize edits'` renders as an unstyled "Sum…" (`probe-toolbar-custom-item-1280.png`).
- **The toolbar shrinks cleanly to 375** with `responsiveTo: 'container'`: undo, B, I, U, S and an overflow menu, next to our button (`probe-toolbar-themed-ours-375.png`).
- **Search.** The toolbar's search item, and Cmd+F after a click with `ui.search: true`, open SuperDoc's Find bar (`probe-toolbar-search-item-1280.png`, `probe-superdoc-search-1280.png`). `superdoc.ui.search.open()` returned `{ ok: true }` but drew nothing, before and after `superdoc.focus()`.
- **SuperDoc virtualizes pages.** Off-screen `.superdoc-page` elements are empty: page 3 had 0 characters at the top, page 1 had 0 at the bottom. Browser find and a naive `window.print()` both miss them. `layoutEngineOptions.virtualization.enabled: false` exists in the config types.

## 1. Screens and states

### 1.1 Layouts

Top bar, editor page, desktop (owner; members, search, Use with AI, Share, Download split, More, account):

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [■] SuperDoc Collab │ Mutual Agreement for Document…   (AN)(BR)(CL)  ⌕  [Use with AI] [Share] [Download|▾] ⋯ (AN) │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
  logo = link home   title = text, click to rename                      primary ─┘
```

Top bar, editor page, 375 (Use with AI, Download and Delete move into More):

```
┌───────────────────────────────────────┐
│ [■] Mutual Agreem…   ⌕   ⇪   ⋯   (AN) │
└───────────────────────────────────────┘
```

Editor, panel at the bottom (default below the wide breakpoint):

```
┌───────────────────────────────────────────────────────────────────────────┐
│ top bar                                                                   │
├───────────────────────────────────────────────────────────────────────────┤
│ ↶ ↷ 100%▾ Arial▾ 12▾ B I U S A ✎ │ 🔗 🖼 ▦ │ ≡ • 1. ⇤ ⇥ ↕ ⋮   [✦ Summarize edits] │  SuperDoc toolbar + our button
├───────────────────────────────────────────────────────────────────────────┤
│░░░░░░░░░░░░░░┌──────────────────────────────┐░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  bg-muted canvas,
│░░░░░░░░░░░░░░│  page (white paper, centred) │░░░░░ tracked-change cards ░░│  page centred
│░░░░░░░░░░░░░░└──────────────────────────────┘░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
├─────────────────────────────── ═══ ───────────────────────────────────────┤  resize handle (row)
│ Edits  Times in UTC                                         [▭|▯]  ⌄      │  position toggle, collapse
│ hint ……………………………………  [Filter by text or @person]  │ Summary of these edits   │
│ ╭──────── streamgraph, labels on bands ────────╮       │ (AN)(BR)  sentence…      │
│ ╰──────────────────────────────────────────────╯       │ Top edits                │
│ Oct 17, 9:00 AM                         Oct 17, 4:30 PM │ (●GDPR) (AN)(BR) +323 −50│
│                                                         │ ▓ tinted sentence ▓▓▓▓▓▓ │
└───────────────────────────────────────────────────────────────────────────┘
          chart column: minmax(0, 1fr)                       list column: 380 px
```

Editor, panel at the side (default at and above the wide breakpoint; selectable from `lg`):

```
┌──────────────────────────────────────────────────────┬────────────────────────────┐
│ top bar                                                                            │
├────────────────────────────────────────────────────────────────────────────────────┤
│ SuperDoc toolbar …                                               [✦ Summarize edits] │
├──────────────────────────────────────────────────────┬─╥──────────────────────────┤
│░░░░░░░░░┌──────────────────────────┐░░░░░░░░░░░░░░░░░│ ║ Edits  UTC      [▭|▯] ⌄ │
│░░░░░░░░░│ page, fit to width,      │░░░░░░░░░░░░░░░░░│ ║ hint      [Filter…]     │
│░░░░░░░░░│ never above 100%         │░░░░░░░░░░░░░░░░░│ ║ streamgraph             │
│░░░░░░░░░│                          │░░░░░░░░░░░░░░░░░│ ║ axis                    │
│░░░░░░░░░└──────────────────────────┘░░░░░░░░░░░░░░░░░│ ║ Summary of these edits  │
│                                                      │ ║ Top edits …             │
└──────────────────────────────────────────────────────┴─╨──────────────────────────┘
                                               resize handle (column), width 40 %, min 420 px
```

Editor at 375 (bottom only; collapsed by default, expands to 58 % of the height):

```
collapsed                                   open
┌───────────────────────────────┐          ┌───────────────────────────────┐
│ top bar                       │          │ top bar                       │
├───────────────────────────────┤          ├───────────────────────────────┤
│ ↶ ↷ B I U S ⋮ [✦ Summarize e…]│          │ ↶ ↷ B I U S ⋮ [✦ Summarize e…]│
├───────────────────────────────┤          ├───────────────────────────────┤
│ page, fit to width            │          │ page, fit to width            │
│                               │          ├────────────── ═══ ────────────┤
│                               │          │ Edits                       ⌄ │
│                               │          │ hint                          │
│                               │          │ [Filter by text or @person]   │
│                               │          │ streamgraph                   │
├───────────────────────────────┤          │ Summary of these edits        │
│ Edits (●GDPR)(●Limited li… ⌃  │          │ Top edits …  (scrolls)        │
└───────────────────────────────┘          └───────────────────────────────┘
```

Mockups: `mockup-editor-bottom-1280.png`, `mockup-editor-bottom-375.png`, `mockup-editor-bottom-collapsed-1280.png`, `mockup-editor-bottom-collapsed-375.png`, `mockup-editor-side-1280.png`, `mockup-editor-side-wide-1680.png`, `mockup-editor-side-collapsed-1280.png`, `mockup-editor-dark-1280.png`, `mockup-editor-dark-375.png`.

### 1.2 Top bar (asks 1, 4, 6, 7)

One `AppTopBar` on every signed-in page, 52 px high, `border-b`, `px-3`, `gap-2`. The left slot is fixed; each page fills the right slot.

| Page | Left | Right |
|---|---|---|
| Editor | Brand link, divider, title (1.9), Read only badge for readers | Members, Find, Use with AI, Share (owner, primary), Download split, More actions, account |
| Documents | Brand link | Use with AI, account. "Upload .docx" and "New document" stay in the Mine section, Upload becomes the primary (see option 6.6) |
| Settings, Connected apps, Admin | Brand link | account. The "← Documents" and Sign out buttons go: the brand link and the account menu replace them |

- **Brand link (ask 4).** A 24 px `rounded-sm` square in `bg-primary` with a `FileText` icon in `text-primary-foreground`, then `APP_NAME` in `font-semibold`. The whole group is one `Link` to `AppRoute.Documents`, `hover:bg-accent`, accessible name `HOME_LINK_LABEL` ("SuperDoc Collab, back to documents"). The name hides below `sm`; the mark stays. This keeps P1-1 ("home link with the app name") while dropping its arrow. The mark is a proposal; there is no logo asset (owner decision 7.15).
- **Version label.** The mock's "v2.4.0" is the SuperDoc demo's version. Dropped.
- **Below `sm`.** Use with AI, Download .docx, Download PDF and Delete move into More actions. Share becomes an icon button. Members hide. The header is one row at 375, which keeps P2-2.

Mockups: `mockup-editor-bottom-1280.png`, `mockup-editor-bottom-375.png`, `mockup-more-menu-375.png`, `mockup-reader-1280.png`, `mockup-reader-375.png`, `option-upload-1280.png`.

### 1.3 Toolbar row (ask 3)

- **What.** A 41 px row, `border-b`, `bg-background`: SuperDoc's toolbar in a `flex-1 min-w-0` container on the left, our "Summarize edits" button on the right. SuperDoc config: `ui.toolbar: { container, responsiveTo: 'container', excludeItems }` and `ui.search: true`.
- **Items.** Keep: undo, redo, zoom, font, size, bold, italic, underline, strike, text colour, highlight, link, image, table, table actions, align, bullet list, numbered list, indent, outdent, line height, overflow. Exclude: accept and reject tracked change (no review workflow in this product), ruler, measurement unit, document mode (roles decide the mode), search (moves to the top bar, see option 6.4). The list is owner decision 7.12.
- **Readers.** No toolbar row: SuperDoc runs in viewing mode and every control would be disabled. Readers reach the panel through its bar.
- **Time travel.** While a past version is shown, the toolbar container gets `inert` and the version banner sits below the row. Summarize stays live: the selected bin is the time-travel moment, so it summarizes exactly what is on screen.
- **Zoom.** The page is centred at every width. Recommendation for the developer: `zoom.mode: 'fit-width'` with `fitWidth.max: 100`, so the page never overflows the canvas and never grows past 100 %. This fixes the side-panel scrollbar and the left-aligned collapsed page seen today. The toolbar's zoom menu overrides it until the viewport crosses the breakpoint again.

Mockups: `mockup-editor-bottom-1280.png`, `probe-toolbar-themed-ours-1280.png` (the real toolbar with our button), `probe-toolbar-themed-ours-375.png`.

### 1.4 Edits panel (asks 2, 8)

- **Name.** The panel heading becomes "Edits", matching the mock's "Edits panel" and the "Summarize edits" verb (owner decision 7.13).
- **Bottom.** Full width under the canvas, `border-t`. The default height is 42 % of the area below the toolbar row, minimum 240 px, maximum that area minus 240 px for the editor. A row-resize handle sits on its top edge, keyboard-operable with ↑ ↓ in `PANEL_RESIZE_STEP` steps. Body: a two-column grid, `minmax(0, 1fr)` for the chart column and 380 px for the list column, `gap-6`, `px-4 pb-4`. Each column scrolls on its own.
  - The chart column holds the hint and the filter box on one line (filter `w-72`, right), then the streamgraph at the column width, then the axis. Band labels are drawn on the bands as today.
  - The list column holds the selection summary card, then Top edits. With a selected bin, the bin's edits replace Top edits, as today.
- **Side.** Today's panel, kept: 40 % of the viewport width, minimum 420 px, column-resize handle, one column (chart, filter, summary, Top edits).
- **Collapsed.** The bottom position becomes a 44 px bar: "Edits", the three largest topic chips (`overflow-hidden`), and an expand button. The chips are live: a click filters by that topic and opens the panel. The side position keeps today's 48 px rail (P1-2).
- **Header.** "Edits", `TimeZoneLabel` (muted, hidden below `sm`), spacer, position toggle (from `lg`), collapse toggle.
- **Where the panel lives:**
  - Below `lg`, always the bottom; the toggle hides.
  - From `lg`, the stored choice wins.
  - With no stored choice, the side from the wide breakpoint up (`2xl`, 96 rem = 1536 px, recommended; owner decision 7.3), the bottom below it. Without a stored choice the default follows the viewport live.
  - A click on the toggle stores `PanelPosition.Bottom` or `PanelPosition.Side` in localStorage at once.
  - A stored value that is not a `PanelPosition` is removed and treated as absent, never defaulted silently.
- **Open by default.** Below `lg` the panel starts collapsed, so a phone opens on the document. From `lg` it starts open. Collapsing is not persisted (not asked).
- **States:**

| State | What the panel shows |
|---|---|
| Empty (no edits) | Chart area shows "No edits yet" centred; list column shows "No edits yet"; Summarize opens the panel and the card says "No edits to summarize" (`state-summary-empty-1280.png`) |
| Loading (first fetch) | Chart column: a `Skeleton` of the chart height; list column: three skeleton rows. Today the panel is blank while the timeline loads |
| Topics pending | Today's "Naming topics…" status, above the chart |
| Topics failed | Today's "Topics unavailable" plus the reason; its Retry runs the single Summarize job (1.5) |
| History catching up | Today's "History catching up · N s behind" status |
| Success | `mockup-editor-bottom-1280.png` |

### 1.5 One "Summarize edits" action (ask 9)

The user sees one button and one result area. Today three jobs exist: the selection summary (button), the topic regroup (button) and the per-topic sentences (automatic). The surface below needs one server job, or one client call that chains them. The merge is the lead's decision. The open questions are in 7.1.

**What the button must do, in order:**

1. Open the panel if it is collapsed (at 375 too) and bring the summary card into view, using today's `useRevealRun` transitions. Focus stays on the button.
2. Decide what is stale for the current selection (filter, topic, selected bin), and start only what is stale:
   - Topics are older than the newest edit, or failed: regroup them.
   - The selection summary is missing or stale: write it.
   - The per-topic sentences are older than the topic set: rewrite them.
3. If nothing is stale, make no model call. The card shows the summary and "The summary is up to date." as a status line.
4. Show progress in the card as steps: "Grouping edits into topics…", then "Summarizing edits…". A finished step stays as "✓ Topics grouped". Top edits sentences update when they land.
5. On failure, show the step's message in the card with "Retry summary", which reruns the whole job. Old topics stay on screen through a failed regroup (ADR 0015).
6. When busy or cooling down, show one message with one countdown, "Try again in 24 s.", whichever cooldown is longer.

**The button.** `variant="default"`, `size="sm"`, a `Sparkles` icon and "Summarize edits".

- It is never disabled for "nothing to do". Its first duty, opening the panel at the summary, is always valid. This removes today's disabled-reason line from the cramped toolbar row.
- While the job runs it reads "Summarizing…" with `aria-busy="true"` and is disabled. Its label is its visible reason.
- Readers do not see it, as today (`canRequest`).
- "Regroup topics" leaves the panel header.

| State | Card | Image |
|---|---|---|
| Grouping | spinner, "Grouping edits into topics…", muted "Then summarizing edits" | `state-summary-grouping-1280.png` |
| Summarizing | "✓ Topics grouped", spinner, "Summarizing edits…" | `state-summary-running-1280.png` |
| Success, fresh | avatars, sentence | `mockup-editor-bottom-1280.png` |
| Success, stale | avatars, sentence, "For an earlier state" badge (today's) | `mockup-editor-bottom-1280.png` |
| Up to date | sentence and "The summary is up to date." | `state-summary-uptodate-1280.png` |
| Error | destructive message, "Retry summary" | `state-summary-error-1280.png` |
| Overloaded | destructive message with "Try again in N s." | `state-summary-busy-1280.png` |
| Nothing to summarize | "No edits to summarize" | `state-summary-empty-1280.png` |

Placement options: 6.2.

### 1.6 Use with AI (ask 1)

- **The button.** "Use with AI" with a `Bot` icon, `variant="outline"`, in the editor and documents top bars. Below `sm` it lives in More actions.
- **The dialog.** `Dialog`, 560 px wide, scrolls within the viewport.
  - Title "Use this document with your AI" and a one-line description.
  - Then the client snippets: today's `ConnectSnippets` content (MCP URL, Claude Code, Cursor, ChatGPT with its instruction), shown one client at a time in tabs (option in 7.11).
  - Then "Then try asking" with three example prompts that name the open document's title. The third, an edit, shows only to editors and owners.
  - The footer has "Manage connected apps" (link to `AppRoute.ConnectedApps`) and "Close".
- **On the documents page** the prompts drop the title ("Summarize what changed in my documents today.").
- **States:** none beyond the copy button's own "Copied"; the dialog makes no request.
- **Mockups:** `mockup-use-with-ai-1280.png`, `mockup-use-with-ai-375.png`.

### 1.7 Download (ask 5)

- **The control.** A split button, `variant="outline"`. The main part reads "Download" and downloads the .docx (today's `superdoc.export`). The chevron part, "More download formats", opens a menu with "Download .docx" and "Download PDF". Below `sm` both items sit in More actions.
- **States:**

| State | What shows |
|---|---|
| Editor not ready | both parts disabled; the reason "Loading document…" is visible under the title row only while it lasts |
| DOCX failed | today's `EXPORT_FAILED_MESSAGE` under the top bar |
| PDF preparing | a toast "Preparing the PDF…" with a spinner (`mockup-pdf-preparing-1280.png`) |
| PDF failed | toast "The PDF could not be prepared." |
| PDF ready, option A | the browser's print dialog, with the hint "Choose “Save as PDF” in the print dialog." in the toast |
| PDF ready, option B | the browser downloads "Title.pdf" |

The two PDF paths are in 6.1 and `option-pdf-1280.png`. Mockup: `mockup-download-menu-1280.png`.

### 1.8 Account menu and theme (ask 6)

- **The trigger.** A 32 px initials circle, the same look as `Members`, `aria-label` "Account, Ana", at the far right of every top bar.
- **The menu.** `DropdownMenu modal={false}`, `align="end"`, 224 px:
  - name and email
  - Settings, Connected apps, Admin (admins only)
  - "Theme" with three radio items: Light, Dark, System
  - Sign out
- **Theme behaviour.** The choice applies at once and is stored in localStorage.
  - System follows `prefers-color-scheme` live.
  - The class is applied before React's first render, so a dark reader never sees a light flash.
  - A `storage` event applies a change made in another tab, and inside the same-origin version frame.
  - An unknown stored value is removed and System applies.
- **Mockups:** `mockup-account-menu-1280.png`, `mockup-account-menu-dark-1280.png`, `mockup-account-menu-375.png`.

### 1.9 Document title (ask 7)

- **At rest.** A button showing the title, `font-medium`, truncated, `max-w-[360px]` (full width minus the actions below `sm`), `hover:bg-accent`, `rounded-md`, `h-8 px-2`.
- **Editing.** A click or Enter swaps it for today's `Input` with the text selected.
  - Enter or blur saves through today's rename mutation.
  - Escape restores the old title without saving.
  - An empty value restores the old title, as today.
- **Below `sm`.** While editing, the input takes the whole bar after the brand mark; the actions return when editing ends.
- **After.** Focus returns to the title button. A failed save shows today's `RENAME_FAILED_MESSAGE`.
- **Readers.** An `h1`, no button.
- **Mockups:** `mockup-title-editing-1280.png`, `mockup-title-editing-375.png`, `option-title-1280.png`.

### 1.10 Find (from the mock)

- **The button.** An icon button, `Search` icon, "Find in document", left of Use with AI. It opens SuperDoc's Find bar.
- **The shortcut.** `ui.search: true` makes Cmd+F and Ctrl+F open the same bar, which searches every page. The browser's find misses virtualized pages.
- **Unproven.** Opening the bar from our own button needs a spike, because `ui.search.open()` drew nothing. See option 6.4 and `option-search-1280.png`.

### 1.11 Dark mode

- **Our tokens and SuperDoc's chrome.** Our tokens switch with `.dark` on `html`. SuperDoc's toolbar, menus and Find bar follow through the `--sd-ui-*` mapping (3.2).
- **The paper.** It stays white with its DOCX colours, on a `bg-muted` canvas (`mockup-editor-dark-1280.png`).
- **Topics.** Band and chip colours use today's dark `--topic-lightness`.

### 1.12 One colour per person (ask 10)

- **Where it applies.** One colour per person on every surface: header members, the account button, Top edits avatars, selection summary avatars, bin edit avatars, and that person's SuperDoc cursor and selection.
- **The palette.** Six author colours, `--author-1` to `--author-6`, on the half of the wheel topics never use: hues 235, 259, 283, 307, 331 and 355, at 60 % saturation and 45 % lightness. Indigo, violet, purple, magenta, rose and red cannot be mistaken for a topic's blue, green, yellow or orange.
- **The avatar.** A solid fill in the person's colour with initials in `--primary-foreground`. It is the same in light and dark mode, because the cursor always sits on white paper and must match.
- **Deriving the colour.** Hash a stable author key with FNV-1a and take the result modulo 6. The function `authorColorSlot(key)` lives in `libs/types`, so every client computes the same slot with no request.
  - An account: its user id.
  - An AI acting for a person: the person's user id (the `#agent` suffix stripped). It keeps today's agent badge on the avatar and the hatch in the chart.
  - A DOCX author with no account (`EventAuthor.id` is null): `imported:` plus the name, trimmed and lowercased. The tooltip reads "Chris Crawford, imported from the DOCX".
- **SuperDoc.** At mount, the app reads the resolved `--author-N` value with `getComputedStyle` and passes it as `Config.user.color`. It passes all six as `Config.colors`. Each client broadcasts its own colour through awareness, so remote cursors match the avatars everywhere. The spike confirms that SuperDoc draws the caret, the name flag and a translucent selection from that string.
- **Collisions.** Two people in one document can share a colour: with six colours, three people collide 44 % of the time and four people 72 %. Initials and names tell them apart. Distinct colours within a document need the server to assign slots (option 6.9).
- **States:** none; the colour is known as soon as the author key is.

Mockups: `mockup-member-jump-tooltip-1280.png` (header and cursor in the same magenta), `mockup-editor-bottom-1280.png` (Top edits avatars), `mockup-editor-dark-1280.png`.

### 1.13 Jump to a member's cursor (ask 11)

**Feasibility to confirm by a spike** (decision 7.20): the awareness payload's cursor fields are not typed.

- **How it works.** Each header avatar becomes a button. A click scrolls the editor so the person's caret is centred, and their selection glows in their colour for 1.2 s.
- **Route to recommend.** Map the awareness cursor to its block id, then call `superdoc.scrollToElement(blockId)`. This works even when the caret's page is virtualized. Scrolling to SuperDoc's caret element would fail when that page is not rendered.
- **Focus.** It stays on the avatar. The editor is never focused programmatically (`web-ui.md`).
- **Why each avatar can or cannot jump:**

| Member | Control | Tooltip, also its description |
|---|---|---|
| Online, position known, live view | button | "Go to Bruno’s cursor" |
| Online, no position yet | `aria-disabled` button | "Bruno is online but not in the document" |
| Offline | `aria-disabled` button | "Clara is offline" |
| You | `aria-disabled` button | "This is you" |
| Anyone, while a past version is shown | `aria-disabled` button | "Go back to live to jump to a cursor" |
| Jump failed (the position went stale) | stays a button | the tooltip shows "Bruno’s cursor could not be found." for 3 s |

- **Why focusable.** The avatars stay focusable when they cannot jump, so keyboard users reach the reason. The tooltip shows on focus, which meets the visible-reason rule.
- **Many members.** Above five members the header shows four and a "+N" button. It opens a `DropdownMenu` with the rest under the same rules: unavailable items are disabled with their reason as secondary text.
- **At 375.** Members hide, so there is no jump on a phone. The page is fit to width there, and a remote caret is rarely off screen for long.
- **Announcement.** A visually hidden status says "Moved to Bruno’s cursor." No toast: the scroll is the visible feedback.

Mockups: `mockup-member-jump-tooltip-1280.png`, `mockup-member-offline-tooltip-1280.png`, `mockup-member-jumped-1280.png`.

### 1.14 Connection banner (ask 12, bound by the owner's connection brief)

**The states.** The enum `ConnectionState` lives in `libs/types`: `Online`, `Lost`, `Reconnecting`, `Recovered`, `Failed`.

| From | To | When |
|---|---|---|
| any | `Lost` | the moment `onCollaborationConnectionChange` reports `kind: 'lost'` |
| `Lost` | `Reconnecting` | the moment the callback reports `kind: 'reconnecting'` |
| any but `Failed` | `Failed` | the moment the callback reports `kind: 'failed'` or `state: 'failed'`; final until Reload |
| `Lost`, `Reconnecting` | `Recovered` | the members poll says the server sees this user online in the room, and the callback has not said failed |
| `Recovered` | `Online` | after `RECOVERED_NOTICE_MS` (3 s) |

- **The POC trap is closed by design.** Across a server restart the callback can stay `degraded` and never say `recovered`. The members poll confirms recovery anyway.
- **Shortening the wait.** When the callback reports `synced` or `recovered`, the client refetches members at once instead of waiting up to `MEMBERS_REFRESH_MS` (5 s).
- **Poll errors change nothing.** A failed members request while lost keeps the current state.
- **No `navigator.onLine`.**

**What each state shows.** `role="status"`, `data-testid="connection-banner"`, `data-state` set to the state, following `VersionBanner`.

| State | Look | Copy | Action |
|---|---|---|---|
| `Online` | no banner | — | — |
| `Lost` | `bg-muted`, `WifiOff` icon | "**You are offline.** Your edits stay in this browser and are dated when they sync." | — |
| `Reconnecting` | `bg-muted`, spinner | "**Reconnecting…** Your edits stay in this browser and are dated when they sync." | — |
| `Recovered` | `--online` at 15 % over `--background`, `Check` icon in `--foreground` | "**Back online**" | clears after 3 s |
| `Failed` | `--destructive` at 10 % over `--background`, `TriangleAlert` icon in `--destructive`, `role="alert"` | "**Editing is paused because the connection failed.**" then the reason | "Reload" |

- **When failed:**
  - The editor gets today's `inert` prop. The toolbar row and Summarize go inert too, and the page dims to 60 %.
  - "Reload" reopens the document: it runs the open query again and remounts the editor, so the page passes through "Loading document…".
  - The reason line comes from a record keyed by `ConnectionFailureReason`. The developer reads the callback's `detail` at runtime to see which reasons it can carry. An unrecognized `detail` is its own explicit `Unknown` branch, never a silent default.
- **Placement.** Under the top bar, above the toolbar row, full width. With a past version shown, it stacks above the version banner. At 375 it wraps to three lines and Reload stays on the right.

```
┌──────────────────────────────────────────────────────────────────────┐
│ top bar                                                              │
├──────────────────────────────────────────────────────────────────────┤
│ ◌ Reconnecting… Your edits stay in this browser and are dated when…  │  banner, only while not online
├──────────────────────────────────────────────────────────────────────┤
│ SuperDoc toolbar …                                 [✦ Summarize edits]│
```

Mockups:
- `mockup-connection-lost-1280.png`, `mockup-connection-reconnecting-1280.png`, `mockup-connection-recovered-1280.png`, `mockup-connection-failed-1280.png`
- the same four at 375
- `mockup-connection-reconnecting-dark-1280.png`
- the status pill option: `option-connection-pill-online-1280.png`, `option-connection-pill-reconnecting-1280.png`

### 1.15 Waiting page (ask 13)

- **When it shows.** The open request answers 409 `NOT_READY`: the document was opened before its creator's first sync committed. This page replaces today's dead-end notice for every role.
- **Polling.** The page asks again every `DOCUMENT_READY_POLL_MS` (2 s) and enters the room on its own when the answer is 200.
  - Polling pauses while the tab is hidden (TanStack's default) and resumes when it is visible.
  - After `DOCUMENT_READY_GIVE_UP_MS` (5 minutes) of visible waiting, polling stops and the page shows the paused state (option 6.13).
- **Layout.** The editor shell, so entering changes as little as possible.
  - The top bar has the brand link, the account button, and the title. The title shows when the documents list cache holds this document; otherwise a `Skeleton` takes its place. That is an explicit branch, not a placeholder title.
  - A skeleton of the toolbar row.
  - The `bg-muted` canvas with a white page of skeleton lines, `aria-hidden`.
  - A centred status card, 420 px wide, 120 px from the canvas top (64 px at 375), holding the message and its actions.
  - No members, no panel and no banner: none of them is known before the room exists.

```
desktop                                                          375
┌──────────────────────────────────────────────────────────┐    ┌──────────────────────────┐
│ [■] SuperDoc Collab │ ▒▒▒▒▒▒▒▒ (title or skeleton)   (AN)│    │ [■] ▒▒▒▒▒▒▒▒         (AN)│
├──────────────────────────────────────────────────────────┤    ├──────────────────────────┤
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ toolbar skeleton              │    │ ▒▒▒▒▒▒▒▒▒▒▒▒▒            │
├──────────────────────────────────────────────────────────┤    ├──────────────────────────┤
│░░░░░░░░┌───────────────────────────────────┐░░░░░░░░░░░░░│    │┌────────────────────────┐│
│░░░░░░░░│ ─────   ┌───────────────────────┐ │░░░░░░░░░░░░░│    ││┌──────────────────────┐││
│░░░░░░░░│ ──────  │ ◌ Preparing the docu… │ │░░░░░░░░░░░░░│    │││ ◌ Preparing the doc… │││
│░░░░░░░░│         │ It opens here on its… │ │░░░░░░░░░░░░░│    │││ It opens here on …   │││
│░░░░░░░░│ ─────── │ [Back to documents]   │ │░░░░░░░░░░░░░│    │││ [Back to documents]  │││
│░░░░░░░░│ ──────  └───────────────────────┘ │░░░░░░░░░░░░░│    ││└──────────────────────┘││
│░░░░░░░░│ page skeleton, aria-hidden        │░░░░░░░░░░░░░│    ││ page skeleton          ││
└──────────────────────────────────────────────────────────┘    └──────────────────────────┘
```

| State | Card | Actions |
|---|---|---|
| Waiting | spinner, "Preparing the document…", muted "It opens here on its own as soon as its owner has opened it once." | Back to documents |
| Paused | "The document is not ready yet", muted "We stopped checking after 5 minutes. Its owner has not opened it once." | Keep waiting (primary; restarts the clock), Back to documents |
| Error (any other failure) | `TriangleAlert`, "The document could not be loaded.", muted "Check your connection and try again." | Try again (primary), Back to documents |
| Entered | the card goes and the normal "Loading document…" then editor flow runs | — |

Mockups: `mockup-waiting-1280.png`, `mockup-waiting-375.png`, `mockup-waiting-with-title-1280.png`, `mockup-waiting-paused-1280.png`, `mockup-waiting-paused-375.png`, `mockup-waiting-error-1280.png`, `mockup-waiting-dark-1280.png`.

## 2. Components

**Existing, reused as they are:**

| Component | Path | Where |
|---|---|---|
| `Button` | `apps/web/src/components/ui/button.tsx` | every action |
| `Badge` | `apps/web/src/components/ui/badge.tsx` | Read only, For an earlier state |
| `Dialog` | `apps/web/src/components/ui/dialog.tsx` | Use with AI, Share, Delete |
| `Input` | `apps/web/src/components/ui/input.tsx` | title editing, filter |
| `Skeleton` | `apps/web/src/components/ui/skeleton.tsx` | panel loading |
| `ErrorMessage` | `apps/web/src/components/error-message.tsx` | rename, export, summary errors |
| `Members` | `apps/web/src/features/editor/members.tsx` | top bar |
| `ShareDialog` | `apps/web/src/features/editor/share-dialog.tsx` | top bar, owner |
| `ConnectSnippets`, `CopyButton` | `apps/web/src/features/connected-apps/` | Use with AI dialog |
| `Streamgraph`, `BandLabel`, `FilterBox`, `TopicChip`, `ContributorAvatars`, `AuthorAvatar`, `SelectionSummaryCard`, `TopEdits`, `BinEdits`, `TimelineNotices` | `apps/web/src/features/timeline/` | panel |
| `TimeZoneLabel` | `apps/web/src/features/settings/time-zone-label.tsx` | panel header |
| `VersionBanner`, `VersionFrame` | `apps/web/src/features/versions/` | time travel |

**Existing, changed:**

| Component | Change |
|---|---|
| `DropdownMenu` (`components/ui/dropdown-menu.tsx`) | Add shadcn's `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`, all from the same shadcn component on the installed `radix-ui` package |
| `HomeLink` (`features/editor/home-link.tsx`) | Becomes the brand link: mark and name, no arrow; moves to `components/brand-link.tsx` since every page uses it |
| `EditorHeader` (`features/editor/editor-header.tsx`) | Becomes the editor's right slot of `AppTopBar`; `TitleInput` becomes `DocumentTitle`; Download becomes `DownloadMenu`; More actions gains the narrow-width items |
| `TimelinePanel` (`features/timeline/timeline-panel.tsx`) | Takes a `PanelPosition`; loses the two header buttons; gains the position toggle and the collapsed bar |
| `ResizeHandle`, `usePanelWidth` | Gain an orientation, so one handle serves the column and the row |
| `SummarizeEditsButton` | Moves to the toolbar row; `variant="default"`; never disabled except while running |
| `SignOutButton` | Becomes the account menu's Sign out item; the sign-out flow stays as is |
| `DocumentsPage`, `SettingsPage`, `ConnectedAppsPage` | Their headers become `AppTopBar` |
| `SuperDocEditor`, `superdoc-options.ts` | Pass the toolbar container, `excludeItems`, `ui.search`; mark the toolbar `inert` while time-travelling. Pass `user.color` and `colors` from the author palette (1.12). Report `onCollaborationConnectionChange` and the awareness cursor positions upward (1.13, 1.14) |
| `Members` (`features/editor/members.tsx`) | Each member becomes a jump button or an `aria-disabled` button with a reason; "+N" overflow menu above five members; avatars via `UserAvatar` |
| `AuthorAvatar`, `ContributorAvatars` (`features/timeline/contributor-avatars.tsx`) | Render `UserAvatar` with the author's colour; keep the agent badge |
| `useMembers` (`features/editor/use-members.ts`) | Exposes whether the server sees the current user online, which confirms `Recovered` |
| `DocumentPage` (`features/editor/document-page.tsx`) | A 409 `NOT_READY` renders `WaitingForDocument` instead of `UnavailableNotice`; hosts the connection banner and passes `inert` when `Failed` |
| `useOpenedDocument` (`features/editor/use-opened-document.ts`) | Polls every 2 s while the answer is `NOT_READY`, stops at the give-up time |

**New app components:**

| Component | Path | Why |
|---|---|---|
| `AppTopBar` | `apps/web/src/components/app-top-bar.tsx` | One header for every signed-in page |
| `BrandLink` | `apps/web/src/components/brand-link.tsx` | Ask 4, shared |
| `AccountMenu` | `apps/web/src/features/account/account-menu.tsx` | Ask 6 |
| `useTheme`, `ThemePreference` | `apps/web/src/lib/use-theme.ts` | Ask 6; applies `.dark`, reads and writes localStorage |
| `DocumentTitle` | `apps/web/src/features/editor/document-title.tsx` | Ask 7 |
| `DownloadMenu` | `apps/web/src/features/editor/download-menu.tsx` | Ask 5; split button from `Button` and `DropdownMenu` |
| `FindButton` | `apps/web/src/features/editor/find-button.tsx` | Mock's search |
| `EditorToolbarRow` | `apps/web/src/features/editor/editor-toolbar-row.tsx` | Ask 3; toolbar container and Summarize |
| `UseWithAiDialog` | `apps/web/src/features/connected-apps/use-with-ai-dialog.tsx` | Ask 1 |
| `usePanelPosition`, `PanelPosition` | `apps/web/src/features/timeline/use-panel-position.ts` | Asks 2 and 8 |
| `PanelPositionToggle` | `apps/web/src/features/timeline/panel-position-toggle.tsx` | Asks 2 and 8 |
| Print view (option A only) | `apps/web/src/features/versions/print-view.tsx` | Ask 5 |
| `UserAvatar` | `apps/web/src/components/user-avatar.tsx` | Ask 10; one avatar, sizes 24 and 32 px, colour slot, agent badge, online dot |
| `authorColorSlot`, `AuthorColorSlot` | `libs/types/src/author-colors.ts` | Ask 10; the same slot on every client and in SuperDoc |
| `useMemberCursors` | `apps/web/src/features/editor/use-member-cursors.ts` | Ask 11; awareness positions by user id, from the spike |
| `ConnectionBanner` | `apps/web/src/features/editor/connection-banner.tsx` | Ask 12; follows `VersionBanner` |
| `useConnectionState`, `ConnectionState` | `apps/web/src/features/editor/use-connection-state.ts`, enum in `libs/types` | Ask 12; the transition table of 1.14 |
| `WaitingForDocument` | `apps/web/src/features/editor/waiting-for-document.tsx` | Ask 13 |

**New shadcn/ui components.** They are all on the installed `radix-ui` 1.8.1, so no new dependency. Owner decision 7.11.

| Component | Path | Why |
|---|---|---|
| `ToggleGroup` | `apps/web/src/components/ui/toggle-group.tsx` | Panel position: a two-item single-select group with roving focus |
| `Tooltip` | `apps/web/src/components/ui/tooltip.tsx` | Names for icon-only buttons: Find, position, collapse, download chevron, More, account. A `title` never shows on keyboard focus |
| `Tabs` | `apps/web/src/components/ui/tabs.tsx` | One client at a time in the Use with AI dialog; without it the dialog is four snippets long at 375 |

Not needed: `avatar` (no images, the initials circle exists), `popover`, `command`.

## 3. Tokens

### 3.1 From `globals.css`, by name

| Use | Token |
|---|---|
| Top bar, toolbar row, panel surfaces | `--background`, `--border` |
| Editor canvas | `--muted` |
| Primary actions (Share, Summarize, brand mark) | `--primary`, `--primary-foreground` |
| Hover on ghost buttons, title, menu items | `--accent` |
| Menus | `--popover`, `--popover-foreground` |
| Secondary text (hint, axis, deltas, time zone) | `--muted-foreground`, on `--background` only |
| Errors | `--destructive` |
| Focus ring | `--ring` at 50 % (`focus-visible:ring-[3px] ring-ring/50`, as `Button`) |
| Online dot | `--online` |
| Bands, swatches | `--topic-hue`, `--topic-saturation`, `--topic-lightness`, `--topic-other` |
| Inserted text in the page | `--inserted` (through `--sd-comment-highlight-*`) |
| Radius | `rounded-md` (`--radius-md`) on buttons, inputs, cards, callouts; `rounded-full` on chips and avatars |
| Spacing | top bar `h-13 px-3 gap-2`, toolbar row `h-10`, panel `px-4 pb-4 gap-6`; the 52 px and 41 px heights follow the 32 px controls plus `py-2` and a border |
| Type | Inter Variable (`--font-sans`); `text-sm` body, `text-xs` meta, `font-medium` headings in the panel, `font-semibold` brand. SuperDoc's toolbar keeps its own control font unless `--sd-ui-font-family` is mapped (3.2) |

### 3.2 SuperDoc variables mapped to our tokens

These are not new tokens: they are SuperDoc's documented variables pointed at ours in `globals.css`, the way `--sd-comment-highlight-*` already is.

| SuperDoc variable | Our token |
|---|---|
| `--sd-ui-font-family` | `--font-sans` |
| `--sd-ui-text` | `--foreground` |
| `--sd-ui-text-muted` | `--muted-foreground` |
| `--sd-ui-bg`, `--sd-ui-toolbar-bg` | `--background` |
| `--sd-ui-hover-bg` | `--accent` |
| `--sd-ui-border` | `--border` |
| `--sd-ui-action`, `--sd-ui-action-hover` | `--primary` |
| `--sd-layout-page-bg` | `--paper` (new, 3.3) |

### 3.3 Values the token set cannot express

| Need | Proposal | Owner decision |
|---|---|---|
| White paper in both modes. The editor's `[&_.superdoc-page]:bg-background` turns the paper black in dark mode, and DOCX text then sits at 1.57:1 | New `--paper`: `oklch(1 0 0)` in `:root` and `.dark` | 7.8 |
| Tinted topic callouts, as in the mock | New `--topic-tint-lightness`: 94 % light, 22 % dark, used as `hsl(var(--topic-hue) var(--topic-saturation) var(--topic-tint-lightness))` | 7.10 |
| White text on the dark `--primary` measures 3.61:1, under AA for 14 px text. The dark Summarize and Share buttons would fail | Change the dark `--primary` to `oklch(0.55 0.2 263)` (4.82:1) | 7.9 |
| One colour per person, matching SuperDoc cursors | Six new tokens in `:root` only, the same in dark mode: `--author-1: #2e39b8`, `--author-2: #5a2eb8`, `--author-3: #912eb8`, `--author-4: #b82ea8`, `--author-5: #b82e70`, `--author-6: #b82e39`, that is `hsl(235…355 60% 45%)`. Written in hex because SuperDoc's awareness colour is a plain colour string; the spike confirms the format it accepts | 7.18 |
| Banner tints | No new token: `bg-destructive/10` and `bg-online/15` over `--background`, Tailwind opacity on existing tokens, as `ring-ring/50` already does | — |

### 3.4 Durations

These live in `libs/types` next to `SECOND_MS` and convert at the edge.

| Constant | Value | Use |
|---|---|---|
| `RECOVERED_NOTICE_MS` | 3 s, or the existing three-second "Link copied" constant if one exists | how long "Back online" stays |
| `DOCUMENT_READY_POLL_MS` | 2 s | waiting page poll |
| `DOCUMENT_READY_GIVE_UP_MS` | 5 min | waiting page pause |
| `CURSOR_GLOW_MS` | 1.2 s | selection glow after a jump |
| `JUMP_FAILED_NOTICE_MS` | 3 s | "cursor could not be found" in the tooltip |

## 4. Copy

New and changed strings, ready for the copy files. Unchanged strings the screens reuse are named by constant.

`apps/web/src/lib/app-copy.ts` (unchanged): `APP_NAME`.

`apps/web/src/features/account/account-copy.ts` (new):

```ts
export const ACCOUNT_MENU_LABEL = 'Account';
export const THEME_LABEL = 'Theme';
export const THEME_LABELS: Record<ThemePreference, string> = {
  [ThemePreference.Light]: 'Light',
  [ThemePreference.Dark]: 'Dark',
  [ThemePreference.System]: 'System',
};
export function accountMenuLabel(name: string): string {
  return `${ACCOUNT_MENU_LABEL}, ${name}`;
}
```

Reused in the menu: `SETTINGS_LINK_LABEL`, `CONNECTED_APPS_HEADING`, `ADMIN_LINK_LABEL`, `SIGN_OUT_LABEL`.

`apps/web/src/features/editor/editor-copy.ts`:

```ts
export const FIND_IN_DOCUMENT_LABEL = 'Find in document';
export const DOWNLOAD_BUTTON_LABEL = 'Download';
export const DOWNLOAD_OPTIONS_LABEL = 'More download formats';
export const DOWNLOAD_PDF_LABEL = 'Download PDF';
export const PREPARING_PDF_MESSAGE = 'Preparing the PDF…';
export const PDF_FAILED_MESSAGE = 'The PDF could not be prepared.';
export const PDF_PRINT_HINT = 'Choose “Save as PDF” in the print dialog.';
export function renameTitleLabel(title: string): string {
  return `Rename ${title}`;
}
```

Kept: `DOWNLOAD_LABEL` ('Download .docx', now the menu item), `TITLE_LABEL`, `RENAME_FAILED_MESSAGE`, `EXPORT_FAILED_MESSAGE`, `MORE_ACTIONS_LABEL`, `DELETE_LABEL`, `SHARE_LABEL`, `HOME_LINK_LABEL`, `LOADING_DOCUMENT_MESSAGE`. Changed: `TIMELINE_TOGGLE_LABEL` from 'Toggle timeline' to 'Edits panel' (`aria-expanded` carries the state).

`apps/web/src/features/connected-apps/connected-apps-copy.ts`:

```ts
export const USE_WITH_AI_LABEL = 'Use with AI';
export const USE_WITH_AI_TITLE = 'Use this document with your AI';
export const USE_WITH_AI_DESCRIPTION =
  'Connect your AI client once. It asks you to approve access the first time, then works on every document you can open.';
export const EXAMPLE_PROMPTS_HEADING = 'Then try asking';
export const MANAGE_CONNECTED_APPS_LABEL = 'Manage connected apps';
export const CLOSE_LABEL = 'Close';
export const LIBRARY_PROMPTS: string[] = ['Summarize what changed in my documents today.', 'Which documents did Bruno edit this week?'];
export function documentPrompts({ title, canEdit }: { title: string; canEdit: boolean }): string[] {
  const readPrompts = [`Summarize what changed in “${title}” today.`, `Who edited “${title}” the most, and what did they change?`];
  if (!canEdit) return readPrompts;
  return [...readPrompts, `Fix the typos in “${title}”.`];
}
```

Kept: `CONNECT_DESCRIPTION`, `MCP_URL_LABEL`, `MCP_CLIENT_LABELS`, `MCP_SNIPPETS`, `CHATGPT_INSTRUCTION`, `COPY_LABEL`, `COPIED_LABEL`.

`apps/web/src/features/timeline/timeline-copy.ts`:

```ts
export const TIMELINE_HEADING = 'Edits';
export const RESIZE_PANEL_LABEL = 'Resize edits panel';
export const PANEL_POSITION_LABEL = 'Panel position';
export const PANEL_POSITION_LABELS: Record<PanelPosition, string> = {
  [PanelPosition.Bottom]: 'Bottom',
  [PanelPosition.Side]: 'Side',
};
export const GROUPING_TOPICS_MESSAGE = 'Grouping edits into topics…';
export const TOPICS_GROUPED_LABEL = 'Topics grouped';
export const NEXT_SUMMARIZING_LABEL = 'Then summarizing edits';
export const SUMMARIZING_LABEL = 'Summarizing…';
export function topicCountLabel(count: number): string {
  if (count === SINGLE_COUNT) return `${count} topic`;
  return `${count} topics`;
}
```

Removed: `REGROUP_TOPICS_LABEL`, `REGROUPING_TOPICS_MESSAGE`, `NOTHING_TO_GROUP_MESSAGE` (if 7.1 merges the jobs). Kept: `SUMMARIZE_EDITS_LABEL`, `SELECTION_SUMMARY_HEADING`, `SUMMARIZING_EDITS_MESSAGE`, `SUMMARY_UP_TO_DATE_MESSAGE`, `NO_EDITS_TO_SUMMARIZE_MESSAGE`, `SUMMARIES_UNAVAILABLE_MESSAGE`, `RETRY_SUMMARY_LABEL`, `EARLIER_STATE_LABEL`, `TOP_EDITS_LABEL`, `NO_EDITS_YET_MESSAGE`, `CHART_HINT`, `FILTER_PLACEHOLDER`, `retryInLabel`, `editDeltaLabel`; `LLM_BUSY_MESSAGE`, `TOPICS_UNAVAILABLE_MESSAGE` and `TOPICS_PENDING_MESSAGE` in `libs/types`.

`apps/web/src/features/editor/editor-copy.ts`, members (ask 11):

```ts
export const SELF_MEMBER_REASON = 'This is you';
export const BACK_TO_LIVE_TO_JUMP_REASON = 'Go back to live to jump to a cursor';
export function goToCursorLabel(name: string): string {
  return `Go to ${name}’s cursor`;
}
export function movedToCursorMessage(name: string): string {
  return `Moved to ${name}’s cursor.`;
}
export function cursorNotFoundMessage(name: string): string {
  return `${name}’s cursor could not be found.`;
}
export function offlineMemberReason(name: string): string {
  return `${name} is offline`;
}
export function notInDocumentReason(name: string): string {
  return `${name} is online but not in the document`;
}
export function moreMembersLabel(count: number): string {
  return `${count} more people`;
}
```

`apps/web/src/features/timeline/timeline-copy.ts`, imported authors (ask 10):

```ts
export function importedAuthorLabel(name: string): string {
  return `${name}, imported from the DOCX`;
}
```

`apps/web/src/features/editor/connection-copy.ts` (new, ask 12):

```ts
export const EDITS_KEPT_MESSAGE = 'Your edits stay in this browser and are dated when they sync.';
export const RELOAD_LABEL = 'Reload';
export const CONNECTION_LEADS: Record<Exclude<ConnectionState, ConnectionState.Online>, string> = {
  [ConnectionState.Lost]: 'You are offline.',
  [ConnectionState.Reconnecting]: 'Reconnecting…',
  [ConnectionState.Recovered]: 'Back online',
  [ConnectionState.Failed]: 'Editing is paused because the connection failed.',
};
export const CONNECTION_FAILURE_REASONS: Record<ConnectionFailureReason, string> = {
  [ConnectionFailureReason.AccessRemoved]: 'Your access to this document was removed.',
  [ConnectionFailureReason.SessionEnded]: 'Your session ended. Sign in again to keep editing.',
  [ConnectionFailureReason.Unknown]: 'Reload to try again.',
};
```

The `ConnectionFailureReason` members other than `Unknown` are provisional until the developer has seen what `detail` carries.

`apps/web/src/features/editor/editor-copy.ts`, waiting page (ask 13):

```ts
export const PREPARING_DOCUMENT_MESSAGE = 'Preparing the document…';
export const PREPARING_DOCUMENT_HINT = 'It opens here on its own as soon as its owner has opened it once.';
export const NOT_READY_PAUSED_HEADING = 'The document is not ready yet';
export const KEEP_WAITING_LABEL = 'Keep waiting';
export const TRY_AGAIN_LABEL = 'Try again';
export const LOAD_RETRY_HINT = 'Check your connection and try again.';
export const DOCUMENT_READY_ANNOUNCEMENT = 'The document is ready.';
export function notReadyPausedMessage(minutes: number): string {
  return `We stopped checking after ${minutes} minutes. Its owner has not opened it once.`;
}
```

Reused: `BACK_TO_DOCUMENTS_LABEL`, `DOCUMENT_LOAD_ERROR_MESSAGE`, `LOADING_DOCUMENT_MESSAGE`, `memberLabel`. `DOCUMENT_NOT_READY_MESSAGE` in `libs/types` stops being shown.

The rules hold: labels and noun phrases have no period ("Use with AI", "Topics grouped", "No edits yet"). Messages with a verb end with one ("The PDF could not be prepared."). Every ellipsis is `…`. The mockups' sample sentences and names are illustrative, not copy.

## 5. Interaction and accessibility

**Focus order, editor page.** The developer verifies the SuperDoc order on screen.

1. Brand link
2. Title button
3. Members, one tab stop each (they are few; "+N" above five)
4. Find
5. Use with AI
6. Share
7. Download
8. More download formats
9. More actions
10. Account
11. Connection banner's Reload, only when failed
12. SuperDoc toolbar, with its own arrow-key order
13. Summarize edits
14. Editor surface. Escape moves to today's "End of the editor" sentinel.
15. Panel resize handle
16. Position toggle, one tab stop with ← → inside
17. Collapse
18. Chart, one tab stop as today
19. Filter
20. Summary card actions
21. Top edits chips

Waiting page: Brand link, Account, then the card's actions (Keep waiting or Try again first, then Back to documents).

**Keyboard paths.**

| Control | Keys | Result |
|---|---|---|
| Title | Enter or Space | input with text selected |
| Title input | Enter | save, focus back on the title |
| Title input | Escape | cancel, focus back on the title |
| Download chevron, More, Account | Enter, Space, ↓ | menu opens on the first item |
| Menus | ↑ ↓, Escape | Escape returns focus to the trigger |
| Theme items | Enter or Space | apply now; the menu stays open so the change is visible |
| Use with AI | Enter | dialog; focus on the first tab; Escape returns to the button (or to More actions at 375, through `onCloseAutoFocus`, per `web-ui.md`) |
| Cmd+F or Ctrl+F in the editor | | SuperDoc's Find bar |
| Resize handle, bottom | ↑ ↓ | ±24 px |
| Resize handle, side | ← → | ±24 px |
| Position toggle | ← → then Enter or Space | move and store |
| Summarize edits | Enter or Space | 1.5; focus stays |
| Member avatar | Enter or Space | jump when available; otherwise nothing, the tooltip already shows the reason |
| "+N" members | Enter, Space, ↓ | menu of the other members, same rules |
| Reload | Enter or Space | reopen the document |
| Keep waiting, Try again | Enter or Space | restart polling, or retry once |

**What each control announces.**

| Control | Announcement |
|---|---|
| Brand link | "SuperDoc Collab, back to documents" |
| Title | "Rename Mutual Agreement…, button" |
| Find | "Find in document, button" |
| Download | "Download, button"; the chevron says "More download formats, menu button, collapsed" |
| Account | "Account, Ana, menu button" |
| Theme items | `menuitemradio`, "System, checked" |
| Position toggle | radio group "Panel position", "Bottom, selected" |
| Collapse | "Edits panel, expanded" |
| Summary card | `aria-live="polite"` announces each step and the result once |
| PDF toast | Sonner's live region announces "Preparing the PDF…" |
| Resize handle | `role="separator"`, `aria-orientation` per position, value in px as today |
| Member avatar | name from `memberLabel` ("Bruno, online"), description from the tooltip ("Go to Bruno’s cursor" or the reason); `aria-disabled` when it cannot jump |
| After a jump | visually hidden `role="status"`: "Moved to Bruno’s cursor." or "Bruno’s cursor could not be found." |
| Imported author avatar | "Chris Crawford, imported from the DOCX" |
| Connection banner | `role="status"` (polite) for lost, reconnecting and recovered; `role="alert"` for failed. Each state change is announced once, never on a re-render |
| Waiting card | `role="status"`, announced once on arrival. Polling never re-renders its text, so nothing repeats. Paused is announced through the same region. Error uses `role="alert"` |
| Entering the room | a persistent polite region on the document page says "The document is ready."; focus is not moved into the editor (`web-ui.md`) |

**Disabled controls.** Download disables only before the editor is ready, with "Loading document…" visible and linked by `aria-describedby`. Summarize disables only while it runs, and its label is the reason. Member avatars that cannot jump use `aria-disabled`, so they stay focusable and their tooltip shows the reason on focus. While failed, the editor, the toolbar row and Summarize are `inert`, and the banner above them is the reason. No other control is ever disabled.

**Motion.** Expanding or collapsing the panel and switching its position are instant. Menus and the dialog keep the shadcn fade and zoom, which `motion-reduce` turns off. Spinners stop under `prefers-reduced-motion` and the text stays. The jump scrolls smoothly, or instantly under reduced motion; the glow becomes a static outline for the same 1.2 s. The banners appear and leave without animation, so the layout shift is one step.

**Contrast**, measured in the browser from the oklch values with the WCAG formula:

| Pair | Light | Dark | Verdict |
|---|---|---|---|
| `--foreground` on `--background` | 19.8 | 18.97 | pass |
| `--muted-foreground` on `--background` | 4.74 | 7.66 | pass |
| `--muted-foreground` on `--card` | 4.74 | 6.94 | pass |
| `--muted-foreground` on `--muted` | 4.35 | — | fails AA: never place muted text on the canvas or `bg-muted`; snippets keep `--foreground` on `--muted` |
| `--primary-foreground` on `--primary` | 4.9 | 3.61 | dark fails; 4.82 with the 7.9 change |
| `--destructive` on `--background` | 4.77 | 6.85 | pass |
| `--foreground` on topic tint, hues 205, 145, 85, 25 | 17.33 to 18.79 | 6.28 to 10.35 | pass |
| `--primary-foreground` initials on each `--author-N` (235 to 355) | 5.04 at worst (pure white: 5.26 to 8.77) | same | pass; white on yellow (2.34) and green (2.61) would fail, one more reason for this half of the wheel |
| `--author-N` caret and flag on white paper (non-text, 3:1) | 5.26 to 8.77 | same, paper stays white | pass |
| `--foreground` on the lost and reconnecting banner (`--muted`) | 18.16 | higher | pass |
| `--foreground` on the failed banner tint (`--destructive` at 10 %) | 16.33 | 17.14 | pass |
| `--destructive` icon on the failed banner tint (non-text) | 3.93 | 6.19 | pass |
| `--foreground` on the recovered banner tint (`--online` at 15 %) | 16.88 | 15.47 | pass |
| `--online` icon on the recovered banner tint (non-text) | 2.56 | — | fails: the check icon uses `--foreground` instead |

The banner tints were measured as an sRGB mix over `--background`, which is what Tailwind's `bg-destructive/10` paints. An `oklch` `color-mix` of a hue with white drifts the hue: the recovered tint came out pink in the first mockup.
| `--foreground` on band label pill | 19.8 | 18.97 | pass |
| `--online` dot on `--background` (non-text, 3:1) | 3.0 | higher | pass, at the limit |
| Topic band at 62 % on `--background` (non-text) | 3.1 | — | pass; the band labels carry the name in text |
| DOCX text on paper | 15.91 on white paper | 1.57 if the paper follows `--background` | the reason for `--paper` |
| Icons on top bar and toolbar | same as `--foreground` | same | pass |

## 6. Options

### 6.1 PDF path (ask 5)

Image: `option-pdf-1280.png`, `option-pdf-375.png`.

- **A. Print view, saved as PDF by the browser.**
  - How: a hidden same-origin view of the live document, with SuperDoc read-only and virtualization off, plus a print stylesheet that keeps only the pages, one per sheet, then `print()`.
  - For: no dependency or server work; the PDF matches the screen.
  - Against: one extra dialog; the paper size follows the browser; iOS shows a share sheet.
- **B. Server conversion.**
  - How: LibreOffice headless or a Gotenberg sidecar behind a new endpoint.
  - For: one click and a real file; the MCP server could export PDF too.
  - Against: hundreds of MB in the image, a new parser to secure, a layout that can differ from the editor, and a 🔴 slice of its own.
- **Recommendation: A**, after a short spike. The spike proves that every page renders with virtualization off and that one 816 × 1056 page maps to one sheet. The owner picks.

### 6.2 Where "Summarize edits" sits (asks 3 and 9)

- **A. Our button at the right end of the toolbar row**, like the mock (`mockup-editor-bottom-1280.png`).
  - For: one button reachable from the document; our focus ring and states.
  - Against: one more element in the row at 375 (it fits: `mockup-editor-bottom-375.png`).
- **B. A SuperDoc custom toolbar item.** Verified truncated to "Sum…" and unstyled (`probe-toolbar-custom-item-1280.png`).
  - For: it lives inside the toolbar's overflow.
  - Against: SuperDoc owns its look, label and states.
- **C. In the panel header** (`option-summarize-in-panel-header-1280.png`).
  - For: next to its result.
  - Against: hidden when the panel is collapsed, which is the default on a phone.
- **Recommendation: A.**

### 6.3 Panel position default (asks 2 and 8)

Images: `mockup-editor-bottom-1280.png`, `mockup-editor-side-1280.png`, `mockup-editor-side-wide-1680.png`.

- **Wide breakpoint at 1536 px (`2xl`).** From there an 816 px page plus SuperDoc's card margin and a 420 px panel fit without shrinking the page. **Recommended.**
- **1440 px.** The page shrinks to about 90 % beside the panel.
- **1920 px.** Most laptops never see the side default.

### 6.4 Find (mock's search)

Image: `option-search-1280.png`.

- **A. Top-bar Find button**, like the mock.
  - For: matches the mock.
  - Against: our button must open SuperDoc's Find bar, unproven because `ui.search.open()` drew nothing.
- **B. Keep SuperDoc's search item in the toolbar.**
  - For: verified working.
  - Against: the top bar loses its search.
- **Recommendation: A, with a spike first, falling back to B.** Either way, `ui.search: true` turns on Cmd+F.

### 6.5 The palette icon

Image: `option-palette-1280.png`, `option-palette-375.png`.

- **A. Drop it; theme lives in the account menu. Recommended.**
- **B. A palette button that cycles Light, Dark, System.** It duplicates the menu and hides the next state.
- **C. Palette toggles "Colour by author" on the page.** That is a new feature, out of scope.

### 6.6 "Upload DOCX" placement

Image: `option-upload-1280.png`, `option-upload-375.png`.

- **A. Primary on the documents page; Share is the editor's primary. Recommended.**
- **B. Primary in every top bar, like the mock.** Two primaries compete, and inside a document "Upload" reads as "replace this one".

### 6.7 Document title pattern (ask 7)

Image: `option-title-1280.png`, `option-title-375.png`.

- **A. Text button that becomes an input on click.** This is what the owner asked. **Recommended.**
- **B. Always an input, borderless until hover.** One element, but it announces as an edit field and a stray click drops a caret in the title.

### 6.8 Topic callout style

Images: `mockup-editor-bottom-1280.png` (A), `option-callout-bar-1280.png` (B).

- **A. Tinted fill, like the mock.** Needs `--topic-tint-lightness`. **Recommended.**
- **B. A 3 px left bar in the band colour.** No new token, quieter, further from the mock.

### 6.9 How a person's colour is derived (ask 10)

Image: `mockup-member-jump-tooltip-1280.png`.

- **A. Hash of a stable author key into six slots, on every client. Recommended.**
  - For: the same colour in every document and session; no request; known before SuperDoc mounts, so the cursor colour is right from the first frame.
  - Against: in one document two people can share a colour (44 % for three people).
- **B. Slots in member order, per document.** Owner first, then by join time, then imported authors.
  - For: distinct colours within a document, up to six people.
  - Against: a person's colour changes between documents. Removing a member shifts the others. The members list loads after SuperDoc mounts, so a cursor would change colour once.
- **C. The server assigns and stores a slot per author per document.** Returned in members and timeline.
  - For: distinct and stable.
  - Against: a schema change and two API fields, a 🟡 slice of its own.

### 6.10 Avatar style (ask 10)

- **A. Solid fill, initials in `--primary-foreground`, the same in both modes. Recommended.** It is the cursor's exact colour, and every hue in the arc passes contrast.
- **B. Light tint with a 2 px ring in the person's colour and dark initials.** Softer next to the chart, but the fill no longer matches the cursor, and dark mode needs a second tint token.

### 6.11 Imported DOCX authors (ask 10)

- **A. Coloured by their name hash, like everyone, with "imported from the DOCX" in the tooltip. Recommended.** They are real people in the document's history.
- **B. Neutral `--topic-other` grey with a dashed ring.** It marks them as outsiders. But two imported authors become indistinguishable, and grey avatars already mean "no colour" today.

### 6.12 Where the connection state shows (ask 12)

The states and copy are fixed by the owner's brief; only the placement is open.

- **A. Full-width banner under the top bar, only while not online. Recommended.**
  - For: the required sentence ("Your edits stay in this browser and are dated when they sync.") is read without a hover. The failed state has room for its reason and Reload. It follows `VersionBanner`.
  - Against: it pushes the page down by one row while it shows.
  - Images: `mockup-connection-*-1280.png`, `mockup-connection-*-375.png`.
- **B. A permanent status pill next to the members.** It reads "Online", "Offline", "Reconnecting…", "Back online" or "Connection failed", and the sentence sits in a popover on hover or focus.
  - For: no layout shift, and the online state is always visible.
  - Against: the required sentence hides behind a hover, which is invisible on touch. The failed state still needs a banner for Reload. The pill hides below `sm` with the members. It adds a permanent element to a full top bar.
  - Images: `option-connection-pill-online-1280.png`, `option-connection-pill-reconnecting-1280.png`.

### 6.13 When the waiting page stops polling (ask 13)

- **A. Pause after 5 minutes of visible waiting, with "Keep waiting". Recommended.** A tab left open overnight stops asking. The user sees why it stopped and resumes in one click.
- **B. Poll forever, backing off from 2 s to 30 s after the first minute.** The page always enters on its own, but a forgotten tab polls until it is closed, and the slower poll delays the entry by up to 30 s.

## 7. Owner decisions

Answered by the owner on 2026-10-17: every recommendation accepted without change.

| # | Decision | Options | Recommendation | Owner's answer |
|---|---|---|---|---|
| 7.1 | Single "Summarize edits" job: what it runs | (a) regroup only stale topics, then the selection summary, then the topic sentences · (b) always regroup, then the rest · (c) keep the jobs separate behind one button that chains them on the client | (a). The merged server job is the lead's call. "Regroup topics" disappears, which supersedes ADR 0015's "Refresh is the way to re-cluster": a new ADR is needed. Topics with no new edits are never re-clustered on demand |  Recommendation, 2026-10-17 |
| 7.2 | PDF path | A browser print view · B server conversion | A, after a spike (6.1) |  Recommendation, 2026-10-17 |
| 7.3 | Wide breakpoint for the side default | 1440 · 1536 (`2xl`) · 1920 | 1536 |  Recommendation, 2026-10-17 |
| 7.4 | The mock's palette icon | drop, theme in the account menu · theme cycle button · colour by author | Drop (6.5) |  Recommendation, 2026-10-17 |
| 7.5 | Where "Summarize edits" sits | toolbar row · SuperDoc custom item · panel header | Toolbar row (6.2) |  Recommendation, 2026-10-17 |
| 7.6 | Find | top-bar button (spike) · SuperDoc toolbar item | Top-bar button, fallback to the toolbar item (6.4) |  Recommendation, 2026-10-17 |
| 7.7 | "Upload DOCX" placement | documents page primary · every top bar | Documents page (6.6) |  Recommendation, 2026-10-17 |
| 7.8 | Paper colour in dark mode | new `--paper` token, white in both modes · paper follows `--background` | `--paper`, white (3.3) |  Recommendation, 2026-10-17 |
| 7.9 | Dark `--primary` fails AA with white text (3.61:1) | lower lightness to 0.55 (4.82:1) · keep and accept | Lower to 0.55 |  Recommendation, 2026-10-17 |
| 7.10 | Topic callout | tinted fill with new `--topic-tint-lightness` · left bar, no token | Tinted fill (6.8) |  Recommendation, 2026-10-17 |
| 7.11 | New shadcn/ui components | `toggle-group`, `tooltip`, `tabs`, plus the dropdown-menu parts; all on the installed `radix-ui`, no dependency | Add all four |  Recommendation, 2026-10-17 |
| 7.12 | SuperDoc toolbar items | default set · trimmed set of 1.3 | Trimmed: no tracked-change accept/reject, ruler, measurement unit, document mode, search |  Recommendation, 2026-10-17 |
| 7.13 | Panel heading | "Timeline" · "Edits" | "Edits" |  Recommendation, 2026-10-17 |
| 7.14 | SuperDoc chrome in our tokens | map `--sd-ui-*` to our tokens · leave SuperDoc's grey theme | Map (3.2); without it dark mode stops at the toolbar |  Recommendation, 2026-10-17 |
| 7.15 | Brand mark | `FileText` in a primary square plus the name · name only | Mark plus name; a real logo can replace the square later |  Recommendation, 2026-10-17 |
| 7.16 | Panel at 375 | collapsed by default · open by default | Collapsed |  Recommendation, 2026-10-17 |
| 7.17 | Use with AI dialog layout | tabs per client · today's stacked snippets | Tabs |  Recommendation, 2026-10-17 |
| 7.18 | Author palette tokens | six `--author-N` tokens on hues 235–355, away from the topic arc · twelve hues on the whole wheel | Six on 235–355 (1.12, 3.3) |  Recommendation, 2026-10-17 |
| 7.19 | How a person's colour is derived | hash of the author key · member order per document · server-assigned slot | Hash (6.9) |  Recommendation, 2026-10-17 |
| 7.20 | Jump to a member's cursor: **feasibility to confirm by a spike** | ship if the spike maps the awareness cursor to a block id for `scrollToElement` · drop the jump and keep plain avatars | Spike first; ship only through the block-id route (1.13) |  Recommendation, 2026-10-17 |
| 7.21 | Avatar style | solid fill · tint with a ring | Solid fill (6.10) |  Recommendation, 2026-10-17 |
| 7.22 | Imported DOCX authors | coloured by name hash · neutral grey | Coloured (6.11) |  Recommendation, 2026-10-17 |
| 7.23 | Connection state placement | banner while not online · permanent status pill | Banner (6.12) |  Recommendation, 2026-10-17 |
| 7.24 | Waiting page stop rule | pause after 5 minutes · poll forever with backoff | Pause after 5 minutes (6.13) |  Recommendation, 2026-10-17 |
| 7.25 | Edits not yet synced when the connection fails: does Reload keep them? This is a question for the lead, because the failed copy must not promise what the client cannot keep | the lead confirms how SuperDoc keeps local edits across a remount, then the failed copy says so or warns | Confirm before the spec; until then the failed copy makes no claim about unsynced edits |  Recommendation, 2026-10-17 |
