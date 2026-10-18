# Edits panel on phones: design

- Slug: `summary-mobile`
- Owner: Dhyego Calota
- Role: frontend-designer
- Status: proposal, awaiting owner decisions (section 12)
- Scope: widths below `lg` (1024 px). Nothing at `lg` and up changes.

## 1. What I verified and what I could not

Verified live on origin/main at `http://127.0.0.1:3200`, signed in as the demo owner, on a new blank document:

- 375 x 812, panel collapsed: the editor fills the top, and the bottom bar shows "Edits" with a chevron. Screenshot `.pr-media/summary-mobile/audit/01-editor-375-loaded.png`.
- 375 x 812, panel opened by the bar: the panel is 418 px tall and holds the heading, the filter and "No edits yet". The chart does not render with no edits. Screenshot `02-panel-open-375.png`.
- 320 x 568, panel collapsed: the bar is at the bottom and the document has no horizontal overflow. Screenshot `04-panel-open-320.png` (named for the walk, the panel was collapsed).

Not verified, because the editor did not accept typed text on this stack:

- The live editor showed "That edit could not be applied" and kept the body empty, before and after a reload. The cause is not diagnosed.
- Without edits there are no bins, so I could not tap a bin, observe the selected time, or walk a version transition.
- Everything below marked "code" comes from reading the code, not from a live walk. The cause of the editor failure is open and the owner should check it.

## 2. Problem, in the owner's words

Translated report: on phones the Edits panel should use the phone height better. Tapping the graph puts the selected timestamp below the fold, so the reader scrolls to see what they picked. Going back to an old version has no confirmation and no loading state.

Code facts behind it (code):

- Below `md` the panel body is one scrolling column: notices, chart (240 px), filter, summary card, bin edits. The selected bin's time and summary sit under the chart and the filter.
- The panel opens at 42 % of the area, or 58 % when compact (`apps/web/src/features/timeline/use-panel-width.ts:35-65`). The minimum is 240 px.
- The summary card scrolls into view only when a summarize run starts or lands (`selection-summary-card.tsx:74-91`). A tap scrolls nothing.
- A bin tap sets the selected time and, when the bin has a version, calls `travelTo` debounced 300 ms into the `at` search parameter (`use-time-travel.ts`, `use-timeline-search.ts`). Nothing navigates and nothing asks first.
- The version frame is an iframe that stays `invisible` until ready (`apps/web/src/features/versions/version-frame.tsx:72-80`). The banner says "Loading this version…" with `role="status"` (`version-banner.tsx`). The graph, the card and the editor show no pending state.
- The timeline renders nothing until it loads. Final-visuals `design.md:176` specified a `Skeleton` for the loading state, and it is not built.

## 3. Panel height on phones

Four options. Each reads as an extension of the document, not a second app.

**A. Bottom sheet with snap points.** The panel becomes a sheet with three stops: a 44 px bar, a peek stop of about 40 dvh showing the chart and the selected header, and an expanded stop of about 80 dvh. Drag and tap change the stop.
- For: the reader chooses how much document they keep. Keeps the document visible.
- Against: drag gestures inside a scrolling panel conflict with the chart's own pointer handling and with page scroll. More code and more test surface.

**B. Fixed share of dvh, chart shrunk.** The panel is 46 dvh by default at phone widths, the chart drops from 240 px to about 160 px, and the rest scrolls.
- For: smallest change, no gestures, one height rule.
- Against: a 568 px screen gives a 160 px chart and the selected header is still under it.

**C. Chart on top, selected header pinned under it.** The panel stays a 46 dvh box. Inside it the chart stays at the top, and a sticky header row sits directly under the chart with the selected time, the bin's edit count and the clear control. The card and the bin edits scroll below that row.
- For: the selected time is always visible while the reader scrolls the list. Uses existing components, no gestures.
- Against: the header takes about 44 px of the panel, so the scrolling area is smaller.

**D. Fixed panel share with the chart shrunk and the header pinned (B plus C).**
- For: combines both fixes.
- Against: two changes at once to one component.

