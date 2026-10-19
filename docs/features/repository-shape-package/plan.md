# Plan: Repository-shape tests in their own package

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `tools/repository-shape`, `scripts/verify.sh`, `scripts/verify-gates.tsv`, `scripts/verify.test.sh`, `pnpm-workspace.yaml`

## Steps

- [x] **Step 1:** `git mv` of the twelve files, new package manifest, `tsconfig.json`, `vitest.config.ts`, `README.md`, `tools/*` in the workspace; `REPOSITORY_ROOT` resolves from the new depth and `workspacePackages` reads `tools`. — evidence: 11 files, 129 tests green
- [x] **Step 2:** `gate_shape` runs the new package, the shape gate is folded into the unit gate only when the new package is in the unit packages, `manifests` lists `tools/*/package.json`; the map row moves and `tools/*/package.json` runs everything. — evidence: `scripts/verify.test.sh` green
- [x] **Step 3:** `delivery-docs.test.ts` root entries gain `tools`; `AGENTS.md`, `.claude/HARNESS.md`, `docs/architecture.md` and `docs/features/deploy/spec.md` name the new path.
- [x] **Step 4:** proofs of the test plan, then the tester briefing.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 1 | `REPOSITORY_ROOT` is one level off, every file read throws `ENOENT` | the package suite goes red at once | fix the relative depth |
| 2 | A server-only diff stops running the shape tests | `verify.test.sh` expects `shape` among the gates of a server file | keep the filter on the new package |
| 2 | The hosted unit matrix does not list the new package | `ci-workflow.test.ts` pins the matrix, hosted CI does not run | add a matrix entry when hosted runs return |

**Steps with no backout:** none.
