# The print view of a four-page document has text on the first pages and blank pages after them

- Date: 2026-10-17
- Inspired by: the final-visuals tester walk of Download PDF (`docs/features/final-visuals/tester-briefing.md`, item 3 of the print section): the tester refuted the claim that a container as tall as all the pages is enough, on a four-page document; fixed by the print frame of [ADR 0035](../adr/0035-the-pdf-prints-from-a-same-origin-frame-with-its-own-viewport.md)
- Revisited: 2026-10-17 — fixed: the print runs in a same-origin frame on its own route, as tall as all its pages (print page red `4fd173e`, green `f153227`; print view red `09cdbd2`, green `3a97029`; timeout `9a6c53b`, `96ec68e`; e2e `9cbab7c`)

## Signal
`window.print` is stubbed and the unit test passes, yet the real print preview shows the leading pages with text and the later `.superdoc-page` elements empty. Counting pages gives the right number; reading their text does not.

## Cause
SuperDoc paints only the pages near the viewport. Setting `layoutEngineOptions.virtualization.enabled: false` does not change that, and mounting the view off-screen or in a container taller than the pages does not either. The unit tests fake SuperDoc and the wait loop, so they cannot see it.

## Do
Treat "every page has text" as a property to measure in a real browser, not to infer from the container height. Walk Download PDF on a document of at least four pages with Playwright and read the text length of the last `.superdoc-page` at the moment `print` is called. The remedy is a frame with its own window: the page-level container paints only the pages near the real viewport (2 of 7 in a measured run), scrolling it unpaints the pages it leaves, and a SuperDoc made in the page cannot mount in a frame element (`detached preparation requires a paginated DOM mount`). Keep the e2e proof on a document of at least four pages.

## Anchor
`apps/web/src/features/versions/print-view.tsx`, `print-page.tsx`, `print-view.test.tsx`, `print-page.test.tsx`, `apps/web/src/features/editor/download-menu.tsx`, `.claude/rules/web-ui.md` (print view), `docs/features/final-visuals/spec.md` (spike row 7.2)
