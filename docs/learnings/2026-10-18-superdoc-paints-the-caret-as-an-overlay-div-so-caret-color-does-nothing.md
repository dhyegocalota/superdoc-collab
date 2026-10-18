# The caret vanishes in dark mode and `caret-color` changes nothing
- Date: 2026-10-18
- Inspired by: the dark-theme fix, where the cursor in the document could not be seen on the white paper

## Signal
In dark mode the cursor is invisible on the paper, and a `caret-color` rule on the page, the text runs or the hidden `textarea` has no effect.

## Cause
SuperDoc 2.23.0 does not use the browser caret. The layout engine paints the local caret as a 1px `div` with inline `background: currentColor` and the attribute `data-v2-local-selection-caret`. It inherits `color` from the light body text, so it turns white on the white paper.

## Do
Set `color` on `[data-v2-local-selection-caret='true']` to a token that reads on the paper. Read the overlay in the engine source or the built DOM before writing a rule for any other editor surface.

## Anchor
`apps/web/src/styles/globals.css`, `apps/web/src/styles/globals.test.ts` (the caret test), `e2e/dark-theme.spec.ts`, `.claude/rules/web-ui.md`, `docs/features/dark-theme/spec.md`
