# Test plan: The loading line above the toolbar is for screen readers only

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/editor/document-page.test.tsx::while the document loads the status line is for assistive technology only and still describes the Download button` — input: the editor mounted but not ready; expected: the loading text has `role="status"` and the `sr-only` class and the Download button is described by it
- [ ] Confirmed it fails for the right reason: `expect(element).toHaveClass("sr-only")`

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

- The visual absence of the line is asserted through the `sr-only` class, not a pixel check; the walk looks at it.
