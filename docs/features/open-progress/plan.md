# Plan: Open progress

**Spec:** spec.md
**Tier:** 🟡
**Seam:** the readiness poll in `use-opened-document.ts`, the `SuperDocEditor` callbacks and `uploadDocument`.
**Assumptions (decided, owner can override):**
- The open answer is 409 with `{ error, bootstrap }` while Queued or Preparing, and 200 with `bootstrap` once Ready (told to the lead).
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

- [ ] **Step 1:** `formatCount` and `formatByteCount` with their constants, test first.
- [ ] **Step 2:** `Progress` component, determinate and indeterminate.
- [ ] **Step 3:** `useDelayedReveal`, test first with fake timers.
- [ ] **Step 4:** `OpenProgressPanel` and the stage copy, test first for each stage.

### G2

- [ ] **Step 5:** `DocumentNotReadyError` carries the bootstrap; `openDocument` parses it strictly; test first.
- [ ] **Step 6:** Poll interval and Failed readiness from the stage; test first.
- [ ] **Step 7:** Waiting page shows the Preparing panel behind the delay; test first.
- [ ] **Step 8:** `SuperDocEditor` reports synced and page count; `useFirstFragment`; the editor view builder for Downloading and Rendering; test first.
- [ ] **Step 9:** `DocumentPage` and `EditorSurface` mount the panel and hide SuperDoc's overlay while it shows.

### G3

- [ ] **Step 10:** `apiSendWithProgress` over `XMLHttpRequest`; `uploadDocument` reports progress; test first.
- [ ] **Step 11:** `useUploadDocument` exposes progress; the dialog and the drop zone show the bar and the bytes; test first.

### G4

- [ ] **Step 12:** `e2e/open-progress.spec.ts`: Preparing numbers rise, large fixture stages in order, no panel for a normal document.
- [ ] **Step 13:** Screenshots at 1280 and 375, tester briefing.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 5 | The server answers 409 without a bootstrap | The page shows the Failed card on a document that is only preparing | Parse the missing field as a wait again, or fix the server lane |
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
