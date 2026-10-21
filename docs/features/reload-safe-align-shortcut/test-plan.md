# Test plan: Reload-safe align shortcut

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/web/src/features/shortcuts/shortcuts.test.ts::align right is Mod+Alt+R and no key takes the browser reload` — input: the registry; expected: AlignRight is `[Mod, Alt]` + `KeyR` on both platforms and no definition has Mod and `KeyR` without Alt — evidence: red at 1881761b `expected [ 'mod' ] to deeply equal [ 'alt', 'mod' ]`, green at 2636dce4
- [x] Confirmed it fails for the right reason: the failure text of the red run is recorded in the tester briefing — evidence: tester-briefing.md records the red text; the two use-shortcuts tests were not seen red (queued behind the lock), so they count as pins

## Unit

- [x] `shortcuts.test.ts::align right is Mod+Alt+R and no key takes the browser reload` — as above — evidence: `pnpm verify` 8 gates green at 657521e3, e2e 173 passed (scratchpad verify-lane1.log)
- [x] `use-shortcuts.test.ts::Ctrl+R and Ctrl+Shift+R are never consumed` — input: keydown `KeyR` with ctrl, then with ctrl and shift, on the document body with an active editor; expected: `defaultPrevented` false for both and no command executed — evidence: `pnpm verify` 8 gates green at 657521e3, e2e 173 passed (scratchpad verify-lane1.log); Mod+Shift+R red at 5a38c5d1, green at 657521e3
- [x] `use-shortcuts.test.ts` existing Ctrl+L test — expected: unchanged, still green — evidence: `pnpm verify` 8 gates green at 657521e3, e2e 173 passed (scratchpad verify-lane1.log)

## E2E (Playwright specs)

- [x] `e2e/shortcuts.spec.ts::Mod+Alt+R aligns right and the reload keys are left alone` — steps: new document, type a word, Mod+R, Mod+Shift+R, then Mod+Alt+R; expected: the two reload keydowns are not `defaultPrevented` and alignment stays left, then the line's `text-align` is `right` — evidence: `pnpm verify` 8 gates green at 657521e3, e2e 173 passed (scratchpad verify-lane1.log); this spec caught SuperDoc taking Mod+Shift+R before 657521e3

## Prove it for real — Playwright MCP

- [ ] Happy path: open a document, caret in the editor, press Mod+Alt+R; expected: paragraph right-aligned; the shortcuts dialog (Mod+/) lists Align right as ⌘⌥R / Ctrl+Alt+R
- [ ] Reload: with the caret in the editor press Mod+R; expected: the page reloads and the document reopens
- [ ] Reload hard: press Mod+Shift+R; expected: the page reloads
- [ ] Documents home: press Mod+R; expected: the page reloads (unchanged)
- [ ] Console and network clean: zero console errors, zero failed requests

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

- [x] Claim 1: SuperDoc never prevents default on Mod+R — attack: press it with a selection, in a table cell and in a list; result: refuted for Mod+Shift+R (SuperDoc's docx-engine keydown handler aligned right and prevented default); fixed by the capture-phase stop in use-shortcuts.ts at 657521e3; plain Mod+R was never taken — evidence: e2e green at 657521e3
- [x] Claim 2: no other surface shows ⌘R for align right — attack: grep docs, tooltips and the context menu; result: held; only the historical word-like-shortcuts test plan and briefing keep ⌘R as evidence — evidence: reviewer grep
- [ ] Claim 3: Mod+Alt+R does not collide with a browser or OS key — attack: press it in Chrome and Safari; result: 

## Coverage honesty

- The Playwright MCP walk was cut by the owner's lean process on 2026-10-21, and Playwright's synthetic keys never trigger the browser's own reload, so the real reload is proven only indirectly: the keydown reaches the browser without `defaultPrevented`.
- Claim 3 (Safari and OS collisions) is not attacked.

- Safari and Firefox reload behaviour is not exercised; Chromium only.
