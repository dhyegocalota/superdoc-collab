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

- [ ] `a joiner types without a click` — Bruno opens Ana's document, types; expected: text appears for both
- [ ] `a reader has no caret` — expected: no `[data-v2-local-selection-caret='true']`
- [ ] Existing `e2e/documents.spec.ts` and `e2e/collaboration.spec.ts` stay green

## Prove it for real — Playwright MCP

- [ ] New document: caret visible at the document start before any click; typing works
- [ ] Existing document, joiner: same
- [ ] Reload mid-edit: caret returns; the title input keeps focus when renaming
- [ ] Console clean: no "This edit couldn't be completed"

## Adversarial review

- [ ] Claim 1: the first keystroke never raises edit-rejected — attack: 10 runs of the new-document E2E; result:
- [ ] Claim 2: reconnect does not steal focus — attack: cut the socket while renaming; result:
- [ ] Claim 3: the reader has no caret — attack: open as a reader and search the overlay; result:

## Coverage honesty

- Mobile Safari focus rules are not exercised.
