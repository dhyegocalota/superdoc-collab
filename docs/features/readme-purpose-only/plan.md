# Plan: README purpose only

**Spec:** spec.md
**Tier:** green
**Seam:** documentation and one repository-shape test.

## Steps

- [x] **Step 1:** add `readme-run-block.test.ts`, red against the package READMEs, and move `readmes` and `workspacePackages` into `repository-files.ts`.
- [x] **Step 2:** rewrite the five package READMEs to purpose only; reword the learnings index row that named a `pnpm` command.
- [x] **Step 3:** update `AGENTS.md`, `.claude/HARNESS.md` and the feature index.

## Prove and ship

- [x] The repository-shape tests, `pnpm typecheck` and the hook tests pass locally.
