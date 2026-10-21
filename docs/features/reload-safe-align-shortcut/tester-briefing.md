# Tester briefing: Reload-safe align shortcut

## What changed

- `apps/web/src/features/shortcuts/shortcuts.ts` — `ShortcutId.AlignRight` modifiers `[Mod]` to `[Mod, Alt]`; labels in the dialog, tooltips and context menu derive from it.
- `apps/web/src/features/shortcuts/shortcuts.test.ts` — registry pin: AlignRight is Mod+Alt+R, no definition holds Mod+KeyR without Alt.
- `apps/web/src/features/shortcuts/use-shortcuts.test.ts` — two appended tests (sibling lane `toolbar-ruler-mode-theme` owns `use-shortcuts.ts`; this file only gets additions at the end, expect a trivial merge at the tail). `use-shortcuts.ts` is untouched.
- `e2e/shortcuts.spec.ts` — `Mod+Alt+R aligns right and the reload keys are left alone`.
- `docs/features/word-like-shortcuts/spec.md` — states ⌘⌥R for right.

SuperDoc 2.23.0: a literal search of the `superdoc` and `@superdoc/docx-engine` bundles found no Mod-r or Mod-Shift-r binding, but the engine is minified, so this is a hypothesis the E2E decides. No capture-phase workaround was added.

## How to run

```bash
pnpm exec vitest run apps/web/src/features/shortcuts/shortcuts.test.ts
pnpm exec vitest run apps/web/src/features/shortcuts/use-shortcuts.test.ts
pnpm exec playwright test e2e/shortcuts.spec.ts -g "reload keys"
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `shortcuts.test.ts::align right is Mod+Alt+R and no key takes the browser reload` | red run printed `AssertionError: expected [ 'mod' ] to deeply equal [ 'alt', 'mod' ]` | AlignRight carries Alt |
| `use-shortcuts.test.ts::Ctrl+Alt+R aligns right` | not observed red: the run queued behind the machine lock after the implementation was in the tree; by reading, Ctrl+Alt+R matched nothing | the combination matches |
| `use-shortcuts.test.ts::Ctrl+R and Ctrl+Shift+R are never consumed` | not observed red (same queue reason); by reading, Ctrl+R matched AlignRight before | no definition matches |
| `e2e/shortcuts.spec.ts::Mod+Alt+R aligns right and the reload keys are left alone` | never run by the developer | needs the stack |

## Hypotheses to attack

1. SuperDoc does not preventDefault Mod+R or Mod+Shift+R with the caret in the editor. Break it by: the E2E, then a table cell, a list, a selection.
2. Mod+Alt+R does not collide with a browser key. Break it by: pressing it in Chrome and Safari.
3. The dialog (Mod+/) shows ⌘⌥R / Ctrl+Alt+R for Align right.

## Known gaps

- The E2E was not run by the developer.
- The E2E registers a window keydown listener to read `defaultPrevented`; it runs after the app's handler only if the app listens on `document` or in the bubble phase.
