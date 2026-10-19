# Word-like keyboard shortcuts, a shortcuts modal and hints everywhere

**Status:** Approved
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner's request, translated: "I want shortcuts, especially for text editing, with a Microsoft Word look and feel, plus a modal and tooltips of shortcuts everywhere, including dropdowns")
**ADRs:** none new
**Not changing:** SuperDoc's own bindings where they exist (they are listed, not re-implemented), the toolbar's item set, the Escape sentinel of the editing surface

## Problem

People who come from Word reach for its shortcuts; some work because SuperDoc binds them, some do nothing, and nothing in the app tells them which is which. Buttons and menu items carry no shortcut hint, and there is no place to see them all.

## Design (recommended; the owner can override the key choices)

- **One registry.** `apps/web/src/features/shortcuts/shortcuts.ts` declares every shortcut once: `ShortcutId` enum, group (`Editing`, `Formatting`, `Paragraph`, `Navigation`, `Document`, `App`), the keys per platform (`ShortcutKeys` with `mac` and `other`, modifiers as an enum: `Mod`, `Shift`, `Alt`), the label, and the action kind: `native` (SuperDoc handles it; listed only, and the spike records which these are), `command` (a SuperDoc command id from its public catalog, executed through the instance), or `app` (an app action such as download, find, print as PDF, open the modal). The registry is the single source for the handler, the tooltips, the menus and the modal.
- **Word's keys** (Mac shows ⌘ ⇧ ⌥, others Ctrl Shift Alt): bold ⌘B, italic ⌘I, underline ⌘U, undo ⌘Z, redo ⌘Y and ⌘⇧Z, align left ⌘L, centre ⌘E, right ⌘R, justify ⌘J, bullets ⌘⇧L, numbering ⌘⇧N is Word's "normal style" so numbering stays on the toolbar, heading 1/2/3 ⌘⌥1/2/3, normal text ⌘⇧N, indent ⌘M, outdent ⌘⇧M, subscript ⌘=, superscript ⌘⇧=, grow font ⌘⇧>, shrink font ⌘⇧<, link ⌘K, find ⌘F, save as DOCX ⌘S, print to PDF ⌘P, keyboard shortcuts ⌘/ and `?` outside a field, leave the editing surface Esc (exists). Browser-reserved keys that the app takes (⌘S, ⌘P, ⌘K, ⌘/) call `preventDefault` only when the document page is open and the key is handled; everything else is left to the browser.
- **The handler.** `useShortcuts` in the document page listens on `keydown` at the document level, ignores events SuperDoc already consumed (`defaultPrevented`) and events in text fields other than the editing surface (`isTypingInField` from `lib/keyboard.ts`), resolves the registry entry by platform, and runs the action; `command` actions go through the SuperDoc instance's public command surface (the spike names the call), `native` actions are never intercepted.
- **Hints.** `ShortcutHint` renders the keys as `<kbd>` pills (muted, monospace, platform-aware) and is placed in every tooltip of the app's own buttons (Find, Download, More actions, Share, Summarize, the title Save and Cancel) and right-aligned in every dropdown and menu item that has a shortcut (Download DOCX ⌘S, Download PDF ⌘P, Find ⌘F, Keyboard shortcuts ⌘/). SuperDoc's own toolbar tooltips: the spike checks whether the toolbar config accepts tooltip text per item; if it does, the hint is appended there too; if not, the modal is the place and the spec says so.
- **The modal.** `ShortcutsDialog` (Radix Dialog, `apps/web/src/features/shortcuts/shortcuts-dialog.tsx`): the groups as sections, each row label plus `ShortcutHint`, a search box that filters rows, platform note at the top ("Showing Mac keys", with a toggle), opened by ⌘/ and `?`, by a `Keyboard shortcuts` item in the account menu (icon Keyboard), and by a `Shortcuts` row at the end of the More actions menu. Readers see navigation, document and app groups only.
- **Copy** in `shortcuts-copy.ts`; platform detection in `lib/platform.ts` (`navigator.platform` and `userAgentData`, tested both ways).

### Failure handling

| Case | Behaviour |
|------|-----------|
| A command id missing from SuperDoc's catalog at runtime | the entry is listed as unavailable in the modal (muted, "not available in this document") and the key does nothing |
| The editor not ready yet | editing shortcuts ignored; app shortcuts (⌘/, ⌘S) still work |
| Reader role | formatting and paragraph shortcuts hidden and inert |

## Test strategy summary

Unit: the registry (every id has both platforms, no duplicate key combos within a platform, every `command` entry names a catalogued command id, pinned against the installed catalog); the handler (platform resolution, `defaultPrevented` respected, text fields skipped, preventDefault only for handled keys, reader inert); `ShortcutHint` (Mac and other labels); the dialog (groups, search, open by key, by menu, by account menu; reader groups); each hint placement (tooltip and menu tests). E2E: bold through ⌘B then the toolbar reflects bold; heading through ⌘⌥1 changes the paragraph style; ⌘S downloads the DOCX; ⌘/ opens the modal and the search filters; the hints are visible in the download menu.
