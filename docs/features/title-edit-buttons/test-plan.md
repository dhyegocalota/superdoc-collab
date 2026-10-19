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

- [ ] `vitest run src/features/editor/document-title.test.tsx` — expected: all green
- [ ] `pnpm typecheck` — expected: clean
- [ ] `pnpm test:e2e e2e/final-visuals.spec.ts` — expected: the rename test passes, including the Save button step
- [ ] Walk at 1280 and 375: click the title, the buttons sit right of the input on one row; icons only at 375, text at 1280
- [ ] Click outside the input: it stays open; Escape, Cancel and Enter, Save behave as in the spec
