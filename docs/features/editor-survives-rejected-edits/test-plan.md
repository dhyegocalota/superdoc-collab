# Test plan: The editor survives a rejected edit

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/editor/superdoc-exceptions.test.ts::a rejected keyboard edit is recoverable` — input: `{ code: 'edit-rejected' }`; expected: `true`
- [ ] Confirmed it fails for the right reason at 7e6cc14: `Error: isRecoverableException is not implemented`

## Unit

- [ ] `superdoc-exceptions.test.ts::any other code is fatal` — input: `{ code: 'collaboration-access-denied' }`; expected: `false`
- [ ] `superdoc-exceptions.test.ts::a payload without a code is fatal` — input: `{ error }`; expected: `false`
- [ ] `pnpm --filter @superdoc-collab/web test:unit`; expected: green

## E2E (Playwright specs)

- [ ] `e2e/collaboration.spec.ts::an edit rejected under a concurrent delete does not stop the editor` — steps as the spec; expected: no fatal message, the status line visible, cleared on Ana's click, both texts converge with Ana's recovery text
- [ ] Red on main: the same spec against main shows `The editor stopped working` (the lead's scratch run at ee68d64: 63 rejections, fatal message shown); green on this branch

## Prove it for real — Playwright MCP

- [ ] Two authors, Ana types slowly at the start of her paragraph while Bruno selects all and deletes; expected: Ana sees the status line, not the fatal message; the editor still receives Bruno's text
- [ ] Ana clicks Bruno's text and types; expected: the status line disappears on the click, her text appears on both sides
- [ ] A fatal failure still shows the fatal message: cut the socket is not fatal (it reconnects); instead open the document as a reader and confirm nothing regressed (typing changes nothing, no status line)
- [ ] Console and network clean, other than the expected 401 on sign-out
- [ ] Narrow width (375): the status line wraps and stays readable
- [ ] Screenshots at `.pr-media/editor-survives-rejected-edits/`

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [ ] Claim 1: no other SuperDoc code is swallowed — attack: list every `code` SuperDoc can emit (`rg "code: '" node_modules/superdoc/dist/superdoc/src`) against the enum; result: <refuted | held>
- [ ] Claim 2: the status line clears only on a pointer down inside the editor — attack: press a key instead; result: <refuted | held>
- [ ] Claim 3: the E2E cannot pass vacuously — attack: revert the classifier in a scratch worktree and run the spec; result: <refuted | held>

## Coverage honesty

- The lost keystrokes (Yjs semantics) are not asserted; the spec asserts recovery, not preservation.
