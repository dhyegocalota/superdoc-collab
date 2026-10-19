# Test plan: Caret on open

## The failing test first

- [ ] `e2e/<spec>::a new document accepts typing without a click` — input: New document, type "Hello"; expected: "Hello" in the page, no rejected-edit status
- [x] Confirmed it fails for the right reason: red commit run on 2026-10-19. Both E2E tests wait for the local caret before typing, so the red reason is that no caret exists without a click:

```
Error: expect(locator).toBeVisible() failed
Locator: locator('[data-v2-local-selection-caret=\'true\']')
Expected: visible
Timeout: 60000ms
Error: element(s) not found
  > 16 |   await expect(ana.page.locator(LOCAL_CARET_SELECTOR)).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  [chromium] › e2e/caret-on-open.spec.ts:12:5 › a new document accepts typing without a click
  [chromium] › e2e/caret-on-open.spec.ts:22:5 › a joiner types without a click
```

Unit run: 7 of 7 in `use-caret-on-open.test.ts` fail with `Error: useCaretOnOpen is not implemented`. `a reader has no caret` is a pin: green on arrival.

## Unit

- [x] `use-caret-on-open.test.ts`: waits for the first fragment; runs once; never for a reader

## E2E

- [x] `a joiner types without a click` — Bruno opens Ana's document, types; expected: text appears for both — evidence: walked in MCP: Bruno opened Ana's document through the edit link and after a reload, the local caret existed before any click and typed " Bruno typed" appeared at the document start for Bruno and Ana; no rejected-edit text; screenshot .pr-media/testing/caret-on-open-joiner-typed-1200.png (the E2E spec itself not run)
- [x] `a reader has no caret` — expected: no `[data-v2-local-selection-caret='true']` — evidence: Bruno through the read link: 0 `[data-v2-local-selection-caret]` elements, active element BODY, typing "xyz" left the text "Reader doc by Ana" unchanged; screenshot .pr-media/testing/caret-on-open-reader-no-caret-1200.png (the E2E spec itself not run)
- [ ] Existing `e2e/documents.spec.ts` and `e2e/collaboration.spec.ts` stay green — BLOCKED: the E2E suites are the lead's gate

## Prove it for real — Playwright MCP

- [x] New document: caret visible at the document start before any click; typing works — evidence: New document: 1 local caret element before any click, active element TEXTAREA, typed "Hello" shown once on the page; screenshot .pr-media/testing/caret-on-open-new-document-typed-1280.png
- [x] Existing document, joiner: same — evidence: Bruno (editor, edit link): caret 1 before any click, typed text visible for both
- [x] Reload mid-edit: caret returns; the title input keeps focus when renaming — evidence: reload: caret returned in both Ana's and Bruno's page; Ana clicked Rename right after the reload: the active element stayed the Title input for 6 s (12 samples) and the caret stayed 0
- [x] Console clean: no "This edit couldn't be completed" — evidence: 0 console errors in all caret walks and no "This edit couldn't be completed" text

## Adversarial review

- [ ] Claim 1: the first keystroke never raises edit-rejected — attack: 10 runs of the new-document E2E; result:
- [ ] Claim 2: reconnect does not steal focus — attack: cut the socket while renaming; result:
- [x] Claim 3: the reader has no caret — attack: open as a reader and search the overlay; result: — evidence: held: a reader page has no caret element at all, not only a hidden one

## Coverage honesty

- Mobile Safari focus rules are not exercised.

## Edge cases found during execution

- After closing the share dialog, focus returns to the Share button: typing then goes nowhere (expected, the hook runs once on open).
- Not exercised: cutting the socket while renaming (worker socket not cuttable in this tool), 10 runs of the new-document E2E (claim 1), past-version view and print frame carets.
