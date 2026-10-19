# Tester briefing: Title edit buttons

## What changed

- `apps/web/src/features/editor/document-title.tsx` — editing renders a form with the input, an icon-only Save submit button (inside a tooltip trigger span) and an icon-only Cancel ghost button, both `icon-sm`; the draft is controlled state; Enter and Escape handled in the key handler; blur does nothing.
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
2. Hypothesis: at every width the buttons are icons only, on one row with the input, the header height does not change while editing, and nothing in the header overflows at 375, 768 and 1280 with a 120-character title. Break it by: resizing to 320 and 1920, zooming the page to 200 percent.
3. Hypothesis: Enter on a blank or unchanged title closes the editor and sends nothing. Break it by: watching the network tab.
4. Hypothesis: focus returns to the title button after Save, Cancel, Enter and Escape. Break it by: tabbing after each.
5. Hypothesis: clicking elsewhere leaves the input open with the typed text. Break it by: clicking the editor surface, then pressing Enter.

## Known gaps

- A disabled Save carries `SAVE_TITLE_DISABLED_REASON` through `aria-describedby` (commit 98ec9a38); the reason shows whenever Save is disabled, not only while the input is focused.
- Leaving the input open on blur means a typed draft is lost only on Escape, Cancel or reload.

## Header overflow walk

A scratch spec (not committed) opened a document, edited a 120-character title at 375, 768 and 1280 and asserted: header height equal before and during editing, no header descendant past the viewport, header not scrolling sideways, page not scrolling sideways, Save and Cancel 32 px tall. Screenshots are in the git-ignored `.pr-media/title-edit-buttons/` (`header-375.png`, `header-768.png`, `header-1280.png`).

## Tester run 2026-10-19

- Walked at 1280, 375 and 320 with real pointer clicks. Hypotheses 1, 3, 4, 5 held. Hypothesis 2 held for scroll (none) but the input is 27 px wide at 320 px.
- Defect (minor): title input unusably narrow at 320 px with the two icon buttons. Not run: vitest, typecheck, e2e (lead's gates).
- Console errors: none.

## Narrow widths (lead note, 2026-10-19)

- Below `md`, while the title is edited, the right-hand header groups and the divider are hidden so the editor takes the row: input widths 160, 215, 268 and 376 px at 320, 375, 768 and 1280, header height unchanged (commits 2704f7a1, 89627c13; screenshots in `.pr-media/title-edit-buttons/`).
