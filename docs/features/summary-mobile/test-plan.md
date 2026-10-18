# Test plan: The Edits panel on a phone

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/timeline/selected-header.test.tsx::a selected bin shows its time range, its character count and Clear selection` — input: a selection with a volume of 12; expected: the range, "12 characters" and a "Clear selection" button
- [ ] Confirmed it fails for the right reason: `SelectedHeader is not implemented`

## Unit

- [ ] `selected-header.test.tsx::no selection reads Showing the whole document` — input: `selection: null`; expected: that text, no buttons
- [ ] `selected-header.test.tsx::a bin that can be viewed offers View version` — input: `canViewVersion: true`; expected: the "View version" button, `onViewVersion` called on click
- [ ] `selected-header.test.tsx::a bin that cannot be viewed offers no View version` — input: `canViewVersion: false`; expected: no such button
- [ ] `selected-header.test.tsx::View version is disabled while a version loads` — input: `canViewVersion: true, isViewVersionDisabled: true`; expected: the button is disabled
- [ ] `use-reduced-motion.test.ts` — input: `matchMedia` reduce true, then false; expected: `true`, then `false`, updates on change
- [ ] `use-reveal-selected.test.ts::a pointer selection scrolls the header into view smoothly` — expected: `scrollIntoView({ block: 'nearest', behavior: 'smooth' })`
- [ ] `use-reveal-selected.test.ts::reduced motion scrolls instantly` — expected: `behavior: 'auto'`
- [ ] `use-reveal-selected.test.ts::a keyboard selection never scrolls` — expected: no call
- [ ] `use-reveal-selected.test.ts::a change after the pointer was released, such as Back, never scrolls` — expected: no call
- [ ] `timeline-panel.test.tsx::below md the order is chart, header, filter, card, edits` — expected: DOM order, header `sticky`
- [ ] `timeline-panel.test.tsx::the first load shows a skeleton` — input: timeline pending; expected: a status skeleton with the chart height
- [ ] `time-travel.test.tsx::below lg selecting a versioned bin never travels, View version writes at at once` — expected: no `at` change on tap or key; `at` set right after the click, no debounce
- [ ] `timeline-panel.test.tsx::the bin already shown offers no View version` — input: `at` equals the selected bin; expected: no button
- [ ] `time-travel.test.tsx::at lg a versioned bin travels on tap` — expected: `at` set after the debounce
- [ ] `streamgraph.test.tsx::taps are ignored while a version loads` — input: `isLoadingVersion: true`; expected: `onSelectIndex` not called, the chart wrapper `aria-busy="true"`
- [ ] `time-travel.test.tsx::an at with no version never locks the chart` — expected: taps select
- [ ] `time-travel.test.tsx::loading ends when the frame is visible` — expected: dim and progress line gone after the ready message
- [ ] `timeline-panel.test.tsx::the header's parent is the scroll container below md, and at 768 it tops the list column`
- [ ] `streamgraph.test.tsx::keys still move the selection while a version loads` — expected: `onSelectIndex` called on ArrowRight
- [ ] `time-travel.test.tsx::a loading version dims the editor area and shows a progress line under the bar until the frame is visible` — expected: `editor-surface` has the dim class, the bar does not, a `role="status"` line follows the bar and goes after the ready message
- [ ] `time-travel.test.tsx::below lg the version bar sits before the layout, outside the shared scroller, with a 44 px button` and `::below lg the progress line follows the bar outside the dimmed editor area` — expected: the bar and the line sit before the layout div, the button has the `touch` size
- [ ] `time-travel.test.tsx::from lg the version bar keeps its place and its small button` — expected: the bar inside the editor area, the `sm` size
- [ ] `timeline-copy.test.ts` — the new strings (no `viewVersionPrompt`)
- [ ] `pnpm --filter @superdoc-collab/web test:unit`; expected: green

## E2E (Playwright specs)

- [ ] `e2e/summary-mobile.spec.ts::on a phone a tap keeps the selected header in view and a version needs View version` — viewport 375 x 568; steps: open a document with bins and a version, open the panel, tap a bin; expected: the header is inside the viewport and names the bin; tap a versioned bin; expected: the URL has no `at`; press View version; expected: the progress line, the dimmed editor, then the version frame ready and the pinned bar with Back to live; press it; expected: live again
- [ ] `e2e/summary-mobile.spec.ts::on desktop a tap travels at once` — viewport 1280; expected: `at` set after one tap

## Prove it for real — Playwright MCP

- [ ] Happy path at 375 x 812: sign in, open a document with edits over several minutes, open the panel; expected: the usual panel height, chart on top, the header under it
- [ ] Tap three different bins; expected: the header updates and stays in view each time, the card scrolls under it
- [ ] Versioned bin: a tap selects, "View version" visible; pressing it: progress line, dimmed editor (not the bar), View version disabled, the old version, the bar at the top with "Back to live"; Back to live restores the live editor
- [ ] Double tap during a load; expected: one version load only, the second tap ignored
- [ ] 320 x 568: no horizontal scroll, the header and the bar readable, the buttons at least 44 px
- [ ] Reduced motion (emulate `prefers-reduced-motion: reduce`): the scroll is instant and the progress line does not pulse
- [ ] Dark theme at 375: the header, the bar and the progress line readable
- [ ] 768 x 1024: the header tops the list column, View version works, nothing overflows
- [ ] Desktop 1280: side panel unchanged, a tap travels at once, no header pinned
- [ ] Keyboard at 375: arrow keys move the selection, the live region announces the time, Enter on View version travels
- [ ] Console and network clean: zero console errors, zero failed requests
- [ ] Screenshots at `.pr-media/summary-mobile/`; video at `.pr-media/summary-mobile/walkthrough.mp4`

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: the sticky header sticks inside the panel's scroll container — attack: inspect the ancestors' overflow; result:
- [ ] Claim 2: desktop behaviour is unchanged — attack: run the final-visuals E2E unchanged; result:
- [ ] Claim 3: the dimmed editor cannot be edited while a version loads — attack: type during a load in the walk; result:

## Coverage honesty

What is not tested and why.

- Real device touch (iOS Safari) is not exercised; the walk uses Chromium at phone viewports.
