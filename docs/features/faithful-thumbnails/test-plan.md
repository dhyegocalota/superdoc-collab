# Test plan: Faithful document thumbnails

## Unit

- [x] `thumbnail-image.test.ts` — expected: 6 passed; WebP and PNG named, JPEG, DOCX, a RIFF that is not WebP, a truncated header and nothing refused (evidence: f4367b8a red with "thumbnailMimeTypeOf is not implemented for 16 bytes", 95614a3c green)
- [x] `local-disk-file-storage.test.ts` — expected: 5 passed; thumbnail round trip, replace, removed with the document, other thumbnails kept (evidence: red "putThumbnail is not implemented", green)
- [x] `documents-repository.test.ts` — expected: 9 passed; `recordThumbnail` sets `thumbnailUpdatedAt` without moving `updatedAt` (evidence: red "recordThumbnail is not implemented for <id>", green)
- [x] `thumbnail-routes.test.ts` — expected: 13 passed; owner and editor PUT 204, reader GET 200 and PUT 403, non-member 404 equal to a missing document, POST like PUT, PNG served as PNG, five 415 cases, 413 over `THUMBNAIL_MAX_BYTES`, 404 without one, ETag, 304, delete cleanup (evidence: red "expected 404 to be 204", green; pins: 404 without a thumbnail, delete cleanup)
- [x] `capture-thumbnail.test.ts` — expected: 5 passed; width and aspect, one downscale, dropped when still large, encoding failure, WebP at the quality (evidence: red "captureThumbnail is not implemented for DIV")
- [x] `use-thumbnail-capture.test.ts` — expected: 11 passed; debounce, restart, reader inert, unsynced inert, one beacon on pagehide, no beacon without a waiting update, warn once, refused upload, missing page (evidence: red "expected vi.fn() to be called 1 times, but got 0 times"; pins: reader, unsynced states, nothing waiting)
- [x] `editor-api.test.ts` — expected: 5 passed; PUT with the blob, false on 413, beacon (evidence: red "uploadThumbnail is not implemented")
- [x] `document-thumbnail.test.tsx` and `document-card.test.tsx` — expected: 8 passed each; image with alt, title as alt without a preview, fallback on error, retry on a new version (evidence: red "Unable to find an element with the role img")

## E2E

- [x] `e2e/documents.spec.ts` "a typed document returns to the home with its captured page on the card" — expected: the image's `naturalWidth` equals `THUMBNAIL_WIDTH_PX` (evidence: red "unexpected value null" on `data-thumbnail-uploads`, green)
- [x] "a reader sees the edits and uploads no thumbnail" — expected: no thumbnail request from the reader after a fast-forward of twice the delay (evidence: pin at 7abcc881; mutation: removing the reader guard makes it fail with `Received: true`)
- [x] whole file — expected: 22 passed (evidence: 22 passed in 1.3 m)

## Playwright MCP walk

- [ ] Open a document with a heading, bold text and an image, type, wait 8 s, return home at 1280 — expected: the card shows the page with its fonts, heading and image
- [ ] Same at 375 — expected: one column, the image fills the 4:5 box from the top, the page never scrolls sideways
- [ ] Open a document never opened since the deploy — expected: the card keeps the text preview
- [ ] Open as a reader, type nothing, leave — expected: no `thumbnail` request in the network log
- [ ] Open as an editor and navigate to the home inside 8 s without a full reload — expected: the previous image stays; no error in the console

## Edge cases

- [ ] PUT a JPEG renamed to `.webp` with content type `image/webp` — expected: 415, the card unchanged
- [ ] PUT 200 KB plus one byte — expected: 413
- [ ] GET the thumbnail of another user's document — expected: 404, the same body as a missing document
- [ ] Delete a document with a thumbnail — expected: the file under `thumbnails/` is gone
