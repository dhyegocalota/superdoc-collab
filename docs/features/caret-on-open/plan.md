# Plan: Caret on open

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `apps/web/src/features/editor/superdoc-editor.tsx`

## Steps

- [x] **Step 1 (spike):** throwaway `e2e/_caret-spike.spec.ts` tries the three approaches of the spec against a new document and a joined one; record the table in `spec.md`; delete the spec.
- [x] **Step 2 (red):** E2E `a new document accepts typing without a click` and `a joiner types without a click` (red: the text does not appear or the rejected-edit status shows); unit test of the hook; commit red alone.
- [x] **Step 3 (green):** `use-caret-on-open.ts` with the chosen mechanism; wire it in `superdoc-editor.tsx`.
- [x] **Step 4:** revisit the two focus learnings, update `.claude/rules/web-ui.md`; tester briefing.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 3 | The focus steals the caret from the title input or the Share dialog on reconnect | E2E rename test fails | run the hook once per instance, never on reconnect |
| 3 | First keystroke rejected (the 2026-10-17 trap) | `edit-rejected` status in the E2E | remove the hook; the lane ships nothing |
