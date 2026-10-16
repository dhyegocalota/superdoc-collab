# Skills

Vendored from superpowers 6.4.1 (obra/superpowers, MIT). Cross-references are rewritten to this repo's layout.

- brainstorming — explore intent, requirements and design before any creative work
- writing-plans — turn a spec or requirements into a multi-step implementation plan
- executing-plans — run an implementation plan inline in the current session
- subagent-driven-development — run an implementation plan with independent tasks dispatched to subagents
- test-driven-development — write a failing test before implementation code
- systematic-debugging — find root cause before proposing any fix
- verification-before-completion — run verification commands and confirm output before claiming success

This folder is the single source of skills: Claude Code reads it through the `.claude/skills` symlink, and Codex reads `.agents/skills` natively. In-house skills (`feature`, `adr`, `learning`) live alongside these.
