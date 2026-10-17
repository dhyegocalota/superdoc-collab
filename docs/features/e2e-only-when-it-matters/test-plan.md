# Test plan: E2E on CI only when it can catch something

- [ ] `git grep -n -i "never merge on the local"` outside `docs/features` and `docs/learnings` — expected: no match.
- [ ] HARNESS §7 step 8, the `open-pr` Merge section and `e2e/README.md` name the same path list and agree with ADR 0018 line 37 — expected: no contradiction.
- [ ] `delivery-docs.test.ts` — expected: all pass, including the `../.claude/HARNESS.md#7-ship` anchor in `e2e/README.md`.
- [ ] `pnpm format:check` — expected: clean.
