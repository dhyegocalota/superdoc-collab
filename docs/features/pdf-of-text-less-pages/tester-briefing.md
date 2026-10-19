# Tester briefing: PDF of text-less pages

## What changed

- `apps/web/src/features/versions/use-painted-pages-report.ts`: a page counts as painted when it holds a `.superdoc-fragment`, no longer when it has text. The `isBlank` import is gone.
- `print-page.test.tsx`: the stub builds pages with a fragment, or a bare shell when given `null`.
- `e2e/final-visuals.spec.ts`: new test `Download PDF of a new blank document prints its single page`, using the New document button, because the seed upload helper always writes text.
- `.claude/rules/web-ui.md` and `docs/features/final-visuals/spec.md` (data flow 7) say "every page holds a fragment".
- The lane merged `2800c33b` from `chore/feature-status-gate` to get the feature docs, which were not yet on `main`.

## How to run

```
pnpm --filter @superdoc-collab/web exec vitest run src/features/versions/print-page.test.tsx
pnpm test:e2e e2e/final-visuals.spec.ts -g "Download PDF"
```

The E2E stack binds port 3100; check `lsof -i :3100` first.

## Red then green

| Test | Red commit | Red run | Green after |
|------|-----------|---------|-------------|
| `reports Painted for a page whose fragment has no text` | e5a2889d | expected [] to have a length of 1 but got 0 | 02a23923 |
| `reports Painted only after every page has a fragment` | e5a2889d | same message | 02a23923 |
| `does not report Painted for a page shell without a fragment` | e5a2889d | green at red time: pin | stays green |
| E2E `Download PDF of a new blank document prints its single page` | added after the fix | with the old hook file restored it timed out at 60 s with no print call | green with the fix |

Unit: 10 of 10 pass. E2E: the 4 Download PDF tests pass in one run.

## Hypotheses to attack

- A fragment may mount before its text runs are laid out, so a long document could print a page with no text. The 4-page and brief tests assert `emptyPageCount` is 0, and passed once; run them three times.
- The blank document prints exactly one page: the E2E only asserts at least one.
- Image-only and page-break-only pages are not covered by a fixture.
- The scenario in production (New document, Download PDF, print dialog) is not walked here.
