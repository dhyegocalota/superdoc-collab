# A key handler that reads React state sees the previous keystroke

- Date: 2026-10-17
- Inspired by: known-minors fixes `f1c4af8`, `6c5fb24` and `4240334`: Escape and Enter in the timeline filter box missed a draft typed just before them in a real browser while every jsdom test passed, and Escape in the filter box also left the version through the document-level time-travel handler
- Revisited: 2026-10-17

## Signal
In Playwright or by hand, typing fast and pressing Enter or Escape acts on the draft as it was one keystroke earlier (nothing applied, or the wrong chip). The unit test with Testing Library is green.

## Cause
The handler closes over the `draft` from the render that attached it. A real browser can deliver the key event before React re-renders with the last `onChange`, so the closure still holds the previous value; jsdom flushes synchronously and hides it. A second listener on `document` then sees the same key and acts too.

## Do
Decide from `event.currentTarget.value`, never from the state copy. When the handler consumes the key, call `event.preventDefault()`, and make every document-level handler return early on `event.defaultPrevented`. Promoted to `.claude/rules/web-ui.md`.

## Anchor
`apps/web/src/features/timeline/filter-box.tsx` (`handleKeyDown`), `apps/web/src/features/timeline/use-time-travel.ts` (Escape listener), commits `f1c4af8`, `6c5fb24`, `4240334`
