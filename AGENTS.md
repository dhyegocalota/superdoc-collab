# SuperDoc take-home — agent guide

Read by Claude Code (`CLAUDE.md`), Codex (`AGENTS.md`) and Gemini (`GEMINI.md`): the three names are the same file.

**Process lives in `.claude/HARNESS.md`. Read it before any feature, fix or review.**
Domain facts live in `.claude/rules/*.md` and load by path. Decisions live in `docs/adr/`. Traps live in `docs/learnings/`.

## What this is

A full-stack app that visualizes how a collaborative DOCX evolves over time and across contributors, built on SuperDoc Editor v2 with real-time collaboration. The brief is `docs/brief/superdoc-eng-sample-project.docx`. The validated proof of concept is in `poc/` (`poc/RESULTS.md`).

## Layout

```
apps/web          React 19 + Vite + TanStack Query + React Router (SuperDoc runs here)
apps/server       Hono + Hocuspocus in one process; SQLite; worker threads
libs/history      Yjs update log, authorship, projection, windows, snapshots
libs/types        shared types, enums and constants
poc/              throwaway proof of concept; keep green, do not extend
docs/adr          architecture decision records
docs/learnings    dated traps, with what inspired them and when they were revisited
docs/features     one folder per feature: spec.md + plan.md + test-plan.md
.agents/skills    skills (single source; `.claude/skills` links here)
.agents/roles     agent role bodies shared by `.claude/agents` and `.codex/agents`
```

## Language

Everything in the repo is in English: code, identifiers, comments-free code, docs, ADRs, learnings, commits, PR titles and bodies. Conversation with the owner may be in Portuguese; files never are.

## Code conventions

- No comments; names carry the meaning. No acronyms in identifiers.
- Flat `if`s, early returns, no `else`.
- Never `?? defaultValue` to mask a missing value. Model absence explicitly: throw, return early or make the field required upstream.
- Enums over string literals. Constants over magic literals, declared at the top of the file or in `libs/types`.
- Function declarations for functions, components and hooks. Named parameters whenever a function takes more than one.
- Array methods over loops. Short files with one purpose.
- No `.js` extensions in imports. Type everything.
- Read neighbouring code first and match it; the repo must read as if one engineer wrote it.

## Commits and branches

- Branches: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`.
- Commits: Conventional Commits, `type(scope): summary`, en-US. Never `git add -A`, `git add .` or `--no-verify`.
- Commit and push only when the owner asks. Never commit from `main`; branch first.
- Attribution lines required by the agent harness go at the end of the commit body.

## Tests are mandatory

A change without tests is not done. Unit with Vitest, E2E with Playwright, and the user-facing walk with Playwright MCP recorded for the PR. Details in `.claude/HARNESS.md` → Prove.

## Tooling

- `.mcp.json` (Claude, Cursor) and `.codex/config.toml` (Codex) declare the same MCP servers: `playwright`, `context7`.
- TypeScript intelligence: Claude Code uses the `typescript-lsp` plugin; everyone else runs `pnpm typecheck`.
- Secrets live in `.env` files that agents never edit; `.env.example` documents them.
