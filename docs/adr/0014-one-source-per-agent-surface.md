# 0014. One source per agent surface, a thin adapter per tool

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: the owner asking whether Codex has the same support as Claude Code; the Codex docs on [hooks](https://learn.chatgpt.com/docs/hooks), [advanced config](https://learn.chatgpt.com/docs/config-file/config-advanced), [skills](https://learn.chatgpt.com/docs/build-skills), [rules](https://learn.chatgpt.com/docs/agent-configuration/rules) and [custom prompts](https://developers.openai.com/codex/custom-prompts)

## Context

The harness is meant to be tool-agnostic: Claude Code, Codex and any agent that reads `AGENTS.md` follow the same phases. Until this record the repository mirrored only part of it for Codex. Skills were shared (`.agents/skills`, read natively by Codex and through the `.claude/skills` symlink by Claude Code) and the five roles were wrapped for both tools. Three surfaces existed for Claude Code only:

- Hooks. The three guard scripts were wired in `.claude/settings.json`, which Codex never reads. Codex loads hooks from `<repo>/.codex/hooks.json` (or inline `[hooks]` in `config.toml`) with the same event names, matcher regexes and command handlers, the same stdin JSON (`tool_name`, `tool_input`, `cwd`) and the same exit-code-2-blocks contract. One difference matters: Codex edits files through `apply_patch`, so the touched paths arrive as `*** Update File:` headers inside `tool_input.command`, not as `tool_input.file_path`.
- Commands. `/verify`, `/check-ui` and `/open-pr` lived in `.claude/commands/`. Codex custom prompts are user-level only (`~/.codex/prompts`), cannot be committed to a repository and are deprecated in favour of skills.
- Rules. `.claude/rules/*.md` load by `paths:` globs. Codex has no instruction file scoped by glob: its "rules" (`.codex/rules/*.rules`) are Starlark command-approval policies, and nested `AGENTS.md` files apply by working directory, not by the file being edited.

Two smaller gaps stay open and are listed under Consequences: the `permissions.deny` entries that stop Claude Code from reading `.env*`, and the per-agent `tools` and `model` fields of `.claude/agents/*.md`.

## Decision

Every agent surface has one source under `.agents/` and a thin adapter per tool that only points at it:

| Surface | Source | Claude Code adapter | Codex adapter |
|---|---|---|---|
| Instructions | `AGENTS.md` | `CLAUDE.md` symlink | read natively |
| Process | `.claude/HARNESS.md` | linked from `AGENTS.md` | linked from `AGENTS.md` |
| Skills, including `verify`, `check-ui`, `open-pr` | `.agents/skills/<name>/SKILL.md` | `.claude/skills` symlink; `/<name>` with `$ARGUMENTS` | read natively; `$<name>` with the arguments in plain text |
| Roles | `.agents/roles/<role>.md` | `.claude/agents/<role>.md` | `.codex/agents/<role>.toml` |
| Hooks | `.agents/hooks/*.sh` | `.claude/settings.json` | `.codex/hooks.json` |
| Domain rules | `.claude/rules/*.md` | loaded by `paths:` globs | `AGENTS.md` tells the agent to open each rule whose globs match the file it edits |
| MCP servers | `.mcp.json` and `.codex/config.toml` | `.mcp.json` | `.codex/config.toml` |

The hook scripts read the touched files from `tool_input.file_path` when present and from the `apply_patch` headers in `tool_input.command` otherwise (`.agents/hooks/touched-files.sh`), so one script serves both shapes. `.agents/hooks/hooks.test.sh` feeds both shapes to every script and runs as `pnpm test:hooks`, inside `pnpm test:unit`.

Domain rules stay in `.claude/rules/` because Claude Code loads that folder by convention and nothing confirms it follows a symlink there. The globs are not copied into `AGENTS.md`; the instruction points at the front matter, so there is one list to keep.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| One source under `.agents/`, thin adapters per tool (chosen) | nothing is written twice; adding a tool is one adapter; hooks and skills are tested once | the adapters must be kept in step when a tool changes its format; a reader has to follow one pointer | — |
| Copy each surface into `.codex/` | each tool is self-contained; no symlinks or pointers | three copies of every hook, skill and role drift apart within a week; the `apply_patch` shape would still need separate scripts | duplication is the failure this repository already guards against in code |
| Declare Codex unsupported and keep Claude Code only | zero extra files | the harness claims to be tool-agnostic and the owner uses both tools; the first Codex session would run without the `.env` guard and without `/open-pr` | contradicts the harness and the owner's request |
| Nested `AGENTS.md` per directory as the Codex replacement for path-scoped rules | native Codex mechanism; no instruction to follow | applies by working directory, so a session started at the root never sees `apps/server/AGENTS.md`; four more instruction files to keep aligned with the globs | the routing sentence in the root `AGENTS.md` covers every start directory with one list |
| Move `.claude/rules/` to `.agents/rules/` behind a symlink | fully symmetric with skills and roles | unverified that Claude Code's rules loader follows a symlinked folder; a silent miss would drop every domain rule | not worth the risk for a folder only Claude Code loads automatically |

## Consequences

- Codex sessions get the same three guards, the same skills and the same roles as Claude Code. The `/verify`, `/check-ui` and `/open-pr` names in this repository's documents mean the skills of those names in either tool.
- `.claude/commands/` is gone; `.claude/hooks/` is gone. A hook change is one edit in `.agents/hooks/` and one run of `pnpm test:hooks`.
- Codex runs project hooks only after the project is trusted and the hooks reviewed with `/hooks`; a changed script is skipped until it is trusted again. The first Codex session on a machine must do that once.
- Open gaps, accepted: Codex has no equivalent of the `permissions.deny` entries that stop Claude Code from reading `.env*`, so for Codex that rule rests on `AGENTS.md` and `scripts/with-env.sh`; Codex roles do not carry the per-agent `tools` and `model` restrictions of `.claude/agents/*.md`, so a Codex `reviewer` is read-only by instruction, not by permission.
- Codex ignores `argument-hint` and `allowed-tools` in a `SKILL.md`; the skill bodies state their arguments in prose so they read the same without `$ARGUMENTS` expansion.

## Evidence

- `.agents/hooks/hooks.test.sh`: both input shapes, every script, blocking and allowing cases, warnings for `.ts` only.
- `.codex/hooks.json` validates as JSON and matches the event and handler schema of the Codex docs; `.claude/settings.json` points at the moved scripts.
- `git mv` kept the history of the three commands and the three scripts.
- Not yet observed: a real Codex session firing the hooks. The first one records the outcome as a `Revisited` line on this ADR's learning, if any, and reopens this record on a mismatch.

## Revisit when

- Codex ships repository-scoped prompts, glob-scoped instruction files or per-role tool permissions: move the corresponding adapter to the native mechanism.
- Claude Code documents that `.claude/rules/` may be a symlink: move the rules to `.agents/rules/`.
- A third tool joins (Gemini CLI, Cursor): add its adapters to the table; if it cannot read any source, that source moves, the others do not duplicate.
- The first Codex session shows a hook payload different from the documented one.
