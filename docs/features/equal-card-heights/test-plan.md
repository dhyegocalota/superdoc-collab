# Test plan: Equal card heights

- [x] Unit `document-card.test.tsx` — expected: 7 passed (evidence: 7 passed; the new test red first at 5b7f6b5c with "Expected the element to have class: h-full flex flex-col")
- [x] E2E long and short title at 1280 — expected: height difference 0 (evidence: green; 24 without the fix)
- [x] E2E long and short title at 375 — expected: height difference 0 (evidence: green; 24 without the fix)
- [ ] Playwright MCP walk of the cards home at 1280 and 375 — expected: every row is one height, the meta line never wraps
