# Test plan: Toolbar: ruler, document mode and theme

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/web/src/features/editor/superdoc-options.test.ts::the toolbar keeps the ruler and the document mode` — input: `TOOLBAR_EXCLUDED_ITEMS`; expected: contains neither `ruler` nor `document-mode`, still contains `measurement-unit` — evidence: test exists at red commit 8610fa11, green with 7cc9a9f8; 4 files / 32 tests passed
- [ ] Confirmed it fails for the right reason: the exclusion list still holds `ruler` and `document-mode` — not proven: red commit not re-run by the tester

## Unit

- [x] `editor-theme.test.ts` — input: `ocean`, `#aabbcc`, `sepia`, `#abc`, `null`; expected: Ocean, Custom with that accent, then an explicit invalid result for the last three — evidence: vitest on the 4 editor test files, 4 files / 32 tests passed (scripted run 2026-10-21)
- [x] `editor-theme.test.ts` — input: each preset; expected: a theme config whose `--sd-editor-accent` is `light-dark(<light>, <dark>)` with the spec's values — evidence: vitest on the 4 editor test files, 4 files / 32 tests passed (scripted run 2026-10-21)
- [x] `editor-theme.test.ts` — input: `#ffffff`, `#000000`; expected: text colour black, then white — evidence: vitest on the 4 editor test files, 4 files / 32 tests passed (scripted run 2026-10-21)
- [x] `use-editor-theme.test.tsx` — input: choose Ocean; expected: `sd-theme-editor` on `html`, storage holds `ocean` — evidence: vitest on the 4 editor test files, 4 files / 32 tests passed (scripted run 2026-10-21)
- [x] `use-editor-theme.test.tsx` — input: choose Default after Ocean; expected: class removed, storage holds `default` — evidence: vitest on the 4 editor test files, 4 files / 32 tests passed (scripted run 2026-10-21)
- [x] `use-editor-theme.test.tsx` — input: stored `sepia`; expected: Default, key removed, no class — evidence: vitest on the 4 editor test files, 4 files / 32 tests passed (scripted run 2026-10-21)
- [x] `use-editor-theme.test.tsx` — input: `localStorage.getItem` throws; expected: Default, no throw — evidence: vitest on the 4 editor test files, 4 files / 32 tests passed (scripted run 2026-10-21)
- [x] `use-editor-theme.test.tsx` — input: another tab writes `forest`; expected: the hook reports Forest — evidence: vitest on the 4 editor test files, 4 files / 32 tests passed (scripted run 2026-10-21)
- [x] `use-editor-theme.test.tsx` — input: unmount; expected: class removed — evidence: vitest on the 4 editor test files, 4 files / 32 tests passed (scripted run 2026-10-21)
- [x] `editor-toolbar-row.test.tsx` — input: role Reader; expected: no Theme button — evidence: vitest on the 4 editor test files, 4 files / 32 tests passed (scripted run 2026-10-21)
- [x] `editor-toolbar-row.test.tsx` — input: role Editor, open Theme; expected: five presets and an accent input — evidence: vitest on the 4 editor test files, 4 files / 32 tests passed (scripted run 2026-10-21)

## E2E (Playwright specs)

- [ ] `e2e/toolbar-ruler-mode-theme.spec.ts::ruler, mode and theme` — steps: open a document as Owner, toggle the ruler, pick Suggesting then Viewing, pick Ocean, reload; expected: ruler shows, the document is editable in Suggesting and not in Viewing, Ocean is still applied after the reload — not ticked: fails as committed (selector defect, see Edge cases); passes with the two fixes in a scratch copy

## Prove it for real — Playwright MCP