**Recommendation: C.** It fixes the reported problem directly (the selected time stays in view) and changes no gesture. Use `position: sticky; top: 0` on the header inside the existing scroll container (`timeline-panel.tsx:184-209`, the `md:hidden`-free single column). Keep the panel height at its current formula but set the phone default to 46 dvh instead of 58 dvh, so the document keeps about half the screen.

## 4. The selected stays above the fold

What is pinned, what scrolls (recommended with option C):

| Element | Behaviour on phone |
|---|---|
| Bar with "Edits" and the expand control | Fixed at the bottom while collapsed. |
| Chart | Scrolls with the panel body, at the top. |
| Selected header (time, edit count, clear) | Sticky directly under the chart. Shows "Showing the whole document" when nothing is selected. |
| Filter | Scrolls below the chart. |
| Summary card and bin edits | Scroll below the header. |

Scroll-into-view on tap:

- A bin tap scrolls the list so the selected header is at the top of the scroll area. The chart stays where it is.
- Use `scrollIntoView({ block: 'nearest' })` on the header, matching the existing reveal in `selection-summary-card.tsx`.
- Use `behavior: 'smooth'` by default. When `prefers-reduced-motion: reduce` matches, use `behavior: 'auto'`. The app has no reduced-motion handling in the timeline today, so this is new and needs a small hook.
- Do not scroll when the tap comes from the keyboard focus that is already in view.

## 5. Time travel on phone

Current flow (code): tap a bin, the time moves at once, the version loads after 300 ms and the iframe appears. Escape or "Back to live" returns to live. No confirmation, no loading state on the graph or the editor.

Options for going back to an old version:

**A. Confirm dialog.** Tapping a bin with a version opens `components/ui/dialog.tsx` with "View this version?", the time and "Back to live" / "View version" buttons.
- For: explicit, matches the owner's wording.
- Against: every tap on a bin costs two taps. Viewing an old version is read-only and reversible in one tap, so the dialog protects nothing.

**B. Inline two-step tap.** The first tap on a versioned bin shows an inline line "View version from 14:05?" with a "View" button in the header. The second tap travels.
- For: no modal, one extra tap only for versions.
- Against: a second state to keep in sync with the selection.

**C. No confirmation, a prominent pinned "Back to live" with a loading state.** Travel on the first tap as today. Add a 44 px pinned bar above the editor while a version is shown or loading, with the time and "Back to live", and the loading state in section 6.
- For: smallest change, reversible, matches what the app already does for desktop. The loading state and the pinned exit remove the surprise the owner described.
- Against: does not add the confirmation the owner asked for.

**Recommendation: C.** Viewing a version changes nothing in the document and returns in one tap, so a confirmation adds a step without a benefit. The owner asked for a confirmation explicitly, so this is their call: if they keep it, choose B, not A, because A costs two taps on every version.

## 6. Loading state while a version loads

Options:

**A. Skeleton over the editor.** Cover the editor with a `Skeleton` until the frame reports ready. Matches final-visuals `design.md:176`.
- Against: hides the document the reader was on. The frame may take a second, and the cover flashes.

**B. Progress line and dimmed editor.** A 2 px indeterminate line under the pinned bar, the editor dims to opacity 60 (the same pattern as `FAILED_EDITOR_AREA_CLASS` in `document-page.tsx`), and the graph's selected bin is `aria-busy` and ignores further taps until the version is ready.
- For: the reader keeps their place and sees that something is happening.

**C. Spinner in the banner only.** Add a spinner beside "Loading this version…".
- Against: says nothing about the editor, which still looks interactive.

**Recommendation: B.** The progress line is `animate-pulse` with `motion-reduce:animate-none` (the same convention as `connection-banner.tsx`), so the text stays under reduced motion.

## 7. Phone layout and components

Reused, no new primitive needed:

