# A Radix dialog without a trigger drops focus to body on close

- Date: 2026-10-17
- Inspired by: UX lane tester walk of the delete dialog opened from the "More actions" menu; fixed in `14a4264` with the pin `651ae45`
- Revisited: 2026-10-17

## Signal
After Cancel or Escape on a dialog opened from a dropdown item, the next Tab starts from the top of the page and `document.activeElement` is `body`. Keyboard users lose their place; no error is logged.

## Cause
Radix returns focus to the `DialogTrigger` on close. A dialog controlled by `open` state and opened from a menu item has no trigger, and the menu item that opened it has unmounted, so focus falls back to `body`.

## Do
Pass `onCloseAutoFocus` on `DialogContent` that calls `event.preventDefault()` and focuses the opener through a ref (here the "More actions" button). Open such dialogs from a menu with `modal={false}` so closing never leaves `pointer-events: none` on `body`. Pin the focus return in a test. Promoted to `.claude/rules/web-ui.md`.

## Anchor
`apps/web/src/features/editor/editor-header.tsx` (`onCloseAutoFocus`), `editor-header.test.tsx` "closing the delete dialog returns the focus to More actions" (`651ae45`)
