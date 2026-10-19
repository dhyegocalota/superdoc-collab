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

- [x] Open a document with a heading, bold text and an image, type, wait 8 s, return home at 1280 — expected: the card shows the page with its fonts, heading and image — evidence: after 11 s the card image is 320 by 414 and shows the heading line, the bold line "Bold body text here and plain tail", the red pasted image and the logo image; editor source .pr-media/testing2/faithful-thumbnails-editor-source-1280.png, card .pr-media/testing2/faithful-thumbnails-home-after-capture-1280.png; a second document (typed, bold, Times New Roman) matches its editor font and weight, .pr-media/testing2/faithful-thumbnails-card-image-1280.png against .pr-media/testing2/faithful-thumbnails-editor-same-state-1280.png
- [x] Same at 375 — expected: one column, the image fills the 4:5 box from the top, the page never scrolls sideways — evidence: image 310 by 386.5 in a 310 by 387.5 box at offset 0, ratio 0.8, scrollWidth 375; .pr-media/testing2/faithful-thumbnails-home-375.png
- [x] Open a document never opened since the deploy — expected: the card keeps the text preview — evidence: documents created and never opened (A, Quarterly plan, the long title) show no img and the text preview; .pr-media/testing2/faithful-thumbnails-home-after-capture-1280.png
- [x] Open as a reader, type nothing, leave — expected: no `thumbnail` request in the network log — evidence: Bruno opened Ana's read-only link and stayed 14 s; browser_network_requests filtered on thumbnail returned nothing; console errors 0
- [x] Open as an editor and navigate to the home inside 8 s without a full reload — expected: the previous image stays; no error in the console — evidence: opened "Shortcut title", typed, went home through the logo link after 1.5 s; the card image URL stayed at the earlier version (v=1792423598151); console errors 0; .pr-media/testing2/faithful-thumbnails-leave-before-8s-1280.png

## Edge cases

- [x] PUT a JPEG renamed to `.webp` with content type `image/webp` — expected: 415, the card unchanged — evidence: 415 "Only WebP and PNG thumbnails can be stored"; a PNG sent as image/jpeg also 415
- [x] PUT 200 KB plus one byte — expected: 413 — evidence: 204801 bytes gave 413 "The thumbnail is too large"; exactly 204800 bytes gave 204
- [x] GET the thumbnail of another user's document — expected: 404, the same body as a missing document — evidence: Bruno on Ana's unshared document gave 404 {"error":"Not found"}, identical to an unknown id; PUT on it also 404; Bruno as reader PUT gave 403 and GET 200 image/webp
- [x] Delete a document with a thumbnail — expected: the file under `thumbnails/` is gone — evidence: DELETE answered 204; find in the stack's DATABASE_DIR no longer lists fe0f67af-….docx or its .thumbnail; only the other document's thumbnail remained

## Edge cases found during execution (tester run 2026-10-19)

- [x] Opening a document as an editor without typing uploads once — evidence: reopening "Shortcut title" moved its thumbnail version from 1792423536877 to 1792423598151 without a keystroke, as the briefing hypothesised
- [x] A WebP with a valid header and garbage body (200 KB) is accepted — evidence: the PUT answered 204 and replaced the real image; the card then shows the text preview, the fallback working, but the server validates only the magic bytes; .pr-media/testing2/faithful-thumbnails-corrupt-webp-card-1280.png. Not a defect against the spec, noted for the reviewer
- [x] The editor-side upload is silent on the page — evidence: no toast and console errors 0 across the capture, the leave-early and the reload flows

## Third walk (2026-10-19, lane/testing2 at 66e1cc88)

- [x] 375 px with the real scroller — evidence: documents home with a captured image card: document 375 of 375, shell scroller 360 of 360; image cards and text previews both 486 px; .pr-media/testing2/w375-documents-home.png
- [x] Leaving an editor with a full navigation while updates were pending shows the browser's beforeunload prompt (accepted in the walk); noted, not a defect
