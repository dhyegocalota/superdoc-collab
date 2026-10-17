# Package READMEs and docs that move with the code — spec

- Status: Building
- Tier: green (documentation, one hook, one repository-shape test; no product code).
- Owner approval: approved 2026-10-17 (the owner asked for "README nas subpastas necessárias + automated agentic rules pra atualizar static non-code things like README once the code change").
- ADRs: none; [0014](../../adr/0014-one-source-per-agent-surface.md) governs where the hook lives.
- Not changing: the root README's content, any product code, the existing hooks.

## Problem

Only the root and four `docs/` folders had a README, so an agent opening `apps/server` or `libs/history` had to read code to learn what lives where. Nothing reminded an agent to update a README or a `.claude/rules/` fact after changing the code it describes, and the link check covered three documents only: `docs/adr/README.md` still linked `0018-deploy-on-railway.md` after the ADR became 0019.

## Goals

- `apps/web`, `apps/server`, `libs/history`, `libs/types` and `e2e` each have a README with purpose, commands and layout, linking the folders they name.
- A Stop hook (`.agents/hooks/remind-docs.sh`, wired for Claude Code and Codex) names the nearest README and the `.claude/rules/` files whose globs match each uncommitted change when those documents did not change. It blocks once per set of documents and never a stop that is already continuing.
- CI fails when any README links a missing file or heading, or a workspace package has no README.
- HARNESS (Build, Ship gate 5, Enforcement), `AGENTS.md`, the reviewer role and the `open-pr` skill state that docs move with the code.

## Non-goals

- No README for `deploy/`, `docker/`, `scripts/` or `poc/`: the root README and `poc/RESULTS.md` describe them.
- No check that prose matches behaviour; that stays a judgment for the agent and the reviewer.

## Design

- Nearest README: walk up from the changed file's folder; the root `README.md` when none is found. README files and rules themselves never trigger.
- Changed files: `git status --porcelain --untracked-files=all`, so committed work is considered handled.
- Once per set: the last reminded set is stored in `$(git rev-parse --git-dir)/docs-reminder` (per worktree).
- Output: `{"decision":"block","reason":…}` on stdout, the Stop contract both Claude Code and Codex accept.
