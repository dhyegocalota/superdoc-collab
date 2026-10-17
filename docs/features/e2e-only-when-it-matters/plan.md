# Plan: E2E on CI only when it can catch something

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `.claude/HARNESS.md` §7, `.agents/skills/open-pr/SKILL.md` → Merge, `e2e/README.md`.

## Steps

- [x] **Step 1:** rewrite HARNESS §7 step 8 and the `open-pr` Merge section with the "only when it can catch something" rule and its list of paths.
- [x] **Step 2:** align the dispatch sentence in `e2e/README.md`, linking HARNESS §7.
- [x] **Step 3:** review follow-up after shipping (e51fdc9): the trigger list gains `.github/workflows/e2e.yml`, `.github/actions/` and `.nvmrc`, excludes unit and repository-shape tests under `apps/` or `libs/`, and lives only in HARNESS; the `open-pr` skill points at it. Shipped by direct push to `main` at the owner's request (1d8615f, 4b360a7, e51fdc9), so the roadmap row has no PR link.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 1 | a product change merges without the CI E2E run | a regression that the local `/verify` missed reaches `main` | revert this PR's commit |

**Steps with no backout:** none.
