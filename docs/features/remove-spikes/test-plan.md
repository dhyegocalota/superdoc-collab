# Test plan: Remove spikes

Behaviour-preserving removal of code outside the workspace: the reviewer and `pnpm verify` are the proof (HARNESS §5).

- [ ] `delivery-docs.test.ts` "no spike or proof-of-concept code is committed at the root" — input: `spikes/` present; expected: fails naming `spikes`
- [ ] Same test after the removal — expected: passes
- [ ] Every link to the moved file resolves — expected: `rg -n "spike-sdk-room-join"` names only paths that exist relative to each linking file
- [ ] `pnpm verify` on the branch — expected: green
- [x] (owner, 2026-10-17: nothing temporary reaches main) `delivery-docs.test.ts` "the root holds only the entries the layout names" and "no path carries a folder an agent leaves behind for temporary work" — pins, 24 passed; mutation: an untracked `tmp/notes.txt`, `agent-notes.md` at the root and `docs/features/x/spike/run.ts` → both tests failed naming them, then removed
