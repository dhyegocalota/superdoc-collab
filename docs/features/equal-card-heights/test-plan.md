# Test plan: Equal card heights

- [x] Unit `document-card.test.tsx` — expected: 7 passed (evidence: 7 passed; the new test red first at 5b7f6b5c with "Expected the element to have class: h-full flex flex-col")
- [x] E2E long and short title at 1280 — expected: height difference 0 (evidence: green; 24 without the fix)
- [x] E2E long and short title at 375 — expected: height difference 0 (evidence: green; 24 without the fix)
- [x] Playwright MCP walk of the cards home at 1280 and 375 — expected: every row is one height, the meta line never wraps — evidence: titles "A", "Quarterly plan", "Shortcut title" and a 140 character title; at 1280 all four cards are 426 px tall in one row; at 375 all four are 486 px tall, one column; the meta line is 20 px (one line) on every card; no sideways scroll at either width; .pr-media/testing2/equal-card-heights-home-1280.png, .pr-media/testing2/equal-card-heights-home-375.png

## Edge cases found during execution (tester run 2026-10-19)

- [x] A card with a captured image next to cards with the text preview — evidence: the captured card (320 by 414 image) is also 426 px at 1280 and 486 px at 375; .pr-media/testing2/equal-card-heights-home-1280.png
- [x] A 140 character title — evidence: the title clamps to two lines with an ellipsis, the card keeps the same height as "A"; the thumbnail text preview clamps to four lines with an ellipsis
- [x] Wrapped fifth card — evidence: the fifth card starts a second row at the same width and the row above stays equal
