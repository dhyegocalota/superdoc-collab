# Test plan: E2E on CI only when it can catch something

- [x] `git grep -n -i "never merge on the local"` outside `docs/features` and `docs/learnings` — expected: no match. — evidence: at commit 1d8615f, `git grep -n -i "never merge on the local" -- . ':!docs/features' ':!docs/learnings'` printed nothing and exited `1`.
- [x] HARNESS §7 step 8, the `open-pr` Merge section and `e2e/README.md` name the same path list and agree with ADR 0018 line 37 — expected: no contradiction. — evidence: `.claude/HARNESS.md:97` and `.agents/skills/open-pr/SKILL.md:37` both list `apps/` or `libs/`, E2E specs or helpers, `playwright.config.ts`, dependencies, the build or runtime configuration, and both exclude docs, agent tooling and repository-shape tests. `docs/adr/0018-fan-out-ci-and-prebuild-the-projection-worker.md:37` says a PR can merge without the E2E suite on CI and the gate moves to local `/verify` and the owner-requested dispatch. `e2e/README.md:13` names no path list; it defers to `HARNESS §7` (anchor resolved by the delivery-docs run below). No contradiction.
- [x] `delivery-docs.test.ts` — expected: all pass, including the `../.claude/HARNESS.md#7-ship` anchor in `e2e/README.md`. — evidence: `pnpm --filter @superdoc-history/server exec vitest run src/repository-shape/delivery-docs.test.ts` printed `Test Files  1 passed (1)`, `Tests  16 passed (16)`, exit `0`.
- [x] `pnpm format:check` — expected: clean. — evidence: `pnpm format:check` printed `All matched files use Prettier code style!`, exit `0`.

## Edge cases found during execution

- Input: `git grep -n -i -E "e2e.*(before|prior to|until).*merg|merg.*e2e|e2e\.yml"` across the repo outside `docs/features`, `docs/learnings` and ADR 0018. Expected: no file still mandates the CI E2E run before every merge. Outcome: pass. Only `HARNESS.md:97`, `open-pr/SKILL.md:39` (owner-requested dispatch), `e2e/README.md:13` and `verify/SKILL.md:3` matched, all conditional or local. No defect.
