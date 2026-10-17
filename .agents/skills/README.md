# Skills

Vendored from superpowers 6.4.1 (obra/superpowers, MIT). Cross-references are rewritten to this repo's layout.

- brainstorming — explore intent, requirements and design before any creative work
- writing-plans — turn a spec or requirements into a multi-step implementation plan
- executing-plans — run an implementation plan inline in the current session
- subagent-driven-development — run an implementation plan with independent tasks dispatched to subagents
- test-driven-development — write a failing test before implementation code
- systematic-debugging — find root cause before proposing any fix
- verification-before-completion — run verification commands and confirm output before claiming success

This folder is the single source of skills: Claude Code reads it through the `.claude/skills` symlink, and Codex reads `.agents/skills` natively. In-house skills live alongside these:

- feature, adr, learning — scaffold the feature folder, an ADR, a learning
- verify — machine doctor → typecheck → security audit → secret scan → unit → E2E, stop at the first failure
- check-ui — Playwright MCP walk, screenshots, video, release upload
- open-pr — the Ship gates, then the pull request
- scenario — boots the stack on its own ports and walks one `docs/scenarios/<slug>.md` with one Playwright MCP server per author

Claude Code invokes them as `/<name> <arguments>`; Codex as `$<name>` followed by the arguments. The front matter keys beyond `name` and `description` (`argument-hint`, `allowed-tools`, `metadata`) are read by Claude Code and ignored by Codex.
