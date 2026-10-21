# Test plan: Export namespace repair

## The failing test first

- [ ] `apps/web/src/features/editor/repair-exported-docx.test.ts` — input: a package whose `word/document.xml` uses `w16du:dateUtc` with no declaration; expected: the part parses after the repair
- [ ] Confirmed it fails for the right reason: `repairExportedDocx is not implemented for 418 bytes`

## Unit

- [ ] `repair-exported-docx.test.ts::an already well-formed export comes out with identical part contents` — expected: byte-identical `word/document.xml` and `word/styles.xml`
- [ ] Edge: `a prefix declared on an inner element is not a missing declaration` — expected: part unchanged
- [ ] Edge: `a prefix inside an attribute value or a text node is not read as a prefix in use` — expected: part unchanged
- [ ] Edge: `an unknown undeclared prefix throws` — input: `mystery:node`; expected: rejects naming `mystery`
- [ ] Edge: `parts outside word/ are left alone`
- [ ] `download-menu.test.tsx` — expected: the print frame receives a file whose `document.xml` declares `w16du`
- [ ] `document-page.test.tsx` — expected: the header and the dialog download the repaired blob as `<title>.docx` with `triggerDownload: false`

## E2E (Playwright specs)

- [ ] `e2e/final-visuals.spec.ts::Download PDF of a document with a tracked change from Word prints, and Download .docx hands out a well-formed document` — steps: upload a DOCX with a `w16du:dateUtc` insertion, click Download, then Download PDF; expected: the downloaded `document.xml` contains `w16du:dateUtc` and parses; `print()` is called once; no PDF failure toast

## Prove it for real — Playwright MCP

- [ ] Upload a Word file with tracked changes in the app, Download PDF; expected: the print dialog opens and no failure toast shows
- [ ] Download .docx of the same document, open it in Word or unzip it; expected: `word/document.xml` is well-formed

## Edge cases found during execution

## Adversarial review

- [ ] Claim 1: a real Word document never has a prefix outside the map — attack: export the brief and a document with comments, charts and shapes; result:
- [ ] Claim 2: re-zipping keeps every part — attack: compare entry names before and after on a document with an image; result:
- [ ] Claim 3: the blob download names the file like SuperDoc did — attack: rename the document with accents and spaces, download; result:

## Coverage honesty

- The `mc:Ignorable` list is not repaired when SuperDoc drops the prefixes it names; Word tolerates an Ignorable prefix it cannot resolve less well than a parser, and this was not observed.
