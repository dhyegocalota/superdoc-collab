# Tester briefing: Title edit buttons

## What changed

- `apps/web/src/features/editor/document-title.tsx` — editing renders a form with the input, a Save submit button and a Cancel ghost button; the draft is controlled state; Enter and Escape handled in the key handler; blur does nothing.
- `apps/web/src/features/editor/editor-copy.ts` — `SAVE_TITLE_LABEL`, `CANCEL_TITLE_LABEL`.
- `apps/web/src/features/editor/document-title.test.tsx` — five new tests.
- `e2e/final-visuals.spec.ts` — the rename test also saves with the Save button and cancels with the Cancel button.

## How to run

```bash
pnpm --filter @superdoc-collab/web exec vitest run src/features/editor/document-title.test.tsx
pnpm test:e2e e2e/final-visuals.spec.ts
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `document-title.test.tsx::the Save and Cancel buttons appear only while editing` | no Save button | form renders both |
| `…::Save is disabled while the title is blank or unchanged` | no Save button | disabled from draft |
| `…::Save renames, closes the input and returns focus to the title button` | no Save button | submit saves |
| `…::Cancel restores the previous title, sends nothing and focuses the title button` | no Cancel button | Cancel stops editing |
| `…::blur alone neither saves nor closes the input` | the input closed on blur | blur handler removed |

Failure text is in `test-plan.md`. Commit 0362f03d is red, 8cde4c06 is green.

## Hypotheses to attack

1. Hypothesis: a mouse click on Save or Cancel never loses to a blur. Break it by: clicking each with a real pointer at 1280 and 375.
2. Hypothesis: below 640 px the buttons show only icons on the same row as the input, with no horizontal scroll at 320 px. Break it by: resizing to 320 with a long title.
3. Hypothesis: Enter on a blank or unchanged title closes the editor and sends nothing. Break it by: watching the network tab.
4. Hypothesis: focus returns to the title button after Save, Cancel, Enter and Escape. Break it by: tabbing after each.
5. Hypothesis: clicking elsewhere leaves the input open with the typed text. Break it by: clicking the editor surface, then pressing Enter.

## Known gaps

- Save is disabled with no visible reason (the web-ui rule asks for one on disabled controls); the spec does not ask for it.
- Leaving the input open on blur means a typed draft is lost only on Escape, Cancel or reload.
