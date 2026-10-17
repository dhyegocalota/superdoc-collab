# Test plan: Agent install file

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: `.

## The failing test first

- [x] Before the documents change, the updated `readme-run-block.test.ts` and `delivery-docs.test.ts` fail on `## Quick install is missing`, on the missing `docs/agent-install.md`, and on prompts that do not name it — evidence: worktree at 1432df0: `readme-run-block.test.ts` fails to load on `## Quick install is missing` (70 tests collected instead of 114), and `the agent install file carries the variables and the claim instruction` and `the README and the install guide hand the agent the agent install file` fail

## Unit

- [x] `readme-run-block.test.ts` green: every `pnpm` command in the README's Quick install and in `docs/install.md` → Run from source is a script of its package; `scripts/with-env.sh` exists; every variable is documented; the compose file exists; the only fenced blocks of the README sit under Quick install — evidence: f604dc2, repository-shape 114/114 passed
- [x] `delivery-docs.test.ts` green: `docs/agent-install.md` carries `AUTH_SECRET`, `APP_ORIGIN`, `SEED_DEMO_USERS=false`, `claim the instance`; both prompts name `docs/agent-install.md`; every README link and anchor resolves — evidence: f604dc2, repository-shape 114/114 passed
- [x] `hooks.test.sh` green with the doctor's `docker` line saying Quick install — evidence: f604dc2, `hooks: all checks passed`
- [x] Mutation: remove `claim the instance` from `docs/agent-install.md` → the phrase test fails; restore — evidence: `claim` → `open` in a worktree: 1 failed (the phrase test), 113 passed
- [x] Mutation: change `pnpm seed` to `pnpm sow` in `docs/install.md` → Run from source → `pnpm sow is a script of its package` fails; restore — evidence: worktree: `× pnpm sow is a script of its package`, 113 passed
- [x] Mutation: point the README prompt at `docs/install.md` → the prompt test fails; restore — evidence: worktree: `× the README and the install guide hand the agent the agent install file`, 113 passed

## Prove it for real — the agent's perspective

- [x] The README's Quick install shows two ways (agent, Docker) and a pointer to `docs/install.md`; the from-source block is in `docs/install.md` → Run from source — evidence: README.md lines 9-25 at f604dc2 (agent prompt, docker compose command, pointer line); docs/install.md line 31 `## Run from source` holds the cp/install/build/seed/start block; README is 37 lines with one screenshot, one screen of text
- [x] Paste the README's one-line prompt into `claude -p` in a worktree of the branch with at most 4 turns: the agent reads `docs/agent-install.md` and its reply asks Railway or Docker Compose, and installs nothing — evidence: `claude -p` at f604dc2 in /tmp/install-walk, 4 turns; reply: "I've read `README.md` and the Railway runbook. The install guide has me stop here until you answer one question. **Where should it run?** 1. **Railway**: hosted, about US$5/month ... 2. **Docker Compose on this machine**: runs locally at `http://localhost:3000`."; `git status --short` empty; `docker ps` showed no new container; worktree removed
- [x] `docs/agent-install.md` names `https://github.com/dhyegocalota/superdoc-collab`; no file outside `docs/features/` and `docs/learnings/` names `superdoc-take-home` as a URL — evidence: `rg -n superdoc-take-home` with the given excludes returns no match (exit 1); docs/agent-install.md line 5 names `https://github.com/dhyegocalota/superdoc-collab`

## Edge cases found during execution

- Prompt pasted in an empty directory: it carries the full repository URL, so the agent can clone (step 1 of agent-install.md says clone unless already in it). Confirmed by reading; the walk ran inside the worktree, where the agent reported it was already in the repository. The empty-directory clone was not run.
- Links in docs/agent-install.md (`install.md`, `features/deploy/runbook-railway.md`) both resolve relative to docs/.
- The agent in the walk read only README and the runbook (not asked to run anything); it also volunteered the OpenRouter key question and a domain requirement, which the file does not state outright (it comes from the runbook). No defect.

## Coverage honesty

- The full install (Railway or Docker to a claimed instance) is not re-run: its steps did not change, only where they are written.
