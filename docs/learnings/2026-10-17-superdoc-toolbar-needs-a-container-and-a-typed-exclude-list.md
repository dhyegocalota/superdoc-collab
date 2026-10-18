# The SuperDoc toolbar appears inside the page, overflows, or lists items we removed

- Date: 2026-10-17
- Inspired by: final-visuals G2 toolbar row (`7901443`, `2a239cb`) and the page integration `fa48cb2`, `ef27dfd`
- Revisited: 2026-10-17 — still true
- Revisited: 2026-10-18 — still true

## Signal
The toolbar renders above the document inside SuperDoc's own box instead of in our top row, does not collapse items when the row narrows, or an item we meant to hide is still there. A misspelled item name in the exclude list raises nothing at runtime.

## Cause
The toolbar only mounts in our element when `ui.toolbar.container` is given, and only follows that element's width with `responsiveTo: 'container'`. `excludeItems` accepts strings, so an unknown name is silently ignored.

## Do
Pass `ui.toolbar` with the row element as `container`, `responsiveTo: 'container'` and an `excludeItems` array declared `satisfies readonly ToolbarItemId[]`, so a name SuperDoc does not know fails the typecheck. Pass the container only once the element exists, and none for the version viewer. Promoted to `.claude/rules/web-ui.md`.

## Anchor
`apps/web/src/features/editor/superdoc-options.ts` (`TOOLBAR_EXCLUDED_ITEMS`), `superdoc-options.test.ts`, `editor-toolbar-row.tsx`, `document-page.test.tsx`
