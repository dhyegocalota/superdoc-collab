# Plan: cleanup docs

**Spec:** spec.md
**Tier:** green
**Seam:** documentation and the repository layout only.

## Steps

- [x] **Step 1:** `git rm -r poc`; drop it from `.prettierignore`, the `AGENTS.md` layout and the `paths:` globs of the rules; turn ADR links into plain text; add the citation note to the three rules that cite POC files.
- [x] **Step 2:** rewrite the five package READMEs without source references.
- [x] **Step 3:** move the architecture, features, tests, deploy and limits sections to `docs/architecture.md` and the credits to `docs/credits.md`.
- [x] **Step 4:** capture `docs/media/readme/timeline.png` with a scratch Playwright spec (not committed) and remove the eight earlier screenshots.
- [x] **Step 5:** rewrite the root README.

## Prove and ship

- [x] `pnpm format:check`, `pnpm typecheck`, the repository-shape tests (README links) and the hook tests pass locally.
- [x] Pushed to `main` on the owner's instruction; CI `verify.yml` on `main`.
