# Test plan: Shortcut hints in the editor's right-click menu

## The failing test first

- [ ] `context-menu-shortcuts.test.ts::comment and insert link carry the platform label` — expected: `Ctrl+Alt+M` and `Ctrl+K` on other platforms
- [ ] Confirmed it fails for the right reason: <paste>

## Unit

- [ ] provider: both platforms; Cut, Copy, Paste, Match Destination, Undo, Redo, Comment, Insert link, Insert footnote; unknown ids and sections untouched
- [ ] options: `ui.contextMenu.menuProvider` is set
- [ ] registry: the four clipboard entries are native, Insert footnote is an app entry
- [ ] handler: ⌘⌥F invokes the `insert-footnote` menu item at the caret and is not consumed without one

## E2E

- [ ] `e2e/shortcuts.spec.ts`: right-click a word, the menu shows the label next to Comment and Insert link; ⌘⌥F inserts a footnote

## Prove it for real — Playwright MCP

- [ ] Right-click a word: every hinted item shows its keys; Insert table and Keep Text Only show none
- [ ] Choose Comment: SuperDoc's comment form opens

## Coverage honesty

- Mac labels in the menu are exercised only by the provider's unit tests.