- `timeline-panel.tsx` (layout, lines 184-209), `use-panel-width.ts` (height share, phone default), `use-panel-position.ts` (phone defaults to collapsed, unchanged).
- `streamgraph.tsx` (pointer and key handlers, unchanged), `use-bin-selection.ts`, `selection-summary-card.tsx` (reveal hook), `bin-edits.tsx`, `top-edits.tsx`, `streamgraph-legend.tsx`, `contributor-avatars.tsx`.
- `version-banner.tsx`, `version-frame.tsx`, `use-version-load.ts`.
- `components/ui/button.tsx` (44 px touch size via a size variant or a class).
- `components/ui/skeleton.tsx` for the first timeline load (already specified, not built).

New, one each, all under `features/timeline/`:

- `selected-header.tsx`: the sticky header under the chart. Justified because no existing row shows the selected time above the list.

Not used: a Sheet or Drawer primitive (option A of section 3 was not chosen), a Dialog (section 5 option C).

## 8. Tokens

From `apps/web/src/styles/globals.css`, by name:

- Surfaces: `--background` for the editor and the panel, `--muted` for the banner and the pinned header, `--border` for the separators.
- Text: `--foreground`, and `--muted-foreground` for the meta line.
- Radius and type: the existing `text-sm` body, `text-xs` meta, `font-medium` headings in the panel.
- Spacing: the panel keeps `px-4 pb-4 gap-3`. The pinned header uses `py-2`.

Open question for the owner: the pinned header's height is 44 px to match the touch size. No token for a 44 px control height exists; the button size variant carries it. Confirm that a size variant is acceptable.

## 9. Copy

Existing strings reused: `LOADING_VERSION_MESSAGE` ("Loading this version…"), `BACK_TO_LIVE_LABEL` ("Back to live"), `VERSION_FAILED_MESSAGE`, `NO_EDITS_IN_BIN_MESSAGE` ("No edits in this period"), `CHART_HINT`.

New strings, for `timeline-copy.ts`:

- `SHOWING_WHOLE_DOCUMENT_MESSAGE` = "Showing the whole document" (pinned header with no selection).
- `SELECTED_EDIT_COUNT_LABEL` = "{count} edits" (uses the existing `countLabel` helper where possible).
- `CLEAR_SELECTION_LABEL` = "Clear selection".

If option A of section 5 is chosen, add `CONFIRM_VERSION_TITLE` = "View this version?" and `CONFIRM_VERSION_ACTION_LABEL` = "View version". Option C adds none.

## 10. Accessibility

- Focus order: editor toolbar, panel bar or header, chart, pinned selected header, filter, summary card, bin edits. The pinned header is in the DOM before the card so the order matches the visual order.
- Live regions: the pinned selected header gets `aria-live="polite"` so a tap announces the time and count. The loading line is `role="status"` (already on the banner). Do not make the whole chart live.
- Touch targets: the bar, "Clear selection" and "Back to live" are at least 44 px high. The bins in the chart keep their current hit area, which the desktop design already sizes.
- Keyboard: arrow keys on the chart (existing) still select bins, and the header updates through the same live region.
- Contrast: every text and icon against `--background` and `--muted` must meet WCAG AA. I did not measure the token values; the reviewer should check them.
- Reduced motion: the scroll and the progress line honour `prefers-reduced-motion`, as described in sections 4 and 6.

## 11. Unchanged at lg and up

- Side panel, the column-resize handle, the 420 px minimum and the 40 % width.
- Desktop layout of the chart, filter and the two-column bottom panel.
- Escape and "Back to live" behaviour.
- The panel opens by default from `lg` (1024 px).

## 12. Owner decisions

1. Panel height on phones: A (sheet), B (shrunk chart), C (header pinned, recommended), or D.
2. Going back to an old version: A (dialog), B (inline two-step), or C (no confirmation, recommended, with pinned exit and loading).
3. Loading state: A (skeleton), B (progress line and dimmed editor, recommended), or C (banner spinner).
4. Confirm the 44 px size variant for the button.

## 13. Next steps (not done here)

- Re-run the walk once the editor accepts typed text on this stack. Capture the bin tap at 375 and 320, the version transition and "Back to live", under `.pr-media/summary-mobile/`.
- Check the contrast of the tokens in section 10 against the real values.
