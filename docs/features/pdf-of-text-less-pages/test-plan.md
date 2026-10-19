# Test plan: PDF of text-less pages

## The failing test first

- [x] `print-page.test.tsx::reports Painted for a page whose fragment has no text` — input: one page with one empty fragment; expected: `Painted` posted once
- [x] Confirmed it fails for the right reason:

```
FAIL  print-page.test.tsx > reports Painted for a page whose fragment has no text
AssertionError: expected [] to have a length of 1 but got +0
FAIL  print-page.test.tsx > reports Painted only after every page has a fragment
AssertionError: expected [] to have a length of 1 but got +0
Tests  2 failed | 8 passed (10)
```

`does not report Painted for a page shell without a fragment` is green at red time: a pin.

## Unit

- [ ] `print-page.test.tsx::does not report Painted for a page shell without a fragment` — input: one page, no children; expected: no `Painted`
- [ ] `print-page.test.tsx::reports Painted only after every page has a fragment` — input: two pages, the second gains its fragment later; expected: exactly one `Painted`, after it

## E2E (Playwright specs)

- [ ] `e2e/final-visuals.spec.ts::Download PDF of a new blank document prints its single page` — steps: New document, More download formats, Download PDF; expected: `print()` called once, one page
- [ ] The three existing Download PDF tests in `e2e/final-visuals.spec.ts` stay green

## Prove it for real — Playwright MCP

- [ ] New document → Download PDF; expected: the preparing toast, then the browser print dialog opens with one page
- [ ] Uploaded brief → Download PDF; expected: the print dialog with every page filled
- [ ] Console and network clean

## Adversarial review

- [ ] Claim 1: a fragment is present only after the content hydrated — attack: read the painter's d.ts and inspect a 4-page document's frame before paint; result:
- [ ] Claim 2: the blank document's print has exactly one page — attack: check `pageCount` in the E2E print state; result:
- [ ] Claim 3: no existing PDF test regresses — attack: run the four PDF tests three times; result:

## Coverage honesty

- Image-only pages are not exercised by a fixture; the fragment rule covers them by construction.
