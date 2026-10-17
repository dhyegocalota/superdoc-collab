# Focusing a new SuperDoc document before the first click crashes the first keystroke

- Date: 2026-10-17
- Inspired by: UX lane item P2-13 ("New document" puts the caret in the page): typing into a freshly created document made SuperDoc throw; the focus was removed in `ebf9355`
- Revisited: 2026-10-17

## Signal
On a document just created with "New document", the caret seems to be there, and the first key pressed shows SuperDoc's "This edit couldn't be completed" with nothing typed. Clicking into the page first works.

## Cause
SuperDoc 2.23.0's `focus()` focuses its hidden composition `textarea` but sets no document selection. The first keystroke then has no position to apply to and throws. Calling `focus()` from `onCollaborationReady` instead of `onReady` fails the same way.

## Do
Never call `superdoc.focus()` on a document the user has not clicked into; leave the caret to the first click. Keep any prop that only matters on ready out of the effect that constructs SuperDoc, or a change to it rebuilds the editor (`32c444f`). Promoted to `.claude/rules/web-ui.md`.

## Anchor
`apps/web/src/features/editor/superdoc-editor.tsx`, `.claude/rules/web-ui.md` → SuperDoc 2.23.0 in the browser, commits `ebf9355`, `32c444f`
