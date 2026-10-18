# An MCP fill on a blank SuperDoc surface is rejected because no selection exists

- Date: 2026-10-18
- Inspired by: the scenario walk of `docs/scenarios/core-realtime.md`, which could not type into a document created with New document
- Revisited: 2026-10-18 — still true at SuperDoc 2.23.0

## Signal
`browser_type` into the blank document's editing textarea shows SuperDoc's "This edit couldn't be completed" and nothing appears. The same text typed after a click works.

## Cause
`browser_type` fills the hidden composition textarea without a click. SuperDoc 2.23.0 sets no document selection until the first click, so the first key has no position to apply to and is rejected. This is the same mechanism as [the focus learning](2026-10-17-focusing-a-new-superdoc-document-before-the-first-click-crashes-the-first-keystroke.md), reached from the browser tool instead of from `superdoc.focus()`.

## Do
After New document, wait for the editor surface, click the first paragraph, press End, then type with key presses (`browser_press_key`, or `browser_type` with `slowly: true` after the click). Never fill a blank surface. `e2e/documents.spec.ts` covers the human path.

## Anchor
- `docs/scenarios/core-realtime.md` (Setup), `.agents/skills/scenario/SKILL.md` step 3: the browser-tool path (click, End, key presses)
- `e2e/documents.spec.ts`: `a new document accepts typing after a click`, which clicks the first page, presses End through `focusEditorAtEnd` and inserts the sentence in one go
