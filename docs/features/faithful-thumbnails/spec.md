# Faithful document thumbnails

**Status:** Building
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner's request, translated: "not to mention the thumbnail is not faithful!")
**ADRs:** write ADR 0045 "thumbnails are captured by the client that already rendered the page" (alternatives: a headless browser in the server image; the SDK, which has no renderer; the CSS text preview of documents-cards, kept only as the fallback)
**Not changing:** the preview text in the read model (it stays the fallback and the alt text), the grid, the cards' equal height, the server's CPU budget (nothing renders on the server)

## Problem

The card thumbnail is a CSS box with the first lines of text; it does not look like the document (fonts, headings, emphasis, spacing, images are all missing).

## Design (recommended)

- **Capture where the page is already rendered.** The editor page, once SuperDoc has painted and the connection has synced, captures the first `.superdoc-page` element to a raster with `html-to-image` (`toCanvas`, same-origin fonts, `pixelRatio` 1, width `THUMBNAIL_WIDTH_PX` 320 scaled from the 816 px page, output WebP at quality 0.8, or PNG if WebP encoding is unavailable), debounced `THUMBNAIL_CAPTURE_DELAY_MS` (8 s) after the last editor update and once on `pagehide` through `navigator.sendBeacon`; readers never capture; a capture larger than `THUMBNAIL_MAX_BYTES` (200 KB) is downscaled once and otherwise dropped. The spike proves the capture works on SuperDoc's absolutely positioned page DOM (text runs, images) and measures its cost on the main thread; its long task stayed under 100 ms, so there is no idle callback.
- **Store once per document.** `PUT /api/documents/:documentId/thumbnail` (editor or owner; raw body with the image content type; validated by magic bytes and size; `POST` too, because `sendBeacon` can only POST) writes `thumbnails/<documentId>.thumbnail` under the documents directory through the existing file storage (the content type is read back from the magic bytes, so WebP and PNG share one name) and records `thumbnailUpdatedAt` on the document row (migration). `GET /api/documents/:documentId/thumbnail` (reader or above) streams it with `ETag` and `Cache-Control: private, max-age=0, must-revalidate`; 404 when none. Deleting a document removes the file.
- **Cards.** `DocumentThumbnail` shows the image (`<img loading="lazy" decoding="async">`, `alt` = the preview text) when `thumbnailUpdatedAt` is set (the list carries it; the `src` carries the timestamp as a cache buster), and falls back to the CSS text preview otherwise. The image box keeps the 4:5 aspect and `object-cover` from the top.
- **Load and privacy.** One upload per editing session per document, one small file per document on disk, zero server rendering; the route is authorized per document like every other document route; the thumbnail is never public.

### Failure handling

| Case | Behaviour |
|------|-----------|
| Capture throws (tainted canvas, missing fonts) | logged once per session at warn level; the fallback stays |
| Upload refused (413, 415, 403) | the fallback stays; no retry until the next debounce |
| Document never opened after the deploy | the text preview |

## Test strategy summary

Unit: capture hook (debounce, pagehide beacon, reader inert, size guard), route (authorization matrix, magic bytes, size, ETag, 404, delete cleanup), repository (`thumbnailUpdatedAt`), card (image when set, fallback otherwise). E2E: open a document, type, wait for the capture (expose a settled signal), return to the home → the card shows an image whose natural width equals `THUMBNAIL_WIDTH_PX`; a reader's visit uploads nothing.

## Spike

Scratch E2E (never committed) on the built stack: Chromium headless, 1280×800, an open document, `toCanvas` of the first `.superdoc-page` (816×1056) with `pixelRatio` 1, `canvasWidth` 320, three runs per row, `html-to-image` 1.11.13.

| Document | Encoding | Output | Bytes | Capture, first run | Capture, warm | Main-thread long task |
|----------|----------|--------|-------|--------------------|---------------|-----------------------|
| 30 paragraphs of text runs | WebP 0.8 | 320×414 | 19 100 | 169 ms | 89 ms | 68 ms first run, 0 warm |
| 30 paragraphs of text runs | PNG | 320×414 | 22 973 | 152 ms | 86 ms | 0 |
| The brief: title, headings, emoji, an 850 KB PNG inside | WebP 0.8 | 320×414 | 13 060 | 130 ms | 59 ms | 67 ms first run, 0 warm |
| The brief | PNG | 320×414 | 67 818 | 119 ms | 60 ms | 61 ms first run, 0 warm |

- **Fidelity.** The capture keeps the document's fonts, headings, emphasis, the emoji and the embedded image; it is readable at 320 px.
- **Fonts.** Skipping font embedding produced byte-identical output on this machine, so it proves nothing here; the capture keeps the default embedding.
- **Cost.** The first capture is a 60 to 70 ms long task and the encode adds 6 to 40 ms; the long task stays under 100 ms, so the capture runs straight from the debounce with no idle callback.
- **Size.** Well under `THUMBNAIL_MAX_BYTES` (200 KB) for both documents; the 850 KB image shrinks with the page.
- **Aspect.** The page is 816×1056, so the capture is 320×414; the card's 4:5 box with `object-cover` from the top crops a sliver of the bottom.
