# Test plan: The loading line above the toolbar is for screen readers only

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] No unit test pins the `sr-only` class: `.claude/rules/testing.md` line 27 forbids pinning Tailwind classes. The behaviour is pinned by the existing `document-page.test.tsx::the header stays while the document opens` (`role="status"`) and the two Download-description tests. The visual proof is the tester's before and after screenshots at 1280 and 375 under `.pr-media/loading-line/`.

## Unit

- [ ] `document-page.test.tsx::a superseded tab that never finished loading hides the loading line and SuperDoc loading overlay` — unchanged; expected: green
- [ ] `document-page.test.tsx` as a file; expected: green

## E2E (Playwright specs)

- [ ] The existing editor specs; expected: green in the gate (none reads the loading line as visible)

## Prove it for real — Playwright MCP

- [ ] Open a document on a throttled network: expected: no text line above the toolbar, SuperDoc's overlay on the paper, and the accessibility tree still lists the status "Loading document…"

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

- [ ] Claim 1: the file-error message is still visible — attack: fail the file request; result:
- [ ] Claim 2: the Download button is still described while loading — attack: read its accessible description; result:
- [ ] Claim 3: no layout shift appears when the line is removed — attack: compare the toolbar position before and after load; result:

## Coverage honesty

- The visual absence of the line is proven by the before and after screenshots, not by a unit test.
