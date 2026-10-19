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

- [x] `print-page.test.tsx::does not report Painted for a page shell without a fragment` — input: one page, no children; expected: no `Painted`
- [x] `print-page.test.tsx::reports Painted only after every page has a fragment` — input: two pages, the second gains its fragment later; expected: exactly one `Painted`, after it

## E2E (Playwright specs)

- [ ] `e2e/final-visuals.spec.ts::Download PDF of a new blank document prints its single page` — steps: New document, More download formats, Download PDF; expected: `print()` called once, one page
- [ ] The three existing Download PDF tests in `e2e/final-visuals.spec.ts` stay green

## Prove it for real — Playwright MCP

- [x] New document → Download PDF; expected: the preparing toast, then the browser print dialog opens with one page — evidence: toast "Preparing the PDF… | Choose “Save as PDF” in the print dialog." seen at 50 ms, no "The PDF could not be prepared." toast in 25 s; the real print dialog blocked the Playwright MCP call until the 60 s timeout, which is the dialog opening (the dialog itself is native and not capturable); scripted headless run with a print stub: 3 of 3 runs `calls: 1, pageCount: 1`; screenshot .pr-media/testing/pdf-of-text-less-pages-new-document-after-download-1280.png
- [x] Uploaded brief → Download PDF; expected: the print dialog with every page filled — evidence: scripted headless run with a print stub (print dialog not drivable in MCP), 3 of 3 runs `calls: 1, pageCount: 3, emptyPageCount: 0`, preparing toast seen, no failure toast
- [x] Console and network clean — evidence: 0 console errors (1 SuperDoc missing font "Calibri" warning), every API call 2xx on the New document → Download PDF walk

## Adversarial review

- [ ] Claim 1: a fragment is present only after the content hydrated — attack: read the painter's d.ts and inspect a 4-page document's frame before paint; result:
- [x] Claim 2: the blank document's print has exactly one page — attack: check `pageCount` in the E2E print state; result: held, `pageCount: 1` in 3 of 3 scripted runs (the page is text-less: `emptyPageCount: 1`, printed once, as intended)
- [ ] Claim 3: no existing PDF test regresses — attack: run the four PDF tests three times; result:

## Coverage honesty

- Image-only pages are not exercised by a fixture; the fragment rule covers them by construction.

## Edge cases found during execution

- [x] Blank document PDF three times in a row: `calls: 1` each time, never a second print, never the failure toast
- [x] Print dialog in Playwright MCP: the native dialog hangs the server for 60 s and the next call needs a spare server; limit of the tool, not a product defect
