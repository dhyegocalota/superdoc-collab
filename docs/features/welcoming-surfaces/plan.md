# Plan: Welcoming surfaces

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `sign-in-page.tsx`, `sign-up-page.tsx`, `reset-password-page.tsx` (wrap), `documents-page.tsx`, `upload-dialog.tsx`

## Steps

- [ ] **Step 1 (red):** unit tests for `AuthLayout`, `HistoryIllustration` (aria-hidden, uses the author tokens), `DocumentsEmptyState` visibility; commit red alone.
- [ ] **Step 2 (green):** the illustration, the layout, the three pages wrapped.
- [ ] **Step 3 (red):** unit tests for `UploadDropZone` and `UploadDropOverlay` (enter/leave counting, Files-only, two files, non-DOCX, upload states); commit red alone.
- [ ] **Step 4 (green):** the drop zone, the overlay, the empty state wired to the existing upload mutation (reuse the dialog's mutation; move it to a hook `use-upload-document.ts` if it lives in the dialog).
- [ ] **Step 5:** E2E additions in `e2e/documents.spec.ts`; screenshots; tester briefing; `apps/web/README.md` if it lists pages.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | The sign-in E2E and the invite flow depend on the card's labels or layout | `e2e/auth.spec.ts` fails | keep every label, role and order inside the card untouched |
| 4 | The drop overlay intercepts clicks after a cancelled drag | the overlay stays visible in the E2E | reset the counter on `drop`, `dragend` and `mouseleave` of the window |
