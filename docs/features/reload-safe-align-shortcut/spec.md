# Reload-safe align shortcut

**Status:** Building
**Tier:** 🟢
**Owner approval:** approved 2026-10-21
**ADRs:** none
**Not changing:** align left ⌘L, centre ⌘E, justify ⌘J, every other key in the registry, the dispatch in `use-shortcuts.ts`

## Problem

`ShortcutId.AlignRight` sits on ⌘R / Ctrl+R, Word's key. The app consumes the key and calls `preventDefault`, so the browser reload is lost while a document is open. A reload is something a person reaches for when a connection looks stuck; the app must never take it.

## Goals

- Align right moves to ⌘⌥R on a Mac and Ctrl+Alt+R elsewhere.
- The browser reload keys ⌘R / Ctrl+R and ⌘⇧R / Ctrl+Shift+R are never `defaultPrevented` by the app while a document is open, including with the caret in the editor.
- The shortcuts dialog, tooltips and context menu show the new key, because they derive their labels from the registry.

## Non-goals

- Moving any other key.
- Changing how `use-shortcuts.ts` matches or consumes keys.

## Design

### Data flow

The registry entry for `ShortcutId.AlignRight` changes its modifiers from `[Mod]` to `[Mod, Alt]`, letter `R`. Matching is exact on modifiers, so a plain ⌘R no longer matches any definition and the hook ignores it; the browser reloads.

### Interfaces

No new symbol. `SHORTCUTS` keeps one entry per id; the registry test pins that no definition uses `KeyR` with Mod and without Alt.

### Failure handling

**Found by the E2E, 2026-10-21:** SuperDoc's docx-engine keydown handler on the editing surface calls `preventDefault` on Mod+Shift+R (seen with a wrapped `Event.prototype.preventDefault` and its stack); Mod+R is not touched, on a Mac or elsewhere. `useShortcuts` therefore registers a capture-phase listener on the document that stops propagation of Mod+Shift+R without calling `preventDefault`, so the engine never sees the key and the browser hard-reloads. The registry gets no entry for it.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Which key aligns right? | ⌘⌥R / Ctrl+Alt+R; ⌘⇧R; no shortcut | ⌘⌥R / Ctrl+Alt+R. ⌘⇧R is a hard reload in Chrome; no shortcut loses a Word habit for nothing | 2026-10-21 |

## Test strategy summary

Unit: registry pins the new combination and forbids the reload combinations; the hook leaves a Mod+R keydown alone. E2E: Mod+Alt+R aligns right, Mod+R and Mod+Shift+R leave alignment unchanged and are not `defaultPrevented`.
