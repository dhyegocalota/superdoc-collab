# A feature works in the page and silently does nothing in an isolated render

- Date: 2026-10-17
- Inspired by: review of the member jump, fixed by `092a8cc` and `976ff3e`
- Revisited: 2026-10-17 — still true
- Revisited: 2026-10-18 — still true
- Revisited: 2026-10-18 — still true; the colour slot reaches the editor, the header and the account menu as an explicit prop, never a lookup

## Signal
The member jump finds carets in the full page but never in a component test, or finds the wrong editor when two exist (the print view or the version viewer). No error is raised.

## Cause
The hook located the editor with a `data-testid` query on the global `document`. That lookup succeeds by luck of the page layout and hides that the component was never handed the element it works on.

## Do
Pass the element: the editor reports its container upward, the header receives it as a prop, and the hook takes `container` beside `superdoc`. Keep `data-testid` for tests, never for production lookups.

## Anchor
`apps/web/src/features/editor/use-member-cursors.ts`, `superdoc-editor.tsx`, `editor-header.tsx`, `document-page.tsx`, commits `092a8cc`, `976ff3e`
