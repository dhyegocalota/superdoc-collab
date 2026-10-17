# Test plan: The editor survives a rejected edit

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/web/src/features/editor/superdoc-exceptions.test.ts::a rejected keyboard edit is recoverable` — input: `{ code: 'edit-rejected' }`; expected: `true` — evidence: vitest at 8ad7b75, 3/3 pass in superdoc-exceptions.test.ts; red at 7e6cc14 failed with `isRecoverableException is not implemented`
- [x] Confirmed it fails for the right reason at 7e6cc14: `Error: isRecoverableException is not implemented` — evidence: throwaway worktree at 7e6cc14, all 3 tests failed with `Error: isRecoverableException is not implemented` at superdoc-exceptions.ts:6:9; worktree removed

## Unit

- [x] `superdoc-exceptions.test.ts::any other code is fatal` — input: `{ code: 'collaboration-access-denied' }`; expected: `false` — evidence: 8ad7b75, green (superdoc-exceptions.test.ts 3/3)
- [x] `superdoc-exceptions.test.ts::a payload without a code is fatal` — input: `{ error }`; expected: `false` — evidence: 8ad7b75, green (superdoc-exceptions.test.ts 3/3)
- [x] `pnpm --filter @superdoc-collab/web test:unit`; expected: green — evidence: 8ad7b75, 342/342 passed, 49 files, on two consecutive runs; typecheck green (server, web, e2e). One earlier run showed 1 failed of 342 that did not reproduce in three later runs (unidentified, see Edge cases)

## E2E (Playwright specs)

- [x] `e2e/collaboration.spec.ts::an edit rejected under a concurrent delete does not stop the editor` — steps as the spec; expected: no fatal message, the status line visible, cleared on Ana's click, both texts converge with Ana's recovery text — evidence: lead's run at 8ad7b75, `pnpm exec playwright test e2e/collaboration.spec.ts` 3 passed incl. `an edit rejected under a concurrent delete does not stop the editor (17.9s)`, log /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/tasks/btbzvd218.output; not rerun by the tester (port 3100 reserved)
- [x] Red for this spec: with `isRecoverableException` forced to false (scratch mutation, restored), the spec fails on the rejected-edit status probe (`getByRole('status')… element(s) not found`, the fatal message renders instead); with the classifier restored, 3/3 pass in `e2e/collaboration.spec.ts` at 7b52f0f — evidence: log `/private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/tasks/baa2k2syi.output`. The spec itself landed after the fix (8ad7b75), so its own commit is a pin; this mutation is its red proof

## Prove it for real — Playwright MCP

- [x] Two authors, Ana types slowly at the start of her paragraph while Bruno selects all and deletes; expected: Ana sees the status line, not the fatal message; the editor still receives Bruno's text — evidence: scripted walk (Playwright MCP second server unavailable), stack at 127.0.0.1:3200: status line visible, fatal message count 0, Bruno's text 'Bruno starts over.' reached Ana; .pr-media/editor-survives-rejected-edits/02-ana-status-line-1280.png, 03-bruno-after-delete-1280.png, 04-ana-receives-bruno-text-1280.png
- [x] Ana clicks Bruno's text and types; expected: the status line disappears on the click, her text appears on both sides — evidence: scripted walk: status count 0 right after the click, both editors read 'Bruno starts over. Ana is back.' (marker once); .pr-media/editor-survives-rejected-edits/05-ana-recovered-1280.png, 06-bruno-recovered-1280.png
- [x] A fatal failure still shows the fatal message: cut the socket is not fatal (it reconnects); instead open the document as a reader and confirm nothing regressed (typing changes nothing, no status line) — evidence: scripted walk: reader (third demo user, Read share link) typed 'reader typing', text unchanged after 1.5s, no status line, no fatal message; .pr-media/editor-survives-rejected-edits/09-reader-1280.png. A real fatal exception was not provoked (known gap)
- [x] Console and network clean, other than the expected 401 on sign-out — evidence: scripted walk on Ana's page across the whole flow: 0 console errors, 0 responses with status >= 400; sign-out not exercised so the expected 401 did not occur
- [x] Narrow width (375): the status line wraps and stays readable — evidence: scripted walk: status line wraps to two lines, box x=0 width=375 height=40, no horizontal overflow; .pr-media/editor-survives-rejected-edits/08-ana-status-line-375.png
- [x] Screenshots at `.pr-media/editor-survives-rejected-edits/` — evidence: .pr-media/editor-survives-rejected-edits/ holds 9 files (01 to 09), 1280 and 375

## Review follow-ups

- [x] The status no longer moves the page mid-gesture: it clears on click, after pointer up placed the caret — evidence: `document-page.test.tsx::a rejected edit shows a status that a key keeps and a click on the editor clears, with no failure`, red at 9429739 (line 214, the status vanished on pointer down), green at 7b52f0f; editor unit 61/61
- [x] The status resets when the editor is rebuilt (effect cleanup) — evidence: 7b52f0f

## Edge cases found during execution

- Unit run flake: the first `pnpm --filter @superdoc-collab/web test:unit` printed `1 failed | 48 passed (49)` (341 of 342 tests); the failing test name was not captured, and three later runs were 342/342. Outcome: not reproduced, unattributed; not in the editor feature files.
- Rejection when Bruno deletes everything and Ana's typing is lost: the document ends empty until Bruno types again; a reader joining an empty document never converges (`shareAndAccept` needs non-empty text). Outcome: by design of the helper, not a defect.
- Second rejection cycle at 375 in the same session after recovery: status line shown again, fatal message count 0. Outcome: held.
- Status line is small muted text at the top of the editor, no icon; easy to miss next to the empty page. Outcome: observation for the owner, not a defect.

## Adversarial review

- [x] Claim 1: no other SuperDoc code is swallowed — attack: every code in SuperDoc's exception union; result: **held** — evidence: reviewer: collaboration codes, `password-required`, `author-required` and uncoded diagnostics all return false; the unit test now runs `test.each` over those five codes plus the uncoded payload
- [x] Claim 2: the status line clears only on a click inside the editor — attack: press a key, then pointer down; result: **held** — evidence: the component test keeps the status after keyDown and after pointerDown, and clears it on click
- [x] Claim 3: the E2E cannot pass vacuously — attack: classifier forced to false; result: **held** — evidence: red on the status probe, log `/private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/tasks/baa2k2syi.output`

## Coverage honesty

- The lost keystrokes (Yjs semantics) are not asserted; the spec asserts recovery, not preservation.
