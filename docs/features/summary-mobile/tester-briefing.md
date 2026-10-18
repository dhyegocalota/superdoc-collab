# Tester briefing: The Edits panel on a phone

Written by developer-sm. The developer did not run `test-plan.md`, did not run the E2E and does not declare the feature works.

## What changed

- `apps/web/src/features/timeline/selected-header.tsx` (new): the sticky header with the bin's range, its edit count, Clear selection and, on a phone with a pending version, View version. Live region `aria-live="polite"`.
- `apps/web/src/features/timeline/use-reveal-selected.ts` (new) and `apps/web/src/lib/use-reduced-motion.ts` (new): after a selection change the header scrolls into view (`block: 'nearest'`), smooth or instant by motion preference. A change that follows a key press with the header already inside the scroller does not scroll.
- `timeline-panel.tsx`: the header sits under the chart whenever the viewport is below `lg`; the two column wrappers are `display: contents` below `md` so the header is a direct child of the scrolling body; a `Skeleton` with the chart height shows while the first timeline request is pending; the panel takes `pendingVersion`, `isLoadingVersion` and `onConfirmTravel`.
- `use-time-travel.ts`: below `lg` a tap on a versioned bin other than the viewed one sets `pendingVersion`; `confirmTravel()` travels through the existing 300 ms debounce. At `lg` and up the tap travels as before.
- `streamgraph.tsx`: `isLoadingVersion` drops pointer presses and drags and sets `aria-busy` on the chart svg. Keys are untouched.
- `document-page.tsx`: while a version loads the editor area takes the dim class (renamed from the failed-state constant, same `opacity-60`) and a `role="status"` progress line follows the version bar.
- `version-banner.tsx`: below `lg` the bar is `sticky top-0 z-10 min-h-11` and "Back to live" uses the new `touch` button size.
- `components/ui/button.tsx`: `touch` size, 44 px.
- `use-panel-width.ts`: the compact share is 46 percent (was 58).
- `timeline-copy.ts`: `SHOWING_WHOLE_DOCUMENT_MESSAGE`, `CLEAR_SELECTION_LABEL`, `VIEW_VERSION_LABEL`, `LOADING_TIMELINE_MESSAGE`, `EditUnit.Edit`, `selectedEditCount`.
- `e2e/summary-mobile.spec.ts` (new), `docs/features/README.md` row.

## How to run

```bash
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline src/features/versions/time-travel.test.tsx src/features/editor/document-page.test.tsx src/lib/use-reduced-motion.test.ts
pnpm typecheck
pnpm exec playwright test e2e/summary-mobile.spec.ts
```

Developer ran: the vitest files above (green) and `pnpm typecheck` (green, includes e2e). Not run: the E2E spec and the Playwright MCP walk.

## Red today, green after

Red hashes are the test commits; the failure text is what the red run printed. Tests marked pin were green when they landed.

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `selected-header.test.tsx` (six tests), red 3f20e65 | `Error: SelectedHeader is not implemented` | a0dd53c renders the four states |
| `timeline-copy.test.ts::the selected header copy ...`, 3f20e65 | `AssertionError: expected '' to be 'Showing the whole document'` | a0dd53c |
| `use-reduced-motion.test.ts` (three), b155fe9 | `Error: useReducedMotion is not implemented` | f9444b4 |
| `use-reveal-selected.test.ts` (five), b155fe9 | `Error: useRevealSelected is not implemented` | f9444b4 |
| `timeline-panel.test.tsx::below md the order is chart, header, filter, card, edits ...`, 287564d | `Unable to find an element with the text: Showing the whole document` | 06f0415 |
| `timeline-panel.test.tsx::the header lives under the chart in the chart column ...`, `::a tap on the chart scrolls the header into view`, `::selecting a bin puts its range and edit count in the header ...` | same `Unable to find an element with the text` (and `10 edits`) | 06f0415 |
| `timeline-panel.test.tsx::the first load shows a status skeleton with the chart height` | `Unable to find role="status" and name "Loading edits…"` | 06f0415 |
| `timeline-panel.test.tsx::from the large breakpoint there is no header`, `::once the timeline is loaded the skeleton is gone` | pin | pin |
| `time-travel.test.tsx::below lg a versioned bin waits for View version ...`, `::below lg Back to live drops the pending version`, `timeline-panel.test.tsx::View version shows when the pending version names the selected bin ...`, b6913df | `Unable to find role="button" and name "View version"` | 465ba4d |
| `time-travel.test.tsx::from lg a versioned bin travels on the tap ...`, `timeline-panel.test.tsx::View version stays hidden ...` (two) | pin | pin |
| `streamgraph.test.tsx::taps are ignored while a version loads ...`, bc07597 | `expected "vi.fn()" to not be called at all, but actually been called 2 times` | 5eec8af |
| `streamgraph.test.tsx::taps select and the chart is not busy ...` | `expect(element).toHaveAttribute("aria-busy", "false")` (attribute missing) | 5eec8af |
| `streamgraph.test.tsx::keys still move the selection while a version loads` | pin | pin |
| `time-travel.test.tsx::a loading version dims the editor area and shows a progress line ...`, `::a tap on the chart during a load is ignored`, 0fc9a8c | `Unable to find an accessible element with the role "status" and name "Loading this version…"` | 005a892 |
| `time-travel.test.tsx::below lg the version bar is pinned ...` | `expect(element).toHaveClass("sticky top-0 min-h-11")` | 005a892 |
| `time-travel.test.tsx::from lg the version bar keeps its place and its small button` | pin | pin |
| `use-panel-width.test.ts::below sm the default height is 46 percent ...`, `timeline-panel.test.tsx::the bottom panel has a row resize handle ...`, e374fa6 | `AssertionError: expected 0.58 to be 0.46` (and the panel default height 580 against 460) | 24489b0 |

