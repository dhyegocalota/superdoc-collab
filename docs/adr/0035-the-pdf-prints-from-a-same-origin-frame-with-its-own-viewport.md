# 0035. The PDF prints from a same-origin frame with its own viewport

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: `docs/features/final-visuals/design.md` section 1.7 and row 6.1, `docs/features/final-visuals/spec.md` data flow 7, the tester's refutation of the first print view, `docs/learnings/2026-10-17-superdoc-paints-only-the-pages-near-the-viewport-even-with-virtualization-off.md`

## Context

Download PDF is a print view: SuperDoc renders the exported document and the browser prints it. The first design mounted a non-collaborative SuperDoc in an off-screen container as tall as all its pages, with `layoutEngineOptions.virtualization.enabled: false`, and called `window.print()` once the last page had text.

The tester refuted it on a four-page document: only the first two `.superdoc-page` elements had text, the wait loop gave up and the toast read "The PDF could not be prepared." SuperDoc paints only the pages near the real window viewport, even with virtualization off and in an off-screen container, and it removes the text of pages that leave that window. A second finding came from the brief DOCX, which failed to open with `open-failed` when a second SuperDoc ran in the same window as the editor.

## Decision

- The print view is a same-origin `iframe` that loads its own route, `AppRoute.Print` (`/print`), as tall as all its pages. The frame has its own window, so its viewport covers every page and SuperDoc paints them all.
- The frame announces `Ready`; the page answers with the exported Blob by `postMessage`; the frame reports the page count after `onReady`; the page resizes the frame to the count times 1056 px; the frame reports `Painted` only when the last page has text; the page calls the frame's own `print()`.
- Both sides check `origin` and `source` on every message. The Blob never leaves the origin.
- The route needs no session, carries no document id and holds no document data: it renders only what the parent hands it.
- The page fails the preparation after `PRINT_READY_TIMEOUT_MS` when `Painted` never arrives; the frame unmounts and the toast reads `PDF_FAILED_MESSAGE`.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| A same-origin frame on its own route (chosen) | every page paints; only the document prints; the editor's window stays untouched | one more route; a message protocol | n/a |
| Off-screen container taller than the pages, in the page | no route | measured on a seven-page document: two pages painted | SuperDoc follows the real viewport |
| Scroll the container through the pages | no route | each page paints when near the viewport and loses its text when it leaves, so no moment has every page | never all painted at once |
| A full-viewport layer under an overlay | no route | same windowing as scrolling | never all painted at once |
| A very tall browser window | all pages painted in the experiment | not something a page can do | not available to a page |
| A SuperDoc made in the page and mounted in a frame element | no route | SuperDoc throws `detached preparation requires a paginated DOM mount` | elements of another window fail its checks |
| Server PDF conversion | exact fonts | a converter in the stack | out of scope (spec non-goals) |

## Consequences

- One more route, `/print`, outside the session guard. It cannot leak a document: it holds none.
- A Ready or Painted timeout exists, so a frame that fails to load ends in the failed toast instead of a toast that never leaves.
- The `@media print` stylesheet is gone, because only the frame prints.
- The brief DOCX opens, because the print SuperDoc runs in its own window and not beside the editor's.
- Fonts the browser does not have (Calibri) print with substitutes, as before.

## Evidence

- `e2e/final-visuals.spec.ts`: "Download PDF of a document of at least 4 pages prints only when every page has text" and "Download PDF of the uploaded brief prints only when every page has text".
- `apps/web/src/features/versions/print-page.test.tsx` and `print-view.test.tsx` pin the messages, the origin checks, the height, the print-on-Painted rule and the timeout. `apps/web/src/app/router.test.tsx` pins that the route needs no session.
- Measured in a browser on a seven-page document: the page-level container painted 2 pages; the frame painted 7 and printed once.

## Revisit when

- SuperDoc paints every page without a viewport, or ships a print mode.
- The app gains server-side PDF conversion.
