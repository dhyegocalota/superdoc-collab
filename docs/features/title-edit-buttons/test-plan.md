# Test plan: Title edit buttons

## Red today

`vitest run src/features/editor/document-title.test.tsx` on the red commit: 5 failed, 4 passed.

```
× the Save and Cancel buttons appear only while editing
× Save is disabled while the title is blank or unchanged
× Save renames, closes the input and returns focus to the title button
× Cancel restores the previous title, sends nothing and focuses the title button
× blur alone neither saves nor closes the input
TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Save"
TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Cancel"
TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name "Title"
```

## Checks

- [ ] `vitest run src/features/editor/document-title.test.tsx` — expected: all green — BLOCKED: unit and E2E gates are the lead's; the tester walk only
- [ ] `pnpm typecheck` — expected: clean — BLOCKED: unit and E2E gates are the lead's; the tester walk only
- [ ] `pnpm test:e2e e2e/final-visuals.spec.ts` — expected: the rename test passes, including the Save button step — BLOCKED: unit and E2E gates are the lead's; the tester walk only
- [x] Walk at 1280 and 375: click the title, the buttons sit right of the input on one row; icons only at 375, text at 1280 — evidence: 1280: input, Save and Cancel on one row (input 320 px, Save 53 px with text, Cancel 66 px with text); 375: icons only 32 px squares on the same row, document scrollWidth 375 = viewport; screenshots .pr-media/testing/title-edit-buttons-open-1280.png, title-edit-buttons-open-375.png, title-edit-buttons-open-320.png; but see the 320 px edge case
- [x] Click outside the input: it stays open; Escape, Cancel and Enter, Save behave as in the spec — evidence: clicking the editor surface left the input open with the typed text "Draft title"; Escape restored "Untitled document" with no PATCH and focus on the Rename button; Cancel (real pointer) same; Enter on an unchanged title closed with no PATCH; Save (real pointer) PATCH 200 {"title":"Saved by click"}, focus on the Rename button; Enter with a new title PATCH 200 {"title":"Saved by enter"}; Enter on blank closed, no PATCH, title kept

## Edge cases found during execution

- At 320 px with a long title the input shrinks to 27 px (82 px at 375 px) and shows no readable text: the buttons keep 32 px each and the input takes the leftover. No horizontal scroll, so hypothesis 2 holds, but editing at 320 is nearly blind. Screenshot .pr-media/testing/title-edit-buttons-open-320.png. Minor defect, owner decides whether 320 matters.
- Hypothesis 3 and 5 confirmed in the network log: blank and unchanged Enter send no PATCH; clicking the editor with the input open keeps it open.
