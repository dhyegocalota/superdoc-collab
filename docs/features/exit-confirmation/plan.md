# Plan: Exit confirmation while edits are unsynced

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `apps/web/src/features/editor/document-page.test.tsx`

## Steps

- [x] **Step 1:** add the alert dialog primitive and the exit copy.
- [x] **Step 2:** forward the title dirty report: `DocumentTitle` takes `onDirtyChange`, `EditorHeader` passes `onTitleDirtyChange` through, `DocumentPage` holds `isTitleDirty`.
- [x] **Step 3:** red tests for `useUnsyncedEdits`, `ExitConfirmationDialog`, the title report and the page seam.
- [x] **Step 4:** `useUnsyncedEdits`: edit while Lost, Reconnecting or Failed, `hasSynced` report, dirty title, `beforeunload`, reader never unsynced.
- [x] **Step 5:** `ExitConfirmationDialog`: `useBlocker`, Stay, Download, Leave, proceed when sync recovers.
- [x] **Step 6:** wire both into `DocumentPage` with stable callbacks (the editor effect depends on them).
- [x] **Step 7:** E2E `e2e/exit-confirmation.spec.ts`.
- [x] **Step 8:** sign-out while unsynced: a shared store, a pending leave and the dialog confirming it.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 6 | an unstable editor-update callback re-creates the editor on every render | `SuperDoc` constructed more than once in the page tests | keep both wrappers in `useCallback` |
| 5 | `blocker.reset()` after `proceed()` cancels the navigation | Leave stays on the page | Leave is a plain button, only Stay and Escape reset |

**Steps with no backout:** none.
