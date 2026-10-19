# Plan: Word-like keyboard shortcuts

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `document-page.tsx` (handler), `editor-header.tsx`, `download-menu.tsx`, `find-button.tsx`, `account-menu.tsx` (hints and entries), SuperDoc's public command catalog

## Steps

- [x] **Step 1 (spike, never committed):** in a scratch E2E, press each Word key on a new document and record which SuperDoc 2.23.0 handles natively; find how the toolbar executes catalog commands (the public command surface on the instance) and whether toolbar tooltips accept extra text; write the table into `spec.md` under "Spike".
- [x] **Step 2 (red):** registry invariants, platform helper, `ShortcutHint`; commit red alone.
- [x] **Step 3 (green):** registry, platform helper, hint component.
- [x] **Step 4 (red → green):** `useShortcuts` handler and its page wiring; command execution through SuperDoc.
- [x] **Step 5 (red → green):** `ShortcutsDialog`, the account menu entry, the More actions row, hints in every tooltip and menu item.
- [x] **Step 6:** E2E `e2e/shortcuts.spec.ts`; screenshots at 1280 and 375 (modal, download menu with hints, tooltip with hint); tester briefing; rule bullet in `.claude/rules/web-ui.md` (Focus and keyboard).

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 4 | A shortcut the browser reserves is swallowed on every page | the sign-in E2E cannot use ⌘F | bind the handler only inside the document page |
| 4 | SuperDoc consumes the key first and our handler double-applies | bold toggles twice in the E2E | mark the entry `native` and never intercept it |
| 5 | Radix tooltip content re-renders per keystroke | tooltip tests flake | memoise the hint |
