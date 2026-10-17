# Test plan: Agent install file

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: `.

## The failing test first

- [ ] Before the documents change, the updated `readme-run-block.test.ts` and `delivery-docs.test.ts` fail on `## Quick install is missing`, on the missing `docs/agent-install.md`, and on prompts that do not name it

## Unit

- [ ] `readme-run-block.test.ts` green: every `pnpm` command in the README's Quick install and in `docs/install.md` → Run from source is a script of its package; `scripts/with-env.sh` exists; every variable is documented; the compose file exists; the only fenced blocks of the README sit under Quick install
- [ ] `delivery-docs.test.ts` green: `docs/agent-install.md` carries `AUTH_SECRET`, `APP_ORIGIN`, `SEED_DEMO_USERS=false`, `claim the instance`; both prompts name `docs/agent-install.md`; every README link and anchor resolves
- [ ] `hooks.test.sh` green with the doctor's `docker` line saying Quick install
- [ ] Mutation: remove `claim the instance` from `docs/agent-install.md` → the phrase test fails; restore
- [ ] Mutation: change `pnpm seed` to `pnpm sow` in `docs/install.md` → Run from source → `pnpm sow is a script of its package` fails; restore
- [ ] Mutation: point the README prompt at `docs/install.md` → the prompt test fails; restore

## Prove it for real — the agent's perspective

- [ ] The README's Quick install shows two ways (agent, Docker) and a pointer to `docs/install.md`; the from-source block is in `docs/install.md` → Run from source
- [ ] Paste the README's one-line prompt into `claude -p` in a worktree of the branch with at most 4 turns: the agent reads `docs/agent-install.md` and its reply asks Railway or Docker Compose, and installs nothing
- [ ] `docs/agent-install.md` names `https://github.com/dhyegocalota/superdoc-collab`; no file outside `docs/features/` and `docs/learnings/` names `superdoc-take-home` as a URL

## Edge cases found during execution

Empty on purpose.

## Coverage honesty

- The full install (Railway or Docker to a claimed instance) is not re-run: its steps did not change, only where they are written.
