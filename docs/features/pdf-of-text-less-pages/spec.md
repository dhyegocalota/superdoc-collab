# PDF of text-less pages

**Status:** Approved
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (owner: "download to pdf is failing, fix it")
**ADRs:** [0035](../../adr/0035-the-pdf-prints-from-a-same-origin-frame-with-its-own-viewport.md)
**Not changing:** the print view's shape (frame, messages, timeout), the DOCX download, the toast copy

## Problem

Download PDF of a document just created with New document always ends with "The PDF could not be prepared." Reproduced against production on 2026-10-19 with a headless browser: the print frame posted `print-ready`, received `print-load`, posted `print-page-count` and never `print-painted`; after `PRINT_READY_TIMEOUT_MS` the toast showed and the frame unmounted. The uploaded brief (three pages, all with text) printed. `usePaintedPagesReport` counts a page as painted only when its `textContent` is not blank, so a blank document, a page that holds only a page break and an image-only page can never be painted.

## Change

A page is painted when it holds a layout fragment (`.superdoc-fragment`), not when it has text. SuperDoc's DOM painter mounts a page shell with geometry and stamps but no content, then hydrates the fragments into it (`dist/layout-engine/painters/dom/src/page-content.d.ts`); the blank page in production carried one fragment for its empty paragraph. The page-count growth logic stays. `.claude/rules/web-ui.md` (print view fact) and the final-visuals spec, data flow 7, say "every page holds a fragment" instead of "every page has text".

## Test list

- Unit (`print-page.test.tsx`): a page shell without a fragment is not painted; a page with a fragment and no text is painted; two pages, the second gains its fragment later, Painted is posted once after it.
- E2E (`final-visuals.spec.ts`): Download PDF of a new blank document calls `print()` once with one page; the existing three PDF tests still pass.
