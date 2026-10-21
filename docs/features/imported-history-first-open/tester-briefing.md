# Tester briefing: Imported history on first open

Written by the lead; no separate developer or tester sub-agent ran, on the owner's request.

## What changed

- `apps/server/src/history/timeline-service.ts` — an imported-only bin opens the bootstrap mark.
- `apps/web/src/features/versions/version-banner.tsx` — "Document as uploaded on …" when the bin ends before the version.
- `apps/web/src/features/timeline/use-imported-history-summary.ts` — starts Summarize once on first open of imported history.

## How to run

The scenario stack, then upload a DOCX with comments or tracked changes by other authors.

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `timeline-routes.test.ts::a bin of only imported events opens the document as uploaded, the bootstrap mark` | the bin answered sequence 0 | the resolver skips the imported sequence |
| `time-travel.test.tsx::a bin older than the version it opens says the document is shown as uploaded` | the banner said "Version at" | the uploaded label |
| `use-imported-history-summary.test.tsx` | the module did not exist | the hook exists |
