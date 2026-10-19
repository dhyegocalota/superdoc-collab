# Test plan: Word-like keyboard shortcuts

## The failing test first

- [x] `shortcuts.test.ts::every command entry names a catalogued SuperDoc command` — expected: the registry's command ids are all in the installed catalog (`BUILT_IN_COMMAND_IDS` holds only 16 ids, so the test reads the ids of `COMMAND_CATALOG` from the installed declaration file)
- [x] Confirmed it fails for the right reason (commit bce34167, stub registry empty): `AssertionError: expected [] to deeply equal [ 'align-center', …(27) ]` in the registry test, and `expected 0 to be greater than 0` for the command ids

## Unit

- [ ] registry: both platforms per id; no duplicate combos per platform; groups cover every id
- [ ] platform helper: Mac from `navigator.platform` and from `userAgentData`; other otherwise
- [ ] `use-shortcuts`: resolves per platform; ignores `defaultPrevented`; skips text fields; `preventDefault` only when handled; reader inert for formatting
- [ ] `ShortcutHint`: ⌘⇧L on Mac, Ctrl+Shift+L elsewhere
- [ ] `ShortcutsDialog`: groups, search filter, opened by ⌘/, `?`, account menu, More actions; reader groups only
- [ ] hints present in the download menu items, Find, More actions, Share, title Save and Cancel tooltips

## E2E

- [ ] `e2e/shortcuts.spec.ts`: ⌘B bolds the typed word (toolbar bold active); ⌘⌥1 makes a heading; ⌘S downloads the DOCX; ⌘/ opens the modal and typing filters it; the download menu shows ⌘S and ⌘P hints

## Prove it for real — Playwright MCP

- [ ] New document: type, ⌘B, ⌘I, ⌘U, ⌘E, ⌘⇧L, ⌘⌥2, ⌘M; each visibly applies; ⌘Z undoes
- [ ] ⌘/ then search "head" shows the heading rows; Esc closes; account menu → Keyboard shortcuts opens it
- [ ] Hover Download, Find, More actions, Share: the tooltip shows the hint; open the download menu: hints right-aligned
- [ ] Reader: no formatting rows, keys inert
- [ ] 375 px: the modal scrolls, no horizontal scroll

## Adversarial review

- [ ] Claim 1: no key is double-applied — attack: hold ⌘B on a selection and count toggles; result:
- [ ] Claim 2: browser keys outside the document page are untouched — attack: ⌘S on the documents home saves the page; result:
- [ ] Claim 3: every hint matches the registry — attack: diff the rendered hints against the registry; result:

## Coverage honesty

- Windows and Linux key labels are exercised only by unit tests of the platform helper.
