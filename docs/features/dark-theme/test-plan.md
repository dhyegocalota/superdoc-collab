# Test plan: Dark theme: every SuperDoc surface follows the tokens

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/styles/globals.test.ts::the SuperDoc chrome map covers the active, hover, menu, dropdown, tooltip and text variables` — input: the `html:root` block; expected: every entry of the extended `SUPERDOC_VARIABLES` map present with its token
- [ ] Confirmed it fails for the right reason: the missing entries are listed by the equality diff

## Unit

- [ ] `globals.test.ts::--paper-foreground is oklch(0.145 0 0) in :root and .dark`
- [ ] `globals.test.ts::--active is lighter than the surface in light and darker-but-visible in dark` — expected: `oklch(0.92 0 0)` and `oklch(0.37 0 0)`
- [ ] `globals.test.ts::.dark sets color-scheme dark`
- [ ] `globals.test.ts::the caret rule targets the page's editable surface with --paper-foreground`
- [ ] `globals.test.ts::--foreground on --active reaches AA in both themes` — computed as the tracked-change test does
- [ ] `waiting-for-document.test.tsx`: the page skeleton uses `bg-paper`, not `bg-white`
- [ ] `pnpm --filter @superdoc-collab/web test:unit`; expected: green

## E2E (Playwright specs)

- [ ] `e2e/dark-theme.spec.ts::in dark mode the caret is dark on the paper, the font dropdown is readable and native controls follow the theme` — steps: set the dark preference, open a document, focus the editor, read computed `caret-color`; open the font-family dropdown, read its computed background and text colours; expected: caret `rgb(37, 37, 37)` (the oklch converted) or the paper-foreground value, dropdown background not `rgb(200, 208, 216)`, `color-scheme` dark on `<html>`
- [ ] `e2e/dark-theme.spec.ts::in light mode nothing regressed` — expected: the caret rule holds, the dropdown background equals the light `--active`/`--popover` values

## Prove it for real — Playwright MCP

- [ ] Dark, 1280: toolbar with an active button, font-family dropdown open, font-size dropdown, colour pickers, more menus; expected: readable text, token backgrounds, visible shadows; screenshots
- [ ] Dark: caret and text selection in the page; expected: the caret visible on white, selection readable
- [ ] Dark: find bar, share dialog, members list and a remote cursor label, the Edits panel (chart, card, top edits, legend), the version viewer and its banner, the documents list, admin, settings, connected apps, the waiting page skeleton; expected: no light-on-light or dark-on-dark text, no white boxes except the paper
- [ ] Dark, 375: the same surfaces at phone width
- [ ] Light, 1280 and 375: the same walk; expected: no regression, active items distinguishable
- [ ] Console and network clean
- [ ] Screenshots at `.pr-media/dark-theme/`; video at `.pr-media/dark-theme/walkthrough.mp4`

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

- [ ] Claim 1: every mapped variable exists in SuperDoc 2.23.0 — attack: grep each name in the dist css; result:
- [ ] Claim 2: the light theme did not get worse — attack: compare the active item and dropdowns before and after at 1280; result:
- [ ] Claim 3: the caret rule hits the real editable element — attack: inspect the built DOM; result:

## Coverage honesty

- SuperDoc surfaces the walk does not open (comments sidebar, track-changes dialogs) are covered only by the token map, not by a screenshot.
