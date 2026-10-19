# 0045. Thumbnails are captured by the client that already rendered the page

- Status: Accepted
- Date: 2026-10-19
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [faithful-thumbnails spec](../features/faithful-thumbnails/spec.md) and its spike, [ADR 0035](0035-the-pdf-prints-from-a-same-origin-frame-with-its-own-viewport.md) (the browser is where the page is laid out), the documents-cards CSS preview

## Context

The card thumbnail is a CSS box with the first lines of text. It shows no fonts, headings, emphasis, spacing or images, so it does not look like the document. The server has no renderer: the SDK produces no pixels, and the first page is laid out only inside SuperDoc in a browser.

## Decision

- The editor page captures the first `.superdoc-page` with `html-to-image` (`toCanvas`, `pixelRatio` 1, `THUMBNAIL_WIDTH_PX` 320 wide, WebP at quality 0.8, PNG when the browser cannot encode WebP). It runs `THUMBNAIL_CAPTURE_DELAY_MS` (8 s) after the last editor update, and once on `pagehide` through `navigator.sendBeacon` when an update is still waiting. The page is rendered asynchronously, so the beacon leaves when the capture ends, which a tab that is closing may not allow. Readers and a connection that is not synced never capture.
- A capture above `THUMBNAIL_MAX_BYTES` (200 KB) is rendered once more at half the width and dropped if it is still above. A failed capture logs one warning per session and leaves the fallback.
- `PUT /api/documents/:documentId/thumbnail` takes the raw image (editor or owner), validates the size, the magic bytes of WebP or PNG and that the content type names them, writes one file per document in a `thumbnails` folder of the documents directory and stores `thumbnailUpdatedAt` on the row. `POST` does the same, because `sendBeacon` can only POST. `GET` (reader or above) streams it with `ETag` and `Cache-Control: private, max-age=0, must-revalidate`; a document without one answers 404. A non-member sees 404 on both. Deleting the document removes the file.
- Cards show the image when the list carries `thumbnailUpdatedAt`, with the preview text as `alt`, and keep the CSS text preview as the fallback.

The spike measured 60 to 170 ms per capture, a long task of at most 70 ms, and 13 to 19 KB per image on a text page and on a page with an 850 KB picture. The long task stays under the 100 ms line, so the capture needs no idle callback.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Client capture of the rendered page (chosen) | exact pixels, fonts and images; no server CPU; one small file per document | the image exists only after an editor opened the document; a tab closed inside the debounce loses the last edit | the fallback covers the gap; the next open recaptures |
| Headless browser in the server image | a thumbnail without anyone opening the document | a Chromium in the image, memory and CPU per render, a second copy of the editor setup | breaks the server's CPU budget and the image size |
| SuperDoc SDK on the server | no browser | the SDK has no renderer | cannot produce pixels |
| The CSS text preview alone | no new moving part | not faithful | the problem itself; kept as the fallback |

## Consequences

- A new dependency, `html-to-image`, in the web app only.
- Thumbnails are private: the route is authorized per document like every other document route, and the image is never public.
- A cross-site request cannot write one: the PUT is a non-simple request, so a browser preflights it, and the session cookie is not sent cross-site.
- A document nobody opened after the deploy keeps the text preview.
- The write is last-writer-wins by editors; `thumbnailUpdatedAt` is the cache buster.

## Evidence

- Spike table in the spec.
- `apps/server/src/documents/thumbnail-routes.test.ts`: the authorization matrix, validation, ETag, 404 and delete cleanup.
- `apps/web/src/features/editor/use-thumbnail-capture.test.tsx`: debounce, beacon, readers inert, size guard.
- `e2e/documents.spec.ts`: a typed document's card shows an image 320 px wide; a reader uploads nothing.

## Revisit when

- Cards are opened often enough on documents nobody edits that the missing first thumbnail is noticed, which would make a server-side render worth its cost.
- SuperDoc ships a renderer that runs without a browser.
