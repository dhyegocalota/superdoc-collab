# Tester briefing: Word-like keyboard shortcuts

Every "it works" below is a hypothesis for the tester to disprove.

## What changed

- A registry of 28 shortcuts in `apps/web/src/features/shortcuts/shortcuts.ts`. Each entry is `native` (SuperDoc handles it, listed only), `command` (runs through `superdoc.ui.commands`) or `app` (an app action).
- `useShortcuts` listens on `document` while the editor header is mounted, so only on the document page. It stands down on `defaultPrevented`, on a text field with content, and for formatting keys when the role is reader or a past version shows.
- `ShortcutsDialog` opens with Mod+/ , with `?` outside any text control, from the account menu and from the last row of the More actions menu.
- Hints: `ShortcutHint` pills in the Find and Download tooltips, in the Download, Find and Keyboard shortcuts menu items, and as plain text in SuperDoc's toolbar tooltips through `ui.toolbar.strings`.
- `lib/platform.ts` detects Mac from `userAgentData` first, then `navigator.platform`.

## Spike-driven decisions (see spec.md "Spike")

- Bullets are not on Mod+Shift+L: SuperDoc consumes it for left align. Bullets and numbering are the native Mod+Shift+8 and Mod+Shift+7.
- Subscript and superscript are left out: SuperDoc 2.23.0 has no command for them.
- Mod+F is native and not consumed by SuperDoc, so the app never intercepts it.

## Comments, review, zoom, Docs keys, held keys (second round)

- Add comment ⌘⌥M opens a small composer (SuperDoc has none) and sends `createFromSelection` on the live selection; with nothing selected the composer shows an alert after Comment. Next and previous comment ⌘⌥N and ⌘⌥P walk `ui.comments.list()` with `scrollTo`. Zoom ⌘⌥= and ⌘⌥- step through 50, 75, 90, 100, 125, 150, 200. ⌘⌥E toggles the edits panel and ⌘⌥S summarizes (editors only).
- Clear formatting is ⌘\ on a Mac and Ctrl+Space elsewhere; indent is ⌘] and ⌘[ on a Mac (⌘M minimises the window) and Ctrl+M elsewhere; normal text also on ⌘⌥0; select all and headings 4 to 6 are native and listed.
- Track changes is ⌘⌥T (⌘⇧E is consumed for centring first); the Summarize button and the edits panel toggle carry their hints.
- Unavailable and left out: page break ⌘Enter (no catalog command), ⌘Space on a Mac (Spotlight), subscript and superscript.
- A capture-phase guard swallows held keys of toggle entries and one-shot app entries, so ⌘B held toggles once.
- ⌘P opens the browser's native print dialog on purpose (the PDF path); skip it in MCP walks.

## Left out

- Hints on Share, Summarize and More actions: they have no key. The title Save and Cancel now carry Enter and Esc.
- Hints on SuperDoc toolbar items without one key (text align, font size, colours).

## Red first

| Commit | Red failure text |
|---|---|
| bce34167 | `detectPlatform is not implemented`; `shortcutKeyParts is not implemented for normal-text on mac`; `ShortcutKeyPills is not implemented for normal-text on mac`; the registry tests: `AssertionError: expected [] to deeply equal [ 'align-center', …(27) ]` |
| 0cfdc420 | `useShortcuts is not implemented for true`, 15 tests |
| ab0570ab | `AssertionError: expected true to be false`, 4 header tests: the key is not consumed |
| d0061dc5 | `ShortcutsDialog is not implemented for true`, 7 tests; header and account menu: `Unable to find role="dialog" and name "Keyboard shortcuts"`, `expected [] to deeply equal [ 'Ctrl', 'S' ]`, `Unable to find role="tooltip"` |
| a73b6ba1 | `toolbarShortcutStrings is not implemented on mac`, 3 tests plus the options test |
| platform test | `AssertionError: expected 'other' to be 'mac'` (navigator.platform now decides, as in the editor; Playwright's Chromium reports Windows in `userAgentData` and MacIntel in `navigator.platform`) |

Pins (green when they landed): none.

## How to run

```
pnpm --filter @superdoc-collab/web exec vitest run src/features/shortcuts
pnpm test:e2e e2e/shortcuts.spec.ts
```

## Hypotheses for the walk

- Typing a word, Mod+B, Mod+I, Mod+U, Mod+E, Mod+Alt+2, Mod+M each apply; Mod+Z undoes.
- Mod+/ then "head" shows the heading rows; Escape closes and focus returns to where it was.
- Hover Find and Download: the tooltip shows the hint. Open the download menu: hints right-aligned.
- Reader: no Editing, Formatting or Paragraph group in the dialog, and Mod+E does nothing.
- 375 px: the dialog scrolls and the page does not scroll sideways.
- Attack: Mod+S on the documents home still saves the page; Mod+B held on a selection toggles once per press.
