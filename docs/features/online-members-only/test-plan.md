# Test plan: Only online members in the top bar

- [x] `vitest run src/features/editor/members.test.tsx` before the change — expected: 3 failed (evidence below)
- [x] same file after the change — expected: 21 passed (evidence: 21 passed)
- [x] `pnpm typecheck` — expected: clean (evidence: web, server and e2e clean)
- [x] `pnpm test:e2e e2e/collaboration.spec.ts` — expected: the new members test passes (evidence: 4 passed, new test 5.5 s)
- [ ] `editor-header.test.tsx` 'members announce their presence…' — expected: fails until the lead drops its offline Bruno assertion — BLOCKED: unit test belongs to the lead's gate

Red run, as printed:

```
FAIL members.test.tsx > offline members are not in the row and online ones are
  expected document not to contain element, found <button aria-label="Clara" …>
FAIL members.test.tsx > the overflow count ignores offline members
  expected document not to contain element, found <button aria-label="5 more people" …> +5
FAIL members.test.tsx > the row is a group whose label names the online count
  Error: onlineMembersLabel is not implemented for 3
Tests  3 failed | 18 passed (21)
```

## Edge cases found during execution

- Bruno opens the document: Ana's top bar group goes from "1 online" to "2 online" (Ana, online; Bruno, online) in 272 ms of polling; Bruno leaves (page closed): back to "1 online" in under 30 ms of the next check (below the poll resolution); screenshots .pr-media/testing/online-members-only-two-online-1280.png and online-members-only-one-online-1280.png
- Share dialog People with access still lists Bruno (Can edit) while he is away, as the known-gap list expects (the dialog is not an online list)
- Bruno leaving by navigating to /documents (caret present) and by closing the page both removed the avatar
- The current user's avatar shows before the members answer ("This is you" in the first snapshot)
