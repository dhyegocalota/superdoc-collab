# Tester briefing: Export namespace repair

## What changed

- `repairExportedDocx` (`apps/web/src/features/editor/repair-exported-docx.ts`, namespaces in `ooxml-namespaces.ts`) declares the namespaces an export uses but dropped.
- The PDF path (`useDownload`) and the DOCX path (`downloadLiveDocument` in `document-page.tsx`) export with `triggerDownload: false`, repair, then print or save through `downloadBlob`.
- `buildSeedDocx` tracked changes now carry `w16du:dateUtc` with the namespace declared; `uploadSeed` takes optional tracked changes; `readDocumentXml` reads a package part.

## Red today, green after

| Test | Red failure text |
|------|------------------|
| `repair-exported-docx.test.ts` (7 cases) | `repairExportedDocx is not implemented for 418 bytes` (9a85fdb9) |
| `download-menu.test.tsx` Download PDF case | `expected '<?xml version="1.0" encoding="UTF-8" …' to contain 'xmlns:w16du=…'` (a95228e8) |
| `document-page.test.tsx` header and dialog download | `expected [] to deeply equal [ 'Plan.docx' ]` (a95228e8) |
| `final-visuals.spec.ts` tracked change from Word | with the repair replaced by a pass-through: `Expected: true Received: false` on the well-formed check; green with the repair (ffc707a1) |

## Hypotheses for the tester

- Download PDF of a Word file with tracked changes prints once and shows no failure toast.
- Download .docx saves `<title>.docx` and its `word/document.xml` parses.
- Documents without such attributes behave as before.

## Gaps

- The saved file name no longer comes from SuperDoc, so a title with characters a browser rewrites may differ.
- Only the prefixes in the map are repaired; any other undeclared prefix fails the download with the existing error.
