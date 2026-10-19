# Plan: Faithful document thumbnails

**Spec:** spec.md
**ADR:** [0045](../../adr/0045-thumbnails-are-captured-by-the-client-that-already-rendered-the-page.md)
**Tier:** 🟡
**Seams:** `apps/server/src/documents/thumbnail-routes.test.ts`, `apps/web/src/features/editor/use-thumbnail-capture.test.ts`, `e2e/documents.spec.ts`

## Steps

- [x] **Step 1:** spike on the built stack: capture cost, size and fidelity of the first page. — evidence: spec → Spike, 24390e04
- [x] **Step 2:** ADR 0045. — evidence: 32f3abd1
- [x] **Step 3:** `html-to-image` in the web app. — evidence: d6ee101c
- [x] **Step 4:** server red: types, column and migration, stubs, tests for magic bytes, storage, repository and routes. — evidence: f4367b8a
- [x] **Step 5:** server green: `thumbnailMimeTypeOf`, storage, `recordThumbnail`, PUT, POST and GET routes. — evidence: 95614a3c, 13 route tests, 6 image tests
- [x] **Step 6:** web red: capture, hook, upload and beacon tests. — evidence: ef78f6bf
- [x] **Step 7:** web green: `captureThumbnail`, `useThumbnailCapture`, `uploadThumbnail`, `sendThumbnailBeacon`. — evidence: 4e2bd431, 21 tests
- [x] **Step 8:** card red: image when set, preview as alt, fallback on error, E2E for the captured card. — evidence: 7abcc881
- [x] **Step 9:** card green and the one call in `document-page.tsx`. — evidence: e1dc18c3, E2E 22 of 22
- [x] **Step 10:** rule bullets, briefing and screenshots at 1280 and 375. — evidence: `.pr-media/faithful-thumbnails/`

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 5 | The migration fails on an existing database | the server refuses to start with a migration error | the column is nullable; drop it and the journal entry |
| 7 | The capture throws on a tainted canvas or a missing font | one warning per session; the card keeps the text preview | remove the call in `document-page.tsx`; the cards fall back |
| 7 | A tab closing inside the beacon capture loses the last update | the card shows the previous page until the next open | none needed; the next open recaptures |
| 9 | An image that 404s or stalls | `onError` falls back to the preview | none needed |

**Steps with no backout:** none. The column and the files are inert without the hook.
