# Test plan: Caret on open

## The failing test first

- [ ] `e2e/<spec>::a new document accepts typing without a click` — input: New document, type "Hello"; expected: "Hello" in the page, no rejected-edit status
- [ ] Confirmed it fails for the right reason: <paste>

## Unit

- [ ] `use-caret-on-open.test.ts`: waits for the first fragment; runs once; never for a reader

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
