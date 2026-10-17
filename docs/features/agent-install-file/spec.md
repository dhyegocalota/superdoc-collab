# Agent install file

**Status:** Shipped 2026-10-17
**Tier:** 🟢
**Owner approval:** approved 2026-10-17
**ADRs:** [0019](../../adr/0019-deploy-on-railway.md), [0020](../../adr/0020-invite-only-accounts-with-a-first-claim-admin.md)
**Not changing:** the install steps themselves, the Docker command, the Railway runbook, the configuration table, the product

## Problem

The "Install with an agent" prompt in `docs/install.md` carries six detailed steps in the text the person pastes, so it is long to copy and drifts with every change; it also still names the repository by its old name (`superdoc-take-home`). The README's quick path offers Docker and from source, but not the agent, which is the shortest way in.

## Goals

- The person pastes one sentence; the agent reads the steps from a file in the repository.
- The README opens with a quick install offering two ways: with an agent, and with Docker by hand. Everything else (Railway, from source, configuration, recovery) lives in `docs/install.md`.
- The commands that move stay pinned by the repository-shape tests.

## Non-goals

- Changing what the install does, or the Railway runbook.
- Making the README longer than one screen.

## Design

- **`docs/agent-install.md` (new):** written to the agent. The six steps of today's prompt, unchanged in substance, with the repository URL `https://github.com/dhyegocalota/superdoc-collab`.
- **`README.md`:** `## Run it` becomes `## Quick install`: "With an agent" (one fenced line to paste: `Install https://github.com/dhyegocalota/superdoc-collab by following docs/agent-install.md in that repository.`) and "With Docker" (the current `docker compose` command and the demo sign-in line), closed by one line that points at `docs/install.md` for Railway, running from source, configuration and recovery. The from-source block leaves the README.
- **`docs/install.md`:** "Install with an agent" shows the same one-line prompt and links `agent-install.md`; a new `## Run from source` section holds the from-source block moved from the README.
- **Tests:** `readme-run-block.test.ts` reads `## Quick install` in the README and `## Run from source` in `docs/install.md`, and applies the same checks (scripts exist in their package, `scripts/` paths exist, variables are documented, compose files exist). `delivery-docs.test.ts` checks the agent phrases (`AUTH_SECRET`, `APP_ORIGIN`, `SEED_DEMO_USERS=false`, `claim the instance`) in `docs/agent-install.md`, and that the README and `docs/install.md` prompts name that file.
- **Wording that follows:** `AGENTS.md` and the doctor's `docker` line say "Quick install" instead of "Run it".

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Where does the from-source block go? | stay in the README / move to `docs/install.md` and stay pinned | Move to `docs/install.md`, pinned by the extended test | 2026-10-17 |

## Test strategy summary

Repository-shape tests above, each proven red by a mutation (a missing script in the moved block, a missing phrase in the agent file, a README prompt that names another file). The tester pastes the README's one-line prompt into a fresh `claude -p` session in a scratch directory with `--max-turns` low enough that it stops at the Railway-or-Docker question, and checks that the agent asked it after reading `docs/agent-install.md`.
