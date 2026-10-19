# Plan: Title edit buttons

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `apps/web/src/features/editor/document-title.test.tsx`

## Steps

- [x] **Step 1:** red tests: buttons only while editing, Save disabled on blank and unchanged, Save renames, Cancel restores and focuses the title button, blur alone keeps the input open. — evidence: 0362f03d, 5 red
- [x] **Step 2:** `document-title.tsx`: form with a controlled draft, Save (submit) and Cancel buttons, icons below `sm`, no save on blur. — evidence: 8cde4c06, 9 of 9 green
- [x] **Step 3:** `e2e/final-visuals.spec.ts` rename test: add a rename through the Save button and a Cancel step. — evidence: 8cde4c06
- [x] **Step 4:** `pnpm typecheck`, the file's unit tests, the final-visuals E2E. — evidence: typecheck clean, final-visuals 30 passed

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | Clicking Cancel blurs the input before the click lands and the old blur-save fires | the Cancel test sends a PATCH | blur no longer saves, so the order cannot matter |
| 2 | Focus is not restored after a mouse Save or Cancel | the focus assertions fail | restore focus through the existing effect on `isEditing` |

**Steps with no backout:** none.
