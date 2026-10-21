# Plan: Toolbar: ruler, document mode and theme

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `TOOLBAR_EXCLUDED_ITEMS` in `superdoc-options.ts` and `EditorToolbarRow`.
**Assumptions (decided, owner can override):**
- One developer, one lane; the groups below run in order.
- Custom accent is stored as the hex itself, so one storage key holds the whole choice.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/editor/superdoc-options.ts` (+test), `apps/web/src/features/shortcuts/use-shortcuts.ts` (+test) | `developer` |
| G2 | `apps/web/src/features/editor/editor-theme.ts`, `use-editor-theme.ts` (+tests), `apps/web/src/styles/globals.css` | `developer` |
| G3 | `apps/web/src/features/editor/theme-button.tsx`, `editor-toolbar-row.tsx` (+test), `editor-copy.ts` | `developer` |
| G4 | `e2e/toolbar-ruler-mode-theme.spec.ts`, READMEs, `.claude/rules/web-ui.md` | `developer` |

## Sequencing

G1 to G4 in order: G3 needs the hook of G2, the E2E needs everything.

## Steps

### G1

- [x] **Step 1:** failing test: `TOOLBAR_EXCLUDED_ITEMS` still lists `ruler` and `document-mode`; then remove both. — evidence: 7cc9a9f8 (red 8610fa11)

### G2

- [x] **Step 2:** failing test for `editor-theme.ts` (parse a stored value, theme config per preset, text colour by luminance); then the module. — evidence: 443226af (red 24e81296)
- [x] **Step 3:** failing test for `useEditorTheme` (class applied, value persisted, corrupt value removed, other tab followed); then the hook and the `globals.css` mapping. — evidence: c1f1ca4c (red ed0a63f6)

### G3

- [x] **Step 4:** failing test: the toolbar row shows a Theme button for an Editor and none for a Reader; then `ThemeButton`, the row and the copy. — evidence: 436b7b89 (red e8e0fdfc)

### G4

- [ ] **Step 5:** the E2E spec; READMEs and rules updated.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | The mode dropdown disagrees with ⌘⌥T | E2E: after the shortcut the dropdown label still reads Editing | fix `use-shortcuts.ts` to go through the host, or re-exclude `document-mode` |
| 1 | The ruler button crowds a narrow toolbar | 375 px walk: items overflow without the overflow menu | re-exclude `ruler` |
| 3 | Default no longer matches today's look | screenshot diff of the toolbar with no stored value | drop the `globals.css` mapping |
| 3 | `light-dark()` unsupported | action colour falls back to the app primary in an old browser | acceptable: Default look |
| 4 | Popover clipped by the toolbar's `overflow-x-clip` | popover not visible on open | portal the content |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** screenshots and video recorded and uploaded (only if UI was touched).
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
