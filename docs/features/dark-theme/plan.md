# Plan: Dark theme: every SuperDoc surface follows the tokens

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `apps/web/src/styles/globals.css` (`html:root`, `html:root.dark`, `.dark`) and its test.
**Assumptions (decided, owner can override):**
- Mapping on `html:root` changes the light theme too (SuperDoc greys become our tokens); ADR 0009 wants the token switch and the light tokens are close to SuperDoc's defaults.
- The paper stays white; the caret colour is a fixed dark token in both themes.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/styles/globals.css`, `globals.test.ts`, `apps/web/src/features/editor/waiting-for-document.tsx` and its test, `e2e/dark-theme.spec.ts` (new), `docs/features/README.md` (this fix's row) | `developer-dt` |
| G2 | the audit's extra surfaces (after `design.md`), same files plus any `.tsx` with a literal colour the audit names | `developer-dt` |

## Sequencing

G1 now; G2 when the designer's audit lands.

## Steps

### G1

- [x] **Step 1:** red `globals.test.ts` (new map entries, tokens, `color-scheme`, caret rule, active-item contrast); commit alone. — e74870e
- [x] **Step 2:** the CSS; green. — 75bc231
- [x] **Step 3:** `bg-paper` on the waiting page skeleton, red test first. — ccefd0b red, 376db86 green
- [x] **Step 4:** E2E `dark-theme.spec.ts`; `pnpm typecheck`; README row; tester briefing. — 251c7cc, 09df876, tester-briefing.md

### G2

- [ ] **Step 5:** the audit's extra defects, each with its test pin.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | a mapped variable name does not exist in SuperDoc 2.23.0 | the grep in the dist finds nothing | drop that entry |
| 2 | the light theme's active item becomes too faint | the contrast test for `--foreground` on `--active` fails in light | raise `--active` lightness contrast |
| 2 | the caret selector misses the editable element | the E2E computed `caret-color` assertion fails | widen the selector to the ProseMirror root inside the page |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** screenshots in dark and light at 1280 and 375 and the video.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
