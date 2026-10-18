# A member's cursor is drawn in a colour the app never declared

- Date: 2026-10-17
- Inspired by: final-visuals G5 spike on coloured members (`docs/features/final-visuals/spec.md`, spike row 7.20) and `8bf66ad`
- Revisited: 2026-10-17 — still true

## Signal
The member avatar uses the author colour but the same member's remote caret and selection in the page show another colour. Setting the colour as `hsl(...)`, `rgb(...)` or a name changes nothing visible and raises no error.

## Cause
SuperDoc stores whatever `user.color` holds but its remote-caret overlay replaces anything that is not a six-digit hex with a colour from its own palette. The `colors` option is read as an array of hex strings in the same way.

## Do
Declare the `--author-N` tokens as six-digit hex, read them once with `getComputedStyle`, and pass `user.color` as one of them and `colors` as the whole array. The stylesheet test pins the six hex values in `:root` only. Promoted to `.claude/rules/web-ui.md`.

## Anchor
`apps/web/src/styles/globals.test.ts` ("--author-1 to --author-6 are the six hex values in :root only"), `apps/web/src/features/editor/superdoc-options.ts`, `superdoc-options.test.ts`, `author-palette.ts`
