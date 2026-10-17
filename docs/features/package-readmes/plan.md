# Plan: Package READMEs and docs that move with the code

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `.agents/hooks/` and its wiring, `apps/server/src/repository-shape/delivery-docs.test.ts`, process docs.

## Steps

- [x] **Step 1:** failing checks in `.agents/hooks/hooks.test.sh` for `remind-docs.sh` (outside a repository, clean tree, nearest README and matching rule, once per set, continuing stop, root README).
- [x] **Step 2:** `.agents/hooks/remind-docs.sh`; wire it as a Stop hook in `.claude/settings.json` and `.codex/hooks.json`.
- [x] **Step 3:** failing `delivery-docs.test.ts` cases: every README is link-checked, every workspace package has a README, inline code and fenced links are skipped.
- [x] **Step 4:** fix `docs/adr/README.md`'s superseded link; write the five READMEs.
- [x] **Step 5:** HARNESS, `AGENTS.md`, reviewer role, `open-pr` skill.
- [x] **Step 6:** review round: failing checks for spaces, renames, a commit and a dismissed document (0f4ac9b); the hook reads `git diff` plus untracked files and remembers documents per `HEAD`; `delivery-docs` checks git's exit status, needs a `package.json` to call a folder a package and requires `e2e/README.md`; README facts corrected.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | the hook blocks every stop | the same reminder twice in one turn | remove the `Stop` entry from both hook files |
| 3 | a README links a renamed path | `pnpm test:unit` fails in `delivery-docs` | fix the link in the same change |

**Steps with no backout:** none.
