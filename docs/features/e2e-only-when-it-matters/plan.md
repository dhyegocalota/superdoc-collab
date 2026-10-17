# Plan: E2E on CI only when it can catch something

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `.claude/HARNESS.md` §7, `.agents/skills/open-pr/SKILL.md` → Merge, `e2e/README.md`.

## Steps

- [x] **Step 1:** rewrite HARNESS §7 step 8 and the `open-pr` Merge section with the "only when it can catch something" rule and its list of paths.
- [x] **Step 2:** align the dispatch sentence in `e2e/README.md`, linking HARNESS §7.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 1 | a product change merges without the CI E2E run | a regression that the local `/verify` missed reaches `main` | revert this PR's commit |

**Steps with no backout:** none.
