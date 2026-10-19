# Shortcut hints in the editor's right-click menu

**Status:** Building
**Tier:** 🟢
**Owner approval:** requested 2026-10-19 (owner's request, translated: "every item of the editor's right-click menu that has a shortcut shows it there too, and the items that have a Word equivalent get one")
**ADRs:** none new
**Not changing:** SuperDoc's menu items, their order and what they do

## Problem

SuperDoc's context menu shows a hint only for Cut, Copy, Paste, Match Destination Formatting, Undo and Redo, and prints it as the raw string `Mod+X`. Comment, Insert link and Insert footnote carry no hint although the registry has their keys.

## What SuperDoc allows (research)

- `ui.contextMenu` in the SuperDoc config takes a `ContextMenuConfig` (`superdoc/dist/superdoc/src/core/types/index.d.ts`, `ContextMenuConfig.menuProvider`). The provider receives the resolved sections and returns them; every `ContextMenuItem` has a `shortcut?: string` that the menu renders in `.v2-context-menu__shortcut`. No DOM patching is needed.
- The built-in item ids, read from the provider in 2.23.0: `comment`, `cut`, `copy`, `paste` (Keep Source Formatting), `paste-match-destination`, `paste-text-only`, `undo`, `redo`, `insert-link`, `insert-table`, `insert-footnote`. The built-in hints are the raw strings `Mod+X`, `Mod+C`, `Mod+V`, `Mod+Shift+V`, `Mod+Z`, `Mod+Shift+Z`.
- Choosing Comment from the menu opens SuperDoc's own comment form (`.v2-comment-form`), not the app's composer. The two forms coexist: the key opens the app's composer, the menu opens SuperDoc's.
- Keys: nothing in SuperDoc binds ⌘⌥F, ⌘⇧V or ⌘⌥V. The browser handles Cut, Copy, Paste and Match Destination Formatting natively.

## Design

- The registry gains Cut ⌘X, Copy ⌘C, Paste ⌘V and Paste without formatting ⌘⇧V as `native` entries in Editing, and Insert footnote ⌘⌥F as an `app` entry in Comments and review. Insert footnote calls `superdoc.activeEditor.doc.footnotes.insert({ type: 'footnote', content: '' })`, which inserts at the caret. `ui.commands.getContextMenuItems` returns only custom contributions, never the built-in items (empty at the caret in 2.23.0), so the menu's own item cannot be invoked.
- `contextMenuShortcutProvider` maps each menu item id to its `ShortcutId` and sets `shortcut` to the platform label (`⌘⌥M` on a Mac, `Ctrl+Alt+M` elsewhere); `superdocOptions` passes it as `ui.contextMenu.menuProvider`.
- No key exists for Insert table (Word has none), nor for Keep Text Only (SuperDoc and the browser bind none), so those two items stay without a hint.

## Failure handling

| Case | Behaviour |
|---|---|
| The menu has an item id the provider does not know | left as SuperDoc built it |
| No active editor when ⌘⌥F is pressed | the key is not consumed |

## Test strategy summary

Unit: the provider (both platforms, unknown ids untouched, sections kept), the options carry the provider, the registry entries, the footnote runner. E2E: right-click a word, the menu shows the platform label next to Comment and Insert link, and ⌘⌥F inserts a footnote.