- [x] Happy path: Owner opens a document; expected: ruler button, mode dropdown and Theme button visible in the toolbar row — evidence: scripted walk, ruler=1 mode=1 Theme=1 in the row; .pr-media/toolbar-ruler-mode-theme/toolbar-ruler-1280-light.png
- [x] Reader sees none of the three: open as Reader; expected: no toolbar row — evidence: scripted walk, read-link member with stored ocean: toolbar row count 0, Theme button 0, html class empty; .pr-media/toolbar-ruler-mode-theme/reader-375.png
- [x] Ruler: click the ruler button; expected: ruler appears, click again, it disappears; reload, it is off — evidence: scripted walk, ruler host count 0 -> shown -> 0 -> shown, 0 after reload
- [x] ⌘⌥T flips the dropdown: press the shortcut in Editing; expected: dropdown reads Suggesting, press again, Editing — evidence: scripted walk, icon and sr-only label go Editing/Suggesting/Editing/Suggesting/Editing over 4 presses (and the dropdown label via toContainText)
- [x] Dropdown Viewing makes the document non-editable: pick Viewing, press a key in the page; expected: text unchanged — evidence: scripted walk, Viewing sets the editor textarea readOnly=true, typing ZZZ left "Budget: the plan costs 10." unchanged
- [x] Preset survives reload: pick Sunset, reload; expected: Sunset still marked and the toolbar action colour unchanged — evidence: scripted walk, Sunset rgb(194, 65, 12) before and after reload, html class sd-theme-editor, Sunset marked
- [x] Corrupt stored value falls back to Default: set `superdoc-collab.editor-theme` to `sepia`, reload; expected: Default marked, key removed — evidence: scripted walk, stored sepia: Default checked, key null, html class empty
- [x] Accent picker updates live: change the colour input; expected: the toolbar action colour follows without closing the popover — evidence: scripted walk, #336699 gives rgb(51, 102, 153) and the colour input stays visible (popover open)
- [x] Light and dark: toggle the app theme with Ocean chosen; expected: accent readable on both — evidence: scripted walk, Ocean rgb(3, 105, 161) light, rgb(56, 189, 248) dark; Sunset rgb(194, 65, 12) / rgb(251, 146, 60)
- [x] Console and network clean: zero console errors, zero failed requests — evidence: scripted walk, 0 console errors, 0 responses >= 400, 0 failed requests
- [x] Desktop width: 1280 px; expected: all three controls in one row — evidence: scripted walk, ruler, mode and Theme in one row at 1280, scrollWidth 1280; .pr-media/toolbar-ruler-mode-theme/toolbar-ruler-1280-light.png
- [x] Narrow width: 375 px; expected: the toolbar overflows into SuperDoc's overflow menu, the Theme button stays reachable, the page does not scroll sideways — evidence: scripted walk at 375, scrollWidth 375, Theme button at x=177 and mode and ruler still in the row; .pr-media/toolbar-ruler-mode-theme/theme-popover-375-dark.png
- [x] Screenshots at `.pr-media/toolbar-ruler-mode-theme/`; video at the same folder — evidence: 1280 and 375, light and dark, in .pr-media/toolbar-ruler-mode-theme/ (toolbar-ruler, mode-dropdown, theme-popover, preset-ocean, preset-sunset, reader-375); inspected: legible, no overflow; NO video (scripted walk)

## Edge cases found during execution

- [ ] DEFECT in the committed E2E spec: it fails (timeout) at `chooseMode` because `[role='option']` matches nothing; SuperDoc's options are `[data-item='btn-documentMode-option']` with `role=menuitem`, rendered outside the toolbar row. Also `toHaveCount(0)` on `textarea` in Viewing is wrong: the textarea stays and becomes `readOnly`. With both fixed the spec passes (1 passed, scratch copy, port 3470). The developer must fix the spec.
- [x] At 375 the ruler, mode dropdown and Theme button stay in the row; only Font and the rest fold into the overflow menu — evidence: scripted walk
- [x] Observation: the accent changes `--sd-ui-action` as promised, but the Summarize button and the share button keep `--primary`; the visible effect is limited to SuperDoc's toolbar action states — evidence: preset-sunset-1280-dark.png

Original note: empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

- [x] Claim 1: Default is today's look exactly — attack: compare computed `--sd-ui-action` with and without the lane; result: with no stored value html class empty and --sd-ui-action = oklch(0.55 0.22 263) = --primary
- [ ] Claim 2: the dropdown follows ⌘⌥T — attack: alternate shortcut and dropdown ten times; result: 4 presses alternate correctly in the explore run; the ten-press label read in the main walk was invalid (innerText hits the sr-only text), not re-run
- [x] Claim 3: a Reader never gets the class or the button — attack: open a read-only link with a stored preset; result: Reader with stored ocean on a read link: no row, no Theme button, html class empty

## Coverage honesty

What is not tested and why.

- Browsers without `light-dark()` — the action colour falls back to the app primary; accepted.
