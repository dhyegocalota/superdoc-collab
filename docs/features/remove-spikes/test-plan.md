# Test plan: Remove spikes

Behaviour-preserving removal of code outside the workspace: the reviewer and `pnpm verify` are the proof (HARNESS §5).

- [ ] `delivery-docs.test.ts` "no spike or proof-of-concept code is committed at the root" — input: `spikes/` present; expected: fails naming `spikes`
- [ ] Same test after the removal — expected: passes
- [ ] Every Markdown link in the repository resolves — expected: `delivery-docs.test.ts` green
- [ ] `pnpm verify` on the branch — expected: green
