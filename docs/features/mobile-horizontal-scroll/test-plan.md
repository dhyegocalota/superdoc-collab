# Test plan: Nothing scrolls sideways on a phone

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/documents/document-table.test.tsx::below lg each document is a list item with the title link and one muted line` — input: Shared list with one document, viewport below `lg`; expected: a list with one item, the title link, a line reading the owner, the time and the access label, no table
- [ ] Confirmed it fails for the right reason: no list is found because the table renders

## Unit

- [ ] `document-table.test.tsx::below lg Mine shows only the time under the title` — expected: the line reads the formatted time
- [ ] `document-table.test.tsx::from lg the table and its column headers remain` — expected: the table and the headers of `COLUMNS_BY_KIND`, no list
- [ ] `document-table.test.tsx::an empty list shows its message at any width` — expected: the empty message, no list, no table
- [ ] `documents-page.test.tsx` unchanged and green

## E2E (browser specs)

- [ ] `e2e/documents.spec.ts::the documents list never scrolls sideways on a narrow viewport` — viewport 375 x 812, a document with a long title; expected: the card's `scrollWidth <= clientWidth` and the full title text visible

## Prove it for real (Playwright MCP)

- [ ] Documents at 375 x 812 on a long title: two lines at most, the muted line under it, no sideways scroll, the link at least 44 px high
- [ ] 320 x 568: same, in both themes
- [ ] 1280: the table is unchanged
- [ ] Console and network clean
- [ ] Screenshots at `.pr-media/mobile-horizontal-scroll/`

## Comments on phones

- [x] No comments dialog is built — input: the editor page at 375 x 812 with comments inline below 480 px; expected: no element wider than the viewport — evidence: the lead's measurement on a copy of production and `superdoc-options.ts:14,82`; the case of a document with comments is unproven, see the spec

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case and a regression test for each.

## Adversarial review

- [ ] Claim 1: no width below `lg` scrolls the card sideways — attack: a title with no spaces at 320 px; result:
- [ ] Claim 2: from `lg` nothing changed — attack: compare 1024 and 1280 screenshots with main; result:
- [ ] Claim 3: Shared rows keep the access label below `lg` — attack: read the muted line at 375; result:

## Coverage honesty

- Real device touch is not exercised; the walk uses Chromium at phone viewports.
