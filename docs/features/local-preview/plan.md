# Plan: Local preview

**Spec:** spec.md
**Tier:** 🔴
**Seam:** `useUploadDocument` (keeps the file), `DocumentPage` (preview while Waiting), `readinessOf` (Create is Ready), `RoomBootstrap` and the member admission of `createCollaborationServer` (the device claim), `POST /api/documents` (the device flag).
**Assumptions (decided, owner can override):**
- SuperDoc's own document worker converts the preview; no worker of ours (spec, "What the importer allows in a worker").
- The device source reuses the bootstrap registry's attempt and fence; the creator tickets of ADR 0033 stay removed.
- A forged `preparation=device` on a file the server can hold is ignored, not refused.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/` (constants, documents), `apps/server/src/collaboration/room-bootstrap*`, `collaboration-server*`, `collaboration-runtime*`, `apps/server/src/documents/documents-routes*`, `store-document*`, `apps/server/src/server.ts` if wiring needs it | `lane-preview` |
| G2 | `apps/web/src/features/local-preview/`, `apps/web/src/features/editor/` (`use-opened-document`, `document-page`, `waiting-for-document`), `apps/web/src/features/open-progress/` (view builders and copy), `apps/web/src/testing/opened-document.ts` | `lane-preview` |
| G3 | `apps/web/src/features/documents/` (upload hook, dialog, drop zone, home, `documents-api`, copy) | `lane-preview` |
| G4 | `e2e/local-preview.spec.ts`, `e2e/restartable-stack.ts`, `docs/features/local-preview/`, `docs/adr/0049-*`, the index rows, `.claude/rules/` and READMEs that the change makes wrong | `lane-preview` |

## Sequencing

G1 types first, then G1 server and G2/G3 in that order, then G4.

## Steps

### G1

- [x] **Step 1:** types: `PreparationSource`, `PREPARATION_FIELD`, `DEVICE_PREPARATION_MIN_MEMORY_GIGABYTES`, `UploadRefusal`, `OpenedDocument.preparedOnDeviceOf`; data only, covered by the route and hook tests.
- [x] **Step 2:** `RoomBootstrap` device job: `request` registers it for a file the guard refuses, `claimDevice`, `deviceClosed`, `isDevicePending`, `isDeviceCreator`; the committing attempt keeps writing; test first.
- [x] **Step 3:** the open route answers Create to the owner of an uncommitted device job and carries `preparedOnDeviceOf`; the runtime reports the creator and the device preparation from the registry; test first.
- [x] **Step 4:** the collaboration server admits the owner as the claimed creator, fences by attempt, turns the socket into a member after the commit, fails the job on an early close; test first.
- [x] **Step 5:** `POST /api/documents`: the 413 body carries `canPrepareOnDevice`; `preparation=device` stores without converting only when the guard refuses; test first.

### G2

- [x] **Step 6:** `readinessOf` treats a Create answer as Ready; test first.
- [x] **Step 7:** the kept-file store and `useLocalPreview`; test first.
- [x] **Step 8:** the device guard (viewport, `deviceMemory`); test first.
- [x] **Step 9:** the preview view builder (pages so far, server detail, device owner name) and the copy; test first.
- [x] **Step 10:** `LocalPreview` (viewing-mode SuperDoc from the kept file, badge, panel) and its mount in `DocumentPage`; swap on Ready; test first.
- [ ] ~~**Step 11:** the creator's panel reads Preparing on this device while it converts; test first.~~ Struck: in Create mode SuperDoc syncs the empty room at once, so the panel already reads Rendering with the pages laid out so far while it converts; a separate stage would never show.

### G3

- [x] **Step 12:** `useUploadDocument` keeps the file on success; test first.
- [x] **Step 13:** `useUploadDocument` surfaces the device offer on a 413 with `canPrepareOnDevice` and re-sends with `preparation=device`; the offer component renders in the dialog, the drop zone and the home; test first.

### G4

- [x] **Step 14:** `e2e/local-preview.spec.ts`: preview before Ready with a ticking counter, swap without a reload, hybrid path under a scripted small limit. Evidence: the spec's seven cases, run on a scratch config at ports 3120 and 3129 because another lane held 3100 and 3199.
- [x] **Step 15:** measurements into the spec (Measured table, asserted in the E2E); tester briefing.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 4 | The creator's socket writes after the commit with a stale attempt and its edits are dropped | An owner's first edit after the commit never reaches a joiner | The commit clears the attempt of a device job; test first |
| 4 | Two owner tabs seed one room twice | Duplicated paragraphs after the commit | One live claim per job: another tab is refused and answered Join; a stale attempt's socket is read-only; test first |
| 5 | A client forces the device source on a small file | A small file prepared by a browser | Honoured only when the guard refuses; test first |
| 10 | Two SuperDoc instances alive at the swap | Memory doubles on the heavy file | The preview is destroyed in the same render that mounts the editor |
| 10 | The preview freezes the tab | The elapsed counter stops | The E2E asserts the counter ticks; fall back to a smaller layout window |

**Steps with no backout:** none. Every step is a code change behind the upload path.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** screenshots and video recorded and uploaded.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
