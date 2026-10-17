# A `pnpm <name>` step is green in under a second and prints nothing the script would print

- Date: 2026-10-17
- Inspired by: the tester's run of the `agent-doctor` test plan, defect D1 (CI run 39057065057, step `Run pnpm doctor`)
- Revisited: 2026-10-17 — recorded

## Signal

A CI step or a local command `pnpm <name>` exits 0 almost instantly and its log holds none of the lines the script in `package.json` prints; the gate it implements never fails, even with the tool it checks removed.

## Cause

pnpm resolves `pnpm <name>` to its own built-in command before it looks at `scripts`. Only names that are not built-ins fall through to the script, so `"doctor"` (like `audit`, `outdated` or `why`; `pnpm help` lists the rest) runs pnpm's own command, which on a healthy install prints nothing and exits 0. The script exists and is correct; it is simply never called. A green CI step is then proof of nothing.

## Do

Call a script through `pnpm run <name>` whenever the name could be a pnpm built-in, or pick a name pnpm does not own; a check that must report a missing pnpm calls its script directly (`.agents/hooks/doctor.sh`), with no `package.json` entry at all. Pin the exact call in a repository-shape test (the CI step text, the skill's gate line), and when a gate is new, prove it red once: remove the thing it checks and watch the step fail.

## Anchor

- `.github/workflows/verify.yml` → `run: .agents/hooks/doctor.sh`
- `.agents/skills/verify/SKILL.md` → gate 0
- `apps/server/src/repository-shape/ci-workflow.test.ts` → `CHECKS_STEPS`; `apps/server/src/repository-shape/agent-surfaces.test.ts` → `the verify skill opens with the doctor script, not the pnpm built-in of the same name`