The keyboard cases of `use-reveal-selected.test.ts` were corrected in f9444b4: the red commit dispatched the key before the hook mounted, so its listener never saw it.

## Hypotheses to attack

1. Hypothesis: below `lg` the header stays pinned while the list scrolls, in both the single column and the two-column bottom panel between `md` and `lg`. Break it by: scrolling the panel body at 375 and at 800 px with a long list of edits and watching for the header leaving the top.
2. Hypothesis: a tap never travels below `lg` until View version; the URL has no `at` and no version request fires. Break it by: tapping a versioned bin and waiting more than 300 ms, then tapping the same bin twice, then a versioned bin followed by a bin without a version (View version must disappear).
3. Hypothesis: a keyboard move on a phone viewport names the right bin in View version. Break it by: ArrowRight across versioned and unversioned bins and reading the header after each step.
4. Hypothesis: during a load a chart press and drag do nothing and keys still work. Break it by: a double tap, a drag across the chart, and arrow keys while the progress line shows.
5. Hypothesis: the failed-load path undims the editor and the chart accepts taps again. Break it by: forcing the version request to fail (503) and tapping the chart.
6. Hypothesis: Escape and Back to live from a pending selection clear the pending version. Break it by: selecting a versioned bin on a phone, pressing Escape in the chart, and checking that View version is gone.
7. Hypothesis: the desktop layout is unchanged from `lg`: no header, a tap travels at once, the version bar is not sticky, the button is the small one. Break it by: the same flows at 1280 and 1536 with the panel at the bottom and at the side.
8. Hypothesis: reduced motion makes the reveal instant and stops the progress pulse. Break it by: emulating `prefers-reduced-motion: reduce` and tapping a bin while watching the scroll.

## Known gaps

- The E2E spec was typechecked, not run. Its pixel positions (`x: 1` and `x: 340` on the chart) assume a chart about 343 px wide at 375.
- `aria-busy` is on the chart svg, not on a bin: a bin is no element, and the test plan's wording "the selected bin `aria-busy`" is satisfied by the chart that holds it.
- `viewVersionPrompt(time)` from the spec is not built: the header already shows the range next to the button, so the prompt would be unused text.
- The "edit count" is the bin's inserted plus deleted characters across bands, labelled "edits" (`1 edit`, `12 edits`). It is a volume, not a count of edit operations. The owner may want a different label.
- Between `md` and `lg` the pending version and the header apply too (the rule is "below `lg`"), although the spec's layout paragraph speaks of `md`. There the header is the second item of the chart column.
- Below `lg` the progress line is a sibling after the sticky bar and scrolls away with the page; only the bar is pinned.
- The loading dim covers the whole editor area, so the version bar itself is dimmed to 60 percent during a load, as the failed state already dims its area.
- The cross-page scroll behaviour (smooth scroll into view) is unit-tested with a mock, not observed in a browser. jsdom has no `scrollIntoView`, so tests that render the panel with a phone viewport stub it on the prototype.
- Real touch input is not exercised; the E2E uses mouse clicks at a phone viewport.
