# A component test throws a missing author colour error although the component is untouched

- Date: 2026-10-17
- Inspired by: `21c5593` and `005fd86`, two header and time-travel tests that broke the gate after the member jump started reading the author tokens
- Revisited: 2026-10-17 — still true
- Revisited: 2026-10-18 — still true

## Signal
The gate is red on a test that renders a header, a panel or a viewer and never mentions colours. The error names `--author-1` or another token, thrown from `authorColorOf`. It happened twice in one feature, each time on a test written before the component read tokens.

## Cause
jsdom loads no stylesheet, so `getComputedStyle(document.documentElement).getPropertyValue('--author-N')` is an empty string. The palette reader throws on an empty token on purpose, so any component that reaches `authorColorOf` fails in a test that did not declare the tokens.

## Do
Call `installAuthorPalette()` in `beforeEach` and `removeAuthorPalette()` in `afterEach` in every test file that renders a component reading design tokens, directly or through `Members`, `SuperDocEditor`, the version viewer or `useMemberCursors`. When a component starts reading a token, grep its callers' tests for the stub in the same change.

## Anchor
`apps/web/src/testing/author-palette.ts`, `apps/web/src/features/editor/author-palette.ts`, `editor-header.test.tsx`, `time-travel.test.tsx`, `document-page.test.tsx`, commits `21c5593`, `005fd86`
