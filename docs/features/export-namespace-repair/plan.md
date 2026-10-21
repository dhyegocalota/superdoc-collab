# Plan: Export namespace repair

**Spec:** spec.md
**Tier:** 🟡
**Seam:** the two places that call `superdoc.export`: `useDownload` (PDF) and `downloadLiveDocument` (DOCX)
**Assumptions (decided, owner can override):**
- The map of namespaces is the list Word emits; an unknown prefix is an error, not a skip.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/editor/repair-exported-docx*`, `ooxml-namespaces.ts`, `download-menu*`, `document-page*`, `apps/web/src/lib/download-blob.ts`, `apps/web/package.json`, `libs/history/src/seed-docx.ts`, `e2e/editor.ts`, `e2e/final-visuals.spec.ts`, `docs/features/export-namespace-repair/` | `dev-pdf-namespaces` |

## Steps

### G1

- [x] **Step 1:** failing unit tests for the repair and a stub — 9a85fdb9
- [x] **Step 2:** the repair and the namespace map — 32279738
- [x] **Step 3:** failing tests that both downloads hand out the repaired file — a95228e8
- [x] **Step 4:** wire the PDF and the DOCX download through the repair — d0da51a3
- [x] **Step 5:** seed tracked changes carry `w16du:dateUtc`; E2E for PDF and DOCX — ffc707a1

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | A prefix outside the map throws on a real document | The PDF toast or the export-failed alert on a document that worked before | Add the namespace to the map |
| 4 | The blob anchor download is blocked or misnamed | `Download .docx` saves nothing or a wrong file name | Revert to SuperDoc's own download |

**Steps with no backout:** none

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **/check-ui:** not applicable, no screen changes.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
