# Test plan: Nothing scrolls sideways on a phone

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/web/src/features/documents/document-table.test.tsx::below lg each document is a list item with the title link and one muted line` — input: Shared list with one document, viewport below `lg`; expected: a list with one item, the title link, a line reading the owner, the time and the access label, no table — evidence: 9d65bda, .pr-media/mobile-horizontal-scroll/final/unit-9d65bda.log: green, 4 files 24 tests; the test is named "below lg a shared document is a list item with the title link and one muted line" in the file (plan wording differs); at 523d906 it fails, .pr-media/mobile-horizontal-scroll/final/red-first-523d906.log
- [x] Confirmed it fails for the right reason: no list is found because the table renders — evidence: 523d906 in a throwaway worktree, .pr-media/mobile-horizontal-scroll/final/red-first-523d906.log: 2 failed 2 passed; "Unable to find role=\"listitem\"" and the dumped DOM is the table with hidden sm:table-cell cells

## Unit

- [x] `document-table.test.tsx::below lg Mine shows only the time under the title` — expected: the line reads the formatted time — evidence: 9d65bda, .pr-media/mobile-horizontal-scroll/final/unit-9d65bda.log: green (named "below lg a document of Mine shows only the time under the title"); red at 523d906 with the same listitem error; walk: ana 375 Beta row reads "Beta Oct 18, 2026, 4:10 PM", .pr-media/mobile-horizontal-scroll/final/walk-measurements.json
- [x] `document-table.test.tsx::from lg the table and its column headers remain` — expected: the table and the headers of `COLUMNS_BY_KIND`, no list — evidence: 9d65bda, .pr-media/mobile-horizontal-scroll/final/unit-9d65bda.log: green; passes at 523d906 too (pin); walk 1280 and 1024 headers Title|Updated (Mine) and Title|Owner|Updated|Access (Shared)
- [x] `document-table.test.tsx::an empty list shows its message at any width` — expected: the empty message, no list, no table — evidence: 9d65bda, .pr-media/mobile-horizontal-scroll/final/unit-9d65bda.log: green; passes at 523d906 (pin); walk: bruno Mine and ana Shared show the empty message at 375 and 320, no list, no table
- [x] `documents-page.test.tsx` stubs a wide viewport and stays green — evidence: 9d65bda, .pr-media/mobile-horizontal-scroll/final/unit-9d65bda.log: 4 files 24 tests passed, documents-page.test.tsx among them

## E2E (browser specs)

- [x] `e2e/documents.spec.ts::the list never scrolls sideways at 375 and clamps a long title to two lines` — viewport 375 x 812, a document whose title needs three lines; expected: the list and the document have `scrollWidth <= clientWidth`, the title text is clamped to two lines and the link's name is the full title — evidence: the lane gate at 9d65bda ran the full E2E suite with this test, 98 of 98 green (mo-verify-2.log, `verify: 9 gates green at 9d65bda (product)`), and the developer ran it twice in a row; ticked by the lead from the gate output

## Prove it for real (Playwright MCP)

- [x] Documents at 375 x 812 on a long title: two lines at most, the muted line under it, no sideways scroll, the link at least 44 px high — evidence: 9d65bda, scripted walk (plain node, Chromium, not MCP) .pr-media/mobile-horizontal-scroll/final/walk-measurements.json: ana 375 ul 325/325, page 375/375; 150-character title link 48 px high, clamp 2, text clipped (scrollHeight > clientHeight), 200-character unbroken title 48 px high clamped to two lines; muted line under each title ("Ana · Oct 18, 2026, 4:10 PM · Can edit" for Shared); single-line title link 44 px; screenshots .pr-media/mobile-horizontal-scroll/final/ana-mine-375-light.png, .pr-media/mobile-horizontal-scroll/final/bruno-shared-375-light.png
- [x] 320 x 568: same, in both themes — evidence: 9d65bda, .pr-media/mobile-horizontal-scroll/final/walk-measurements.json: ul 270/270 and page 320/320 for ana and bruno in light and dark, same clamp and heights; screenshots .pr-media/mobile-horizontal-scroll/final/ana-mine-320-light.png, .pr-media/mobile-horizontal-scroll/final/ana-mine-320-dark.png, .pr-media/mobile-horizontal-scroll/final/bruno-shared-320-light.png, .pr-media/mobile-horizontal-scroll/final/bruno-shared-320-dark.png
- [x] 1280: the table is unchanged — evidence: 9d65bda, .pr-media/mobile-horizontal-scroll/final/walk-measurements.json: table present, no list, headers Title|Updated (Mine) and Title|Owner|Updated|Access (Shared) at 1024 and 1280 in both themes, page 1280/1280; boundary: 1023 shows the list and 1024 the table, also on a live resize both ways; not diffed against a main build, the diff of document-table.tsx shows the table branch changed only by dropping the dead hidden sm:table-cell class; screenshots .pr-media/mobile-horizontal-scroll/final/bruno-shared-1280-light.png, .pr-media/mobile-horizontal-scroll/final/ana-mine-1280-dark.png
- [x] Console and network clean — evidence: 9d65bda, .pr-media/mobile-horizontal-scroll/final/walk-measurements.json: 0 console errors and 0 API responses with status 400 or above across 22 page loads; edge probe also 0 errors
- [x] Screenshots at `.pr-media/mobile-horizontal-scroll/` — evidence: 9d65bda, 20 list screenshots (2 users x 5 widths x 2 themes) plus 2 keyboard-focus shots under .pr-media/mobile-horizontal-scroll/final/

## Comments on phones

- [x] No comments dialog is built — input: the editor page at 375 x 812 with comments inline below 480 px; expected: no element wider than the viewport — evidence: the lead's measurement on a copy of production and `superdoc-options.ts:14,82`; the case of a document with comments is unproven, see the spec

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case and a regression test for each.

- [x] Keyboard: at 375, Tab reaches the first row link (focused true for ana and bruno) and Enter opens its document — evidence: 9d65bda, .pr-media/mobile-horizontal-scroll/final/walk-measurements.json, .pr-media/mobile-horizontal-scroll/final/ana-375-keyboard-focus.png
- [x] Back and reload mid-flow at 375: open a row, browser Back, reload; the list renders again, no table, page 375/375, no errors — evidence: 9d65bda, edge probe run in the scratch dir, .pr-media/mobile-horizontal-scroll/final/edge-probe.json
- [x] Live resize without reload 1024 to 375 to 1280 to 1023 to 320: the list and the table swap at the lg boundary each time, page never wider than the viewport — evidence: 9d65bda, .pr-media/mobile-horizontal-scroll/final/edge-probe.json
- [x] Observation, not a regression: from lg an unbroken 200-character title makes the table scroll inside its card, so Owner, Updated and Access sit off screen until the reader scrolls the card (ana 1024 and 1280, bruno the same); the spec says the table is unchanged from lg; no regression test requested — evidence: .pr-media/mobile-horizontal-scroll/final/walk-measurements.json
- [x] Row heights: a one-line title link is 44 px high and a two-line title link is 48 px, both at least 44 — evidence: .pr-media/mobile-horizontal-scroll/final/walk-measurements.json

## Adversarial review

- [x] Claim 1: no width below `lg` scrolls the card sideways — attack: a title with no spaces at 320 px; result: — evidence: 9d65bda, 200-character title "U" x 200 with no spaces (document Gamma, shared with bruno) at 320 and 375: ul 270/270 and 325/325, page 320/320 and 375/375, clamped to two lines with an ellipsis, link name equals the full 200 characters (exact match, count 1); .pr-media/mobile-horizontal-scroll/final/bruno-shared-320-light.png; result: HOLDS
- [x] Claim 2: from `lg` nothing changed — attack: compare 1024 and 1280 screenshots with main; result: — evidence: 9d65bda, 1024 and 1280 in both themes keep the table headers and page scrollWidth equals clientWidth; the unbroken 200-character title still scrolls the table inside its card (div 2249/846 and 2391/846), as before the change per the earlier tester measurements; result: HOLDS for the page, see the edge case below; no main build was run
- [x] Claim 3: Shared rows keep the access label below `lg` — attack: read the muted line at 375; result: — evidence: 9d65bda, bruno 375 muted lines read "Ana · Oct 18, 2026, 4:10 PM · Can edit" for both shared documents; .pr-media/mobile-horizontal-scroll/final/bruno-shared-375-light.png; result: HOLDS

## Coverage honesty

- Real device touch is not exercised; the walk uses Chromium at phone viewports.
