# The Edits panel on a phone

**Status:** Approved
**Tier:** 🟡
**Owner approval:** approved 2026-10-18 (the owner's phone report; the design options were decided by the lead under the owner's delegation: height C, time travel B, loading B, the 44 px size variant accepted)
**ADRs:** [0038](../../adr/0038-phone-time-travel-confirms-with-an-inline-second-tap.md), [0031](../../adr/0031-one-summarize-job-runs-only-what-is-stale.md)
**Not changing:** the side panel at `lg` and up (resize handle, 420 px minimum, 40 % width, scrubbing on tap); the chart's key handlers and, from `lg`, its pointer handlers; the panel's height share; Escape and "Back to live" semantics; the summary job and its freshness rules; the `at` search parameter.

## Problem

On a phone the Edits panel opens at 58 dvh with the chart first; a tap on a bin selects it, but the selected time and the summary land below the chart, out of view, so the reader scrolls to see what they selected. A tap on a versioned bin moves the editor to that version with no confirmation and no visible loading, and the way back is a banner the reader has to find. See `design.md`.

## Goals

- Below `lg` (the one phone rule, the breakpoint that collapses the panel by default): the selected time, the character count and the clear control sit in a header pinned under the chart; a pointer tap scrolls the list so that header is in view.
- Below `lg`: a bin that holds a version needs the "View version" button to travel; selecting a bin, by pointer or by key, never travels. The version bar with "Back to live" sits above the editor and above the shared scroller while a version is shown or loading.
- While a version loads, on every width: a progress line under the version bar and the inner editor area dimmed. Below `lg` only: pointer taps on the chart are ignored, `aria-busy` is set on the chart wrapper and View version is disabled. Loading ends when the version frame is visible.
- The first timeline load shows a skeleton where the chart will be.
- Reduced motion turns the scroll animation and the pulse off.

## Non-goals

- A bottom sheet with drag gestures (design option A).
- Changes to the desktop layout, to the summary card's content or to the panel's height share (the pinned header is the fix; a smaller share would push it under the fold at 375 x 812).

## Design

### Data flow

1. `timeline-panel.tsx`, below `lg`: `SelectedHeader` renders. Below `md` the two column wrappers are `contents` so the header is a direct child of the scrolling grid; order: chart, header, filter, notices, card, bin edits. From `md` to `lg` the header sits at the top of the list column, which scrolls on its own. Nothing renders at `lg` and up.
2. `selected-header.tsx` (new, `features/timeline`): `SelectedHeader({ selection, canViewVersion, isViewVersionDisabled, onClear, onViewVersion })`; `selection` is `{ rangeLabel, volume } | null` (the bin's characters, labelled with the existing character count helper); with no selection it reads "Showing the whole document". `aria-live="polite"`.
3. No pending state. The panel computes `canViewVersion = isPhoneLayout && selectedBin.versionSequence !== null && selectedBin.start !== search.at`. `useBinSelection.selectIndex` never calls `onTravel` below `lg`, for pointer and keyboard alike. "View version" calls `onTravel(selectedBin.start)`; below `lg` that call writes `at` at once, without the 300 ms debounce, which stays for scrubbing from `lg`. Enter on the button travels.
4. `use-reveal-selected.ts` (new): a selection change that follows a pointer press scrolls the header with `scrollIntoView({ block: 'nearest', behavior })`, `behavior` from `useReducedMotion` (`lib/use-reduced-motion.ts`, new). Keyboard-driven and history-driven changes never reveal. `nearest` makes repeated reveals during a drag a no-op once the header is in view. The outer page scroller may move too; that is accepted.
5. Loading: `VersionFrame` reports `onReady(sequence)` when the requested frame becomes visible; `useTimeTravel.isLoading` is true from the moment `at` is set until then. The chart is locked only when `isLoading && requestedSequence !== null` and the layout is below `lg`, so an `at` without a version (a shared link, Back) never leaves the chart dead.
6. `document-page.tsx`: the inner editor div (`editor-surface`) takes the dim class while `isLoading`; the failed connection state keeps dimming the whole area. The progress line (`role="status"`, `animate-pulse motion-reduce:animate-none`) sits right under the bar: below `lg` both render before the layout div, from `lg` both sit in the editor area above the inner div.
7. `version-banner.tsx`: below `lg` the page renders the bar before the layout div, outside the shared scroller, so it stays at the top while the reader scrolls to the panel; "Back to live" uses the 44 px `touch` size and the bar's height follows its padding. From `lg` the bar keeps its place inside the editor area.
8. First load: a `Skeleton` with the chart's height, `role="status"`, named `LOADING_TIMELINE_LABEL`, while the timeline query `isPending`; `components/ui/skeleton.tsx` gains `motion-reduce:animate-none`.

### Interfaces

- `useTimeTravel` returns `isLoading` ending on frame ready and `reportReady(sequence)`; no `pendingVersion`, no `confirmTravel`.
- `VersionFrame` gains `onReady`.
- `Streamgraph` gains `isLoadingVersion: boolean` (pointer handlers only; keys unchanged); `aria-busy` is on the chart wrapper.
- `TimelinePanel` gains `isLoadingVersion`.
- `Button` gains the `touch` size variant (44 px).
- Copy in `timeline-copy.ts`: `SHOWING_WHOLE_DOCUMENT_MESSAGE`, `CLEAR_SELECTION_LABEL`, `VIEW_VERSION_LABEL`, `LOADING_TIMELINE_LABEL`, the existing `countLabel` with `EditUnit.Character`. There is no `viewVersionPrompt`.

### Failure handling

- A version load fails: the existing `VERSION_FAILED_MESSAGE` in the bar; the editor undims; the chart and View version work again.
- A tap on the chart during a load below `lg` is ignored and View version is disabled, so a second load cannot start. From `lg` the desktop handlers are unchanged.
- Arrow keys while viewing version A select bin B: the bar keeps naming A and the header names B. Accepted.
- Reduced motion: instant scroll, static progress line with its text.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Panel height | A sheet, B shrunk chart, C pinned header, D both | C, by the lead under delegation | 2026-10-18 |
| Going to an old version on a phone | A dialog, B inline second tap, C none | B: the owner asked for a confirmation; a dialog costs two taps everywhere | 2026-10-18 |
| Loading state | A skeleton, B progress line and dimmed editor, C spinner | B | 2026-10-18 |
| 44 px size variant | yes or no | yes | 2026-10-18 |

## Test strategy summary

- Unit (red first): `SelectedHeader` states (none, selection, version on phone, version on desktop); selecting never travels below `lg` and View version writes `at` at once, while from `lg` a tap still travels after the debounce; `useRevealSelected` by motion preference and by pointer, keyboard and history sources; `Streamgraph` ignores pointer taps while loading below `lg`; the frame-ready end of loading; the panel's phone order at 375 and 768, the header's parent being the scroller below `md`, and the skeleton; the copy.
- E2E at a 375 x 812 viewport, `e2e/final-visuals.spec.ts` or a new `e2e/summary-mobile.spec.ts`: open the panel, tap a bin, the pinned header is within the viewport and reads the bin's time; tap a versioned bin, nothing travels until "View version"; after it, the progress line shows, the editor is dimmed, then the version frame is ready and the pinned bar offers "Back to live"; Back to live returns to live. Desktop: a tap still travels at once.
- Walk at 375, 320 and 768 in both themes, and at 1280 to prove nothing changed.
