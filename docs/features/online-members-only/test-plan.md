# Test plan: Only online members in the top bar

- [x] `vitest run src/features/editor/members.test.tsx` before the change — expected: 3 failed (evidence below)
- [x] same file after the change — expected: 21 passed (evidence: 21 passed)
- [x] `pnpm typecheck` — expected: clean (evidence: web, server and e2e clean)
- [x] `pnpm test:e2e e2e/collaboration.spec.ts` — expected: the new members test passes (evidence: 4 passed, new test 5.5 s)
- [ ] `editor-header.test.tsx` 'members announce their presence…' — expected: fails until the lead drops its offline Bruno assertion

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
