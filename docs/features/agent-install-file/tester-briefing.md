# Tester briefing: Agent install file

Written by the lead, who built this 🟢 change inline. The lead does not run the "Prove it for real" boxes.

## What changed

- `docs/agent-install.md` — new: the six install steps, written to the agent, with the repository URL `https://github.com/dhyegocalota/superdoc-collab`
- `README.md` — `## Run it` became `## Quick install`: the one-line agent prompt, the Docker command, a pointer to `docs/install.md`
- `docs/install.md` — "Install with an agent" is the one-line prompt plus a link; new `## Run from source` with the block moved from the README
- `AGENTS.md`, `.claude/HARNESS.md` §12, the doctor's `docker` line and its hook test — say Quick install / Run from source
- `apps/server/src/repository-shape/readme-run-block.test.ts`, `delivery-docs.test.ts` — pin both sections and the agent file

## How to run

```bash
bash .agents/hooks/hooks.test.sh
cd apps/server && node_modules/.bin/vitest run src/repository-shape
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `readme-run-block.test.ts` | `## Quick install is missing` at load | the README has the section and `docs/install.md` has Run from source |
| `the agent install file carries the variables and the claim instruction` | `docs/agent-install.md` does not exist | the file carries the four phrases |
| `the README and the install guide hand the agent the agent install file` | neither prompt names the file | both do |

## Hypotheses to attack

1. Hypothesis: the one-line prompt is enough for an agent to find the steps and stop at the Railway-or-Docker question. Break it by: pasting it into `claude -p` in a worktree with few turns.
2. Hypothesis: nothing reader-facing still names the old repository. Break it by: searching for `superdoc-take-home` outside history.

## Known gaps

- The full install to a claimed instance is not re-run; the steps did not change.
