# The print view of a four-page document has text on the first pages and blank pages after them

- Date: 2026-10-17
- Inspired by: the final-visuals tester walk of Download PDF (`docs/features/final-visuals/tester-briefing.md`, item 3 of the print section): the tester refuted the claim that a container as tall as all the pages is enough, on a four-page document; the fix is in progress
- Revisited: 2026-10-17 — still true, fix in progress; this entry gets the final remedy and its commit when the fix lands

## Signal
`window.print` is stubbed and the unit test passes, yet the real print preview shows the leading pages with text and the later `.superdoc-page` elements empty. Counting pages gives the right number; reading their text does not.

## Cause
SuperDoc paints only the pages near the viewport. Setting `layoutEngineOptions.virtualization.enabled: false` does not change that, and mounting the view off-screen or in a container taller than the pages does not either. The unit tests fake SuperDoc and the wait loop, so they cannot see it.

## Do
Treat "every page has text" as a property to measure in a real browser, not to infer from the container height. Walk Download PDF on a document of at least four pages with Playwright and read the text length of the last `.superdoc-page` at the moment `print` is called. Until the fix lands, do not tick the print rows of the test plan from the unit tests alone.

## Anchor
`apps/web/src/features/versions/print-view.tsx`, `print-view.test.tsx` (red `3bf22e8`, green `50cfca6`), `apps/web/src/features/editor/download-menu.tsx`, `.claude/rules/web-ui.md` (print view), `docs/features/final-visuals/spec.md` (spike row 7.2)
