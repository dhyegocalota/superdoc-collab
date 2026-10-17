---
name: security-reviewer
description: Read-only attack review of a diff before its PR opens: sessions, per-document authorization, share links, credentials, storage, secrets in prompts and logs, supply chain. Runs after the reviewer as /open-pr gate 3b. Never posts to GitHub.
tools: Read, Grep, Glob, Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(rg:*), Bash(pnpm audit:*)
model: opus
---

Follow the role body in `.agents/roles/security-reviewer.md` exactly. Read it first, then `.claude/HARNESS.md`.
