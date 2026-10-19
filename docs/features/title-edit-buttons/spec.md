# Title edit buttons

**Status:** Approved
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (owner: "quero botoes de salvar ou cancelar edicao do titulo do doc")
**Not changing:** the rename API, the title validation, Enter to save and Escape to cancel

## Change

While the document title is being edited (`apps/web/src/features/editor/document-title.tsx`), two small buttons sit right of the input: `Save` (primary, `type="submit"`, disabled while the title is blank or unchanged or the rename is pending, `aria-busy` while pending) and `Cancel` (ghost), with copy constants `SAVE_TITLE_LABEL` and `CANCEL_TITLE_LABEL` in `editor-copy.ts`. Save does what Enter does; Cancel does what Escape does and returns focus to the title button. Blur no longer saves by itself if it did; it keeps the editor open so the buttons stay reachable with the mouse, and Escape or Cancel leaves. At narrow widths the buttons stay on the same row as the input (icons `Check` and `X` from lucide with the labels as `aria-label` below `sm`, text labels at `sm` and above).

## Test list

- `document-title.test.tsx`: the buttons appear only while editing; Save disabled on blank and on unchanged; Save renames and closes; Cancel restores the previous title and focuses the title button; Enter and Escape still work.
- `e2e/final-visuals.spec.ts` rename test keeps passing; add one step that renames with the Save button.
