# A keydown inside an iframe never reaches the parent document's listeners

- Date: 2026-10-17
- Inspired by: slice 3 known gap "Escape inside the viewer frame does not exit a version", closed in `docs/features/known-minors/`
- Revisited: 2026-10-17 — fixed with a `postMessage` kind on the existing same-origin channel
- Revisited: 2026-10-17 — the frame files moved to `features/versions/` (refinement-structure)

## Signal
A global `document.addEventListener('keydown', …)` in the app works everywhere except while the user is inside the embedded version viewer: Escape does nothing there, with no error.

## Cause
Keyboard events are dispatched in the document that owns the focused element. An iframe is its own document, so the parent's listeners never see them, same origin or not.

## Do
Listen inside the frame page and forward the intent to the parent as a typed message on the channel that already carries the frame's messages (`ViewerMessageKind.Exit`), validated by origin and source like every other kind; never read the frame's DOM from the parent.

## Anchor
`apps/web/src/features/versions/version-view-page.tsx`, `apps/web/src/features/versions/version-frame.tsx`, `apps/web/src/features/versions/viewer-messages.ts`
