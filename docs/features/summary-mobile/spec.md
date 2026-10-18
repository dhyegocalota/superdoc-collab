# The Edits panel on a phone

**Status:** Approved
**Tier:** 🟡
**Owner approval:** approved 2026-10-18 (the owner's phone report; the design options were decided by the lead under the owner's delegation: height C, time travel B, loading B, the 44 px size variant accepted)
**ADRs:** [0038](../../adr/0038-phone-time-travel-confirms-with-an-inline-second-tap.md), [0031](../../adr/0031-one-summarize-job-runs-only-what-is-stale.md)
**Not changing:** the side panel at `lg` and up (resize handle, 420 px minimum, 40 % width, scrubbing on tap); the chart's pointer and key handlers; Escape and "Back to live" semantics; the summary job and its freshness rules; the `at` search parameter.

## Problem

On a phone the Edits panel opens at 58 dvh with the chart first; a tap on a bin selects it, but the selected time and the summary land below the chart, out of view, so the reader scrolls to see what they selected. A tap on a versioned bin moves the editor to that version with no confirmation and no visible loading, and the way back is a banner the reader has to find. See `design.md`.

## Goals

- Below `lg`: the selected time, the edit count and the clear control sit in a header pinned under the chart; a tap scrolls the list so that header is in view; the panel opens at 46 dvh.
- Below `lg`: a versioned bin needs a second tap ("View version") to travel; the version bar with "Back to live" is pinned above the editor while a version is shown or loading.
- Every width: while a version loads, a progress line under the version bar, the editor dimmed, the selected bin `aria-busy`, taps on the chart ignored.
- The first timeline load shows a skeleton where the chart will be.
- Reduced motion turns the scroll animation and the pulse off.

## Non-goals

- A bottom sheet with drag gestures (design option A).
- Changes to the desktop layout or to the summary card's content.

## Design

### Data flow

1. `use-panel-width.ts`: the compact default share becomes a constant for phones (46 dvh); the formula and the bounds are unchanged.
2. `timeline-panel.tsx`, below `md`: chart, then `SelectedHeader` (sticky, `top: 0` inside the scroll container), then filter, summary card and bin edits. Above `md` the layout is unchanged.
3. `selected-header.tsx` (new, `features/timeline`): the selected bin's time range and edit count, "Clear selection", and, when the bin holds a version and the layout is a phone, "View version"; with no selection it reads "Showing the whole document". `aria-live="polite"`.
4. `use-reveal-selected.ts` (new): on a selection change from a pointer tap, `scrollIntoView({ block: 'nearest', behavior })` on the header, `behavior` from `useReducedMotion` (`apps/web/src/lib/use-reduced-motion.ts`, new, a `matchMedia` hook following the existing media hooks); no scroll when the change came from the keyboard with the header already in view.
5. `use-time-travel.ts`: below `lg` a versioned bin becomes `pendingVersion` instead of calling `travelTo`; `confirmTravel()` calls `travelTo`; at `lg` and up the tap travels as today. The breakpoint comes from the hook `use-panel-position.ts` already uses for the `lg` default.
6. Loading: `useVersionLoad` already exposes the pending state; `document-page.tsx` dims the editor area with the failed-state opacity while it is pending and renders the progress line (`animate-pulse motion-reduce:animate-none`) under the version bar; `streamgraph.tsx` receives `isLoadingVersion` and ignores pointer taps while true, marking the selected bin `aria-busy`.
7. `version-banner.tsx`: on phones the bar is pinned above the editor, 44 px high, with the time and "Back to live".
8. First load: `timeline-panel.tsx` renders a `Skeleton` with the chart's height while the timeline query is pending.

### Interfaces

- `SelectedHeader({ selection, hasVersion, isPhoneLayout, onClear, onViewVersion })`.
- `useTimeTravel` returns `pendingVersion: VersionReference | null` and `confirmTravel()` in addition to today's fields.
- `Streamgraph` gains `isLoadingVersion: boolean`.
- `Button` gains the `touch` size variant (44 px) in `components/ui/button.tsx`.
- Copy in `timeline-copy.ts`: `SHOWING_WHOLE_DOCUMENT_MESSAGE`, `CLEAR_SELECTION_LABEL`, `VIEW_VERSION_LABEL`, `viewVersionPrompt(time)`; `selectedEditCount(count)` reuses the existing count helper.

### Failure handling

- A version load fails: the existing `VERSION_FAILED_MESSAGE` in the bar; the editor undims; the chart accepts taps again.
- A tap during a load: ignored, the bin stays `aria-busy`; no second request.
- Reduced motion: instant scroll, static progress line with its text.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Panel height | A sheet, B shrunk chart, C pinned header, D both | C, by the lead under delegation | 2026-10-18 |
| Going to an old version on a phone | A dialog, B inline second tap, C none | B: the owner asked for a confirmation; a dialog costs two taps everywhere | 2026-10-18 |
| Loading state | A skeleton, B progress line and dimmed editor, C spinner | B | 2026-10-18 |
| 44 px size variant | yes or no | yes | 2026-10-18 |

## Test strategy summary

- Unit (red first): `SelectedHeader` states (none, selection, version on phone, version on desktop); `useTimeTravel` two-step below `lg` and direct travel at `lg`; `useRevealSelected` behaviour by motion preference and input source; `Streamgraph` ignores taps while loading; the panel's phone order and skeleton; `use-panel-width` phone share; the copy.
- E2E at a 375 x 812 viewport, `e2e/final-visuals.spec.ts` or a new `e2e/summary-mobile.spec.ts`: open the panel, tap a bin, the pinned header is within the viewport and reads the bin's time; tap a versioned bin, nothing travels until "View version"; after it, the progress line shows, the editor is dimmed, then the version frame is ready and the pinned bar offers "Back to live"; Back to live returns to live. Desktop: a tap still travels at once.
- Walk at 375 and 320 in both themes, and at 1280 to prove nothing changed.
