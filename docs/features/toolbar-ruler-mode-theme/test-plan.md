# Test plan: Toolbar: ruler, document mode and theme

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/editor/superdoc-options.test.ts::the toolbar keeps the ruler and the document mode` — input: `TOOLBAR_EXCLUDED_ITEMS`; expected: contains neither `ruler` nor `document-mode`, still contains `measurement-unit`
- [ ] Confirmed it fails for the right reason: the exclusion list still holds `ruler` and `document-mode`

## Unit

- [ ] `editor-theme.test.ts` — input: `ocean`, `#aabbcc`, `sepia`, `#abc`, `null`; expected: Ocean, Custom with that accent, then an explicit invalid result for the last three
- [ ] `editor-theme.test.ts` — input: each preset; expected: a theme config whose `--sd-editor-accent` is `light-dark(<light>, <dark>)` with the spec's values
- [ ] `editor-theme.test.ts` — input: `#ffffff`, `#000000`; expected: text colour black, then white
- [ ] `use-editor-theme.test.tsx` — input: choose Ocean; expected: `sd-theme-editor` on `html`, storage holds `ocean`
- [ ] `use-editor-theme.test.tsx` — input: choose Default after Ocean; expected: class removed, storage holds `default`
- [ ] `use-editor-theme.test.tsx` — input: stored `sepia`; expected: Default, key removed, no class
- [ ] `use-editor-theme.test.tsx` — input: `localStorage.getItem` throws; expected: Default, no throw
- [ ] `use-editor-theme.test.tsx` — input: another tab writes `forest`; expected: the hook reports Forest
- [ ] `use-editor-theme.test.tsx` — input: unmount; expected: class removed
- [ ] `editor-toolbar-row.test.tsx` — input: role Reader; expected: no Theme button
- [ ] `editor-toolbar-row.test.tsx` — input: role Editor, open Theme; expected: five presets and an accent input

## E2E (Playwright specs)

- [ ] `e2e/toolbar-ruler-mode-theme.spec.ts::ruler, mode and theme` — steps: open a document as Owner, toggle the ruler, pick Suggesting then Viewing, pick Ocean, reload; expected: ruler shows, the document is editable in Suggesting and not in Viewing, Ocean is still applied after the reload

## Prove it for real — Playwright MCP

- [ ] Happy path: Owner opens a document; expected: ruler button, mode dropdown and Theme button visible in the toolbar row
- [ ] Reader sees none of the three: open as Reader; expected: no toolbar row
- [ ] Ruler: click the ruler button; expected: ruler appears, click again, it disappears; reload, it is off
- [ ] ⌘⌥T flips the dropdown: press the shortcut in Editing; expected: dropdown reads Suggesting, press again, Editing
- [ ] Dropdown Viewing makes the document non-editable: pick Viewing, press a key in the page; expected: text unchanged
- [ ] Preset survives reload: pick Sunset, reload; expected: Sunset still marked and the toolbar action colour unchanged
- [ ] Corrupt stored value falls back to Default: set `superdoc-collab.editor-theme` to `sepia`, reload; expected: Default marked, key removed
- [ ] Accent picker updates live: change the colour input; expected: the toolbar action colour follows without closing the popover
- [ ] Light and dark: toggle the app theme with Ocean chosen; expected: accent readable on both
- [ ] Console and network clean: zero console errors, zero failed requests
- [ ] Desktop width: 1280 px; expected: all three controls in one row
- [ ] Narrow width: 375 px; expected: the toolbar overflows into SuperDoc's overflow menu, the Theme button stays reachable, the page does not scroll sideways
- [ ] Screenshots at `.pr-media/toolbar-ruler-mode-theme/`; video at the same folder

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

- [ ] Claim 1: Default is today's look exactly — attack: compare computed `--sd-ui-action` with and without the lane; result:
- [ ] Claim 2: the dropdown follows ⌘⌥T — attack: alternate shortcut and dropdown ten times; result:
- [ ] Claim 3: a Reader never gets the class or the button — attack: open a read-only link with a stored preset; result:

## Coverage honesty

What is not tested and why.

- Browsers without `light-dark()` — the action colour falls back to the app primary; accepted.
