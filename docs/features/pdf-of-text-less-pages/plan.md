# Plan: PDF of text-less pages

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `apps/web/src/features/versions/use-painted-pages-report.ts`

## Steps

- [x] **Step 1 (red):** unit tests in `print-page.test.tsx` build pages as shells and fragments (`<div class="superdoc-page"><div class="superdoc-fragment">`); a fragment-less shell is not painted, a fragment without text is; commit the red test alone with the failure text in the test plan.
- [x] **Step 2 (green):** `arePagesPainted` checks `page.querySelector('.superdoc-fragment') !== null`; constant `FRAGMENT_SELECTOR` next to `PAGE_SELECTOR`.
- [x] **Step 3:** E2E `Download PDF of a new blank document prints its single page` in `e2e/final-visuals.spec.ts` (stub print, expect `calls: 1`, `pageCount >= 1`); run only that spec file.
- [x] **Step 4:** update the print-view fact in `.claude/rules/web-ui.md` and data flow 7 of `docs/features/final-visuals/spec.md`; tester briefing.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | A shell paints a fragment before its text runs are laid out, so a long document prints a page with no text | the three existing PDF E2E tests report `emptyPageCount > 0` | require a fragment on every page and text on every page that is not the last |
