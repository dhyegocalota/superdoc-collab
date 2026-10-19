# Tester briefing: Faithful document thumbnails

**Changed.** The editor page captures its first page with `html-to-image` 8 s after the last editor update and on `pagehide`, and uploads it; the server stores one file per document and the list carries `thumbnailUpdatedAt`; the card shows the image and falls back to the text preview. One import and one call went into `document-page.tsx`, and nothing else in the editor files another lane owns.

**Where.** `apps/web/src/features/editor/{use-thumbnail-capture,capture-thumbnail,editor-api}.ts`, `apps/web/src/features/documents/document-thumbnail.tsx`, `apps/server/src/documents/{thumbnail-routes,thumbnail-image,local-disk-file-storage,documents-repository}.ts`, migration `0008_thumbnail-updated-at.sql`, `libs/types/src/thumbnails.ts`.

**Red first, green after (red failure text as printed).**

| Seam | Red commit | Failure text |
|------|------------|--------------|
| image magic bytes | f4367b8a | `thumbnailMimeTypeOf is not implemented for 16 bytes` |
| storage | f4367b8a | `putThumbnail is not implemented` |
| repository | f4367b8a | `recordThumbnail is not implemented for <id>` |
| routes | f4367b8a | `expected 404 to be 204`, `expected 404 to be 403`, `expected 404 to be 415`, `expected 404 to be 413` |
| capture | ef78f6bf | `captureThumbnail is not implemented for DIV` |
| hook | ef78f6bf | `expected "vi.fn()" to be called 1 times, but got 0 times` |
| api | ef78f6bf | `uploadThumbnail is not implemented for doc-1 1` |
| card | 7abcc881 | `Unable to find an element with the role "img" and name "First line"` |
| E2E | 7abcc881 | `toHaveAttribute data-thumbnail-uploads: unexpected value "null"` |

**Pins (green when they landed).** A document without a thumbnail answers 404; a deleted document has no thumbnail file; a reader and an unsynced connection capture nothing; leaving the page with nothing waiting sends nothing; the reader E2E (it was made discriminating afterwards: without the reader guard it fails).

**Hypotheses to check.**

- The card shows the page with its fonts, headings and image, not the text preview.
- A reader never sends a request to `/thumbnail`.
- A tab closed inside the 8 s window may keep the previous image: the beacon starts after the page is hidden and the capture is asynchronous. This is a known limit, not a defect.
- The `PUT` route also answers `POST`, because `sendBeacon` can only POST.
- The file lives in `thumbnails/<documentId>.thumbnail` under the documents directory, and its content type is read back from its magic bytes.
- Opening a document as an editor uploads once after the first pagination even without typing.

**Not covered.** There is no limit on how often an editor may PUT; each write is at most 200 KB and replaces the previous file.

## Tester run 2026-10-19

Walk on the scenario stack at 1280 and 375. Unit and E2E boxes were not re-run in this lane.

- Confirmed: after typing, 11 s and a return home the card shows a 320 by 414 image of the page with heading, bold text and images, in the editor's font and weight; a never-opened document keeps the text preview; a reader sends no thumbnail request; leaving inside 8 s keeps the previous image with no console error; 415, 413, 404 and delete-cleanup behave as written.
- Confirmed hypothesis: opening a document as an editor uploads once without typing.
- Noted: the server checks only the magic bytes, so a header-only WebP of 200 KB is stored; the card falls back to the text preview. Exactly 200 KB is accepted, one byte more gives 413.
- Console at error level: 0 on the capture, leave-early and reader flows.
