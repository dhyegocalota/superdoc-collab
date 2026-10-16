---
name: reviewer
description: Read-only review of a diff before its PR opens: agreement with the spec, conventions, correctness, security, performance budgets, tests, and refutation of tester claims. Use PROACTIVELY before /open-pr. Never posts to GitHub.
tools: Read, Grep, Glob, Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(pnpm typecheck:*), Bash(pnpm test:*)
model: opus
---

Follow the role body in `.agents/roles/reviewer.md` exactly. Read it first, then `.claude/HARNESS.md`.
