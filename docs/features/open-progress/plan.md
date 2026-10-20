# Plan: Open progress

**Spec:** spec.md
**Tier:** 🟡
**Seam:** the readiness poll in `use-opened-document.ts`, the `SuperDocEditor` callbacks and `uploadDocument`.
**Assumptions (decided, owner can override):**
- The open answer is 200 for every stage with `bootstrap` (server-bootstrap spec); Preparing reports `done` 0 of the DOCX bytes.
- Downloading and Rendering carry no determinate number because SuperDoc exposes none.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/open-progress/`, `apps/web/src/components/ui/progress.tsx`, `apps/web/src/lib/format-quantity*`, `libs/types/src/constants.ts` (three constants) | `lane-progress` |
| G2 | `apps/web/src/features/editor/` (open answer, poll, waiting page, `SuperDocEditor`, `DocumentPage`, `EditorSurface`) | `lane-progress` |
| G3 | `apps/web/src/lib/api.ts`, `apps/web/src/features/documents/` (upload) | `lane-progress` |
| G4 | `e2e/open-progress.spec.ts`, `docs/features/open-progress/`, the index row | `lane-progress` |

## Sequencing

G1 first, then G2 and G3, then G4.

## Steps

### G1

- [x] **Step 1:** `formatCount` and `formatByteCount` with their constants, test first.
- [x] **Step 2:** `Progress` component, determinate and indeterminate.
- [x] **Step 3:** `useDelayedReveal`, test first with fake timers.
- [x] **Step 4:** `OpenProgressPanel` and the stage copy, test first for each stage.

### G2

- [x] **Step 5:** `readinessOf` maps the bootstrap stage; `bootstrap` is exposed for every stage and `data` only once Ready; test first.
- [x] **Step 6:** Poll interval from the stage; test first.
- [x] **Step 7:** Waiting page shows the Preparing panel behind the delay; test first.
- [x] **Step 8:** `SuperDocEditor` reports synced, page count and failure; `useHasPaintedParagraph`; the editor view builder for Downloading and Rendering; test first.
- [x] **Step 9:** `DocumentPage` and `EditorSurface` mount the panel and hide SuperDoc's overlay while it shows.

### G3

- [x] **Step 10:** `apiSendWithProgress` over `XMLHttpRequest`; `uploadDocument` reports progress; test first.
- [x] **Step 11:** `useUploadDocument` exposes progress; the dialog and the drop zone show the bar and the bytes; test first.

### G4

- [x] **Step 12:** `e2e/open-progress.spec.ts`: the Preparing bar rises, a joiner of the large fixture watches the download tick and the panel leave, the upload bar fills; a normal document leaves no panel behind.
- [x] **Step 13:** Screenshots at 1280 and 375, tester briefing.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 5 | An answer without `bootstrap` (an old server) | A TypeError reading `bootstrap.stage` | Merge the server-bootstrap lane first; the E2E adds the field to real answers until then |
| 8 | `onCollaborationReady` never fires | The panel stays on Downloading | The first-fragment rule ends the panel anyway |
| 9 | The panel never leaves | `[data-testid=open-progress]` still there with the page painted | The first-fragment observer is the only exit; test it |
| 10 | XHR differs from fetch for cookies | Upload answers 401 | `withCredentials` set on the request |

**Steps with no backout:** none.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **/check-ui:** screenshots and video recorded and uploaded.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
