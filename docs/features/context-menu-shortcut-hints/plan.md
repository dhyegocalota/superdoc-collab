# Plan: Shortcut hints in the editor's right-click menu

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `superdoc-options.ts` (the `ui.contextMenu.menuProvider`), the shortcuts registry and handler

## Steps

- [ ] **Step 1 (red):** registry entries, provider, options and footnote runner tests; E2E.
- [ ] **Step 2 (green):** registry, provider, options wiring, footnote runner.
- [ ] **Step 3:** E2E green, typecheck, tester briefing.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | The provider hides an item SuperDoc adds later | an unknown id disappears from the menu | the provider only sets `shortcut` and returns every item |
