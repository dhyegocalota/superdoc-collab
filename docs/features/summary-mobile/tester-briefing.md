# Tester briefing: The Edits panel on a phone

Written by developer-sm. The developer did not run `test-plan.md`, did not run the E2E and does not declare the feature works.

## What changed

Reworked after the plan review (spec, plan and test plan commit ff9f841). One phone rule: below `lg`.

- `selected-header.tsx` (new): sticky header with the bin's range, character count, Clear selection and View version (`canViewVersion`, disabled while a version loads). Live region `aria-live="polite"`.
- `use-reveal-selected.ts`, `lib/use-reduced-motion.ts` (new): only a pointer press reveals the header (`block: 'nearest'`, smooth or instant by motion preference); keys and history changes never do. The outer page scroller may move too; accepted.
- `timeline-panel.tsx`: below `lg` the header renders. Below `md` the column wrappers are `contents`, so the header's layout parent is the scrolling grid; from `md` to `lg` it tops the list column. `canViewVersion` derives from the selected bin and `at` (versioned and not the bin viewed). Below `lg` selecting never calls `onTravel`; View version calls `onTravel(selectedBin.start)`. A skeleton (`role="status"`, `LOADING_TIMELINE_LABEL`) shows while the timeline is pending. The height share is unchanged.
- `use-time-travel.ts`: below `lg` `travelTo` writes `at` at once; from `lg` it keeps the 300 ms debounce. `isLoading` ends when the version frame is visible (`reportReady`).
- `version-frame.tsx`: `onReady(sequence)` when the requested frame is visible.
- `streamgraph.tsx`: `isLoadingVersion` drops pointer presses and drags; `aria-busy` is on the chart wrapper. The panel passes it only below `lg` and only with a requested sequence. Keys untouched.
- `document-page.tsx`: the inner editor div (`editor-surface`) dims while a version loads; the failed connection still dims the whole area. A progress line (`role="status"`) sits between the banner and the editor. Below `lg` the version bar and the progress line render before the layout div, outside the shared scroller and the dimmed area.
- `version-banner.tsx`: "Back to live" uses the 44 px `touch` size below `lg`.
- `components/ui/button.tsx` (`touch`), `components/ui/skeleton.tsx` (`motion-reduce:animate-none`), `timeline-copy.ts` (new strings).
- `e2e/summary-mobile.spec.ts` (new), `e2e/timeline.ts` (`chartSvg`, `clickChart`), `docs/features/README.md` row.

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

Rework rows (the first-round rows above for the two-step, the sticky bar and the 46 percent share are superseded):

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `use-panel-width.test.ts` (58 percent), `timeline-panel.test.tsx` skeleton label and still motion, `timeline-copy.test.ts` label, 87aaae8 | the share was 46 percent; the label was empty; no `motion-reduce` | 3b70dea |
| `selected-header.test.tsx::a bin that can be viewed ...`, `::View version is disabled ...`, `timeline-panel.test.tsx::below lg selecting a versioned bin by key never travels ...`, `::View version is disabled while a version loads`, `::below md the header sits in a contents wrapper ...`, `::from md to lg the header tops the list column`, `streamgraph.test.tsx::taps ...` (aria-busy on the wrapper, two), `time-travel.test.tsx::below lg selecting a versioned bin never travels ...`, `::a loading version dims ... until the frame is visible`, `::below lg a pointer tap during a load is ignored`, `::from lg a tap during a load still travels ...`, `::an at with no version never locks the chart`, 37037d3 | assertion failures on the old behaviour (thirteen red) | cc731fa |
| `time-travel.test.tsx::a loading version dims ...` (inner editor), `::below lg the version bar sits before the layout ...`, 7fd37e0 | the dim sat on the area and the bar was sticky inside the scroller | f47b5d2 |
| `use-reveal-selected.test.ts::a keyboard selection never scrolls`, `::a change after the pointer was released ...`, b-commit "only a pointer press reveals the header, red" | the hook scrolled on keys out of view and after release | 59e8f2a |

Reviewer-round rows:

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `selected-header.test.tsx`, `timeline-panel.test.tsx` (`10 characters`, `12 characters`), e774709 | the header counted "edits" with a new unit | d800802 uses the existing character count |
| `time-travel.test.tsx::below lg the progress line follows the bar outside the dimmed editor area`, e774709 | the line sat inside the editor area | 4f213db |
| `timeline-panel.test.tsx::an at inside the selected bin offers no View version`, be8907c | the check compared `start` with `at` | 4d0d339 compares bin indexes |
| `time-travel.test.tsx::an at beyond the last bin never dims the editor or shows a progress line`, be8907c | the dim followed `isLoading` alone | 474df3f needs a requested version |

The keyboard cases of `use-reveal-selected.test.ts` were corrected in f9444b4: the red commit dispatched the key before the hook mounted, so its listener never saw it.

## Hypotheses to attack

1. Hypothesis: below `lg` the header stays pinned while the list scrolls at 375 (the grid scrolls) and at 768 (the list column scrolls). Break it by: scrolling with a long list of edits.
2. Hypothesis: nothing travels below `lg` until View version, by pointer or key; the URL has no `at` and no version request fires; the click writes `at` at once. Break it by: tapping and arrowing across versioned bins, waiting past 300 ms, then pressing View version.
3. Hypothesis: View version names the selected bin and disappears for the bin already viewed. Break it by: arrows while viewing version A (the bar keeps A, the header shows B, accepted).
4. Hypothesis: while a version loads below `lg` chart presses and drags do nothing, View version is disabled, keys work; an `at` with no version never locks the chart. Break it by: a double tap, a drag, a shared link to a bin without a version.
5. Hypothesis: loading ends when the frame is visible, not when the data arrives; the failed path undims and unlocks. Break it by: throttling the viewer page, forcing a 503.
6. Hypothesis: only the inner editor dims, never the bar; typing in the dimmed editor changes nothing. Break it by: typing during a held load.
7. Hypothesis: below `lg` the version bar stays at the top while the page scrolls to the panel. Break it by: scrolling the page at 375 with a version shown.
8. Hypothesis: from `lg` nothing changed: no header, the tap travels after the debounce, the bar sits in the editor area with the small button, the chart is never locked. Break it by: the same flows at 1280 and 1536, bottom and side.
9. Hypothesis: reduced motion makes the reveal instant and stops both pulses. Break it by: emulating `prefers-reduced-motion: reduce`.

## Known gaps

- The E2E spec was typechecked, not run. Its clicks use fractions of the chart svg bounding box (centre and 90 percent), never fixed pixels.
- The header's layout parent below `md` is the scrolling grid, but its DOM parent is the `contents` wrapper of the chart column; the unit test asserts exactly that.
- The header's count is the bin's inserted plus deleted characters, labelled with the existing character unit ("12 characters"), like the tooltip.
- With one bin in the E2E, the second chart click during a load hits the same bin, so it proves the lock but not a change of selection.
- Smooth scroll is unit-tested with a mock, not observed in a browser. jsdom has no `scrollIntoView`, so tests that render the panel below `lg` stub it on the prototype.
- Real touch input is not exercised; the E2E uses mouse clicks at a phone viewport.
