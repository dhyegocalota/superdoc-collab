# Test plan: The Edits panel on a phone

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/timeline/selected-header.test.tsx::a selected bin shows its time range, its edit count and Clear selection` — input: a selection with 12 edits; expected: the range, "12 edits" and a "Clear selection" button
- [ ] Confirmed it fails for the right reason: `SelectedHeader is not implemented`

## Unit

- [ ] `selected-header.test.tsx::no selection reads Showing the whole document` — input: `selection: null`; expected: that text, no buttons
- [ ] `selected-header.test.tsx::a versioned bin on a phone offers View version` — input: `hasVersion: true, isPhoneLayout: true`; expected: the "View version" button, `onViewVersion` called on click
- [ ] `selected-header.test.tsx::a versioned bin on desktop offers no View version` — input: `isPhoneLayout: false`; expected: no such button
- [ ] `use-reduced-motion.test.ts` — input: `matchMedia` reduce true, then false; expected: `true`, then `false`, updates on change
- [ ] `use-reveal-selected.test.ts::a pointer selection scrolls the header into view smoothly` — expected: `scrollIntoView({ block: 'nearest', behavior: 'smooth' })`
- [ ] `use-reveal-selected.test.ts::reduced motion scrolls instantly` — expected: `behavior: 'auto'`
- [ ] `use-reveal-selected.test.ts::a keyboard selection with the header in view does not scroll` — expected: no call
- [ ] `timeline-panel.test.tsx::below md the order is chart, header, filter, card, edits` — expected: DOM order, header `sticky`
- [ ] `timeline-panel.test.tsx::the first load shows a skeleton` — input: timeline pending; expected: a status skeleton with the chart height
- [ ] `use-panel-width.test.ts::the phone default share is 46 percent` — expected: the compact default equals the constant
- [ ] `time-travel.test.tsx::below lg a versioned bin waits for confirmTravel` — expected: no `at` change on tap; `at` set after `confirmTravel`
- [ ] `time-travel.test.tsx::at lg a versioned bin travels on tap` — expected: `at` set after the debounce
- [ ] `streamgraph.test.tsx::taps are ignored while a version loads` — input: `isLoadingVersion: true`; expected: `onSelectIndex` not called, the selected bin `aria-busy="true"`
- [ ] `streamgraph.test.tsx::keys still move the selection while a version loads` — expected: `onSelectIndex` called on ArrowRight
- [ ] `document-page.test.tsx::a loading version dims the editor and shows the progress line` — expected: the editor area has the dim class, a `role="status"` line under the bar
- [ ] `document-page.test.tsx::the version bar is pinned below lg` — expected: the bar sits above the editor with the touch height
- [ ] `version-banner.test.tsx` — expected: "Back to live" at 44 px via the `touch` size
- [ ] `timeline-copy.test.ts` — the new strings and `viewVersionPrompt('14:05')`
- [ ] `pnpm --filter @superdoc-collab/web test:unit`; expected: green

## E2E (Playwright specs)

- [ ] `e2e/summary-mobile.spec.ts::on a phone a tap keeps the selected header in view and a version needs a second tap` — viewport 375 x 812; steps: open a document with bins and a version, open the panel, tap a bin; expected: the header is inside the viewport and names the bin; tap a versioned bin; expected: the URL has no `at`; press View version; expected: the progress line, the dimmed editor, then the version frame ready and the pinned bar with Back to live; press it; expected: live again
- [ ] `e2e/summary-mobile.spec.ts::on desktop a tap travels at once` — viewport 1280; expected: `at` set after one tap

## Prove it for real — Playwright MCP

- [ ] Happy path at 375 x 812: sign in, open a document with edits over several minutes, open the panel; expected: 46 dvh panel, chart on top, the header under it
- [ ] Tap three different bins; expected: the header updates and stays in view each time, the card scrolls under it
- [ ] Versioned bin: first tap selects, "View version" visible; second tap: progress line, dimmed editor, the old version, the pinned "Back to live"; Back to live restores the live editor
- [ ] Double tap during a load; expected: one version load only, the second tap ignored
- [ ] 320 x 568: no horizontal scroll, the header and the bar readable, the buttons at least 44 px
- [ ] Reduced motion (emulate `prefers-reduced-motion: reduce`): the scroll is instant and the progress line does not pulse
- [ ] Dark theme at 375: the header, the bar and the progress line readable
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
