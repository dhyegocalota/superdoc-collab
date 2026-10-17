# SuperDoc take-home — agent guide

Read by Claude Code (`CLAUDE.md`), Codex (`AGENTS.md`) and Gemini (`GEMINI.md`): the three names are the same file.

**Process lives in `.claude/HARNESS.md`. Read it before any feature, fix or review.**
Domain facts live in `.claude/rules/*.md`. Claude Code loads them by the `paths:` globs in their front matter; every other tool opens, before editing a file, each rule whose globs match it. Decisions live in `docs/adr/`. Traps live in `docs/learnings/`.

## What this is

A full-stack app that visualizes how a collaborative DOCX evolves over time and across contributors, built on SuperDoc Editor v2 with real-time collaboration. The brief is `docs/brief/superdoc-eng-sample-project.docx`. The proof of concept of October 2026 was removed on 2026-10-17; its results are summarized in ADR 0001–0004 and the rules under `.claude/rules/`.

## Layout

```
apps/web          React 19 + Vite + TanStack Query + React Router (SuperDoc runs here)
apps/server       Hono + Hocuspocus in one process; SQLite; worker threads
libs/history      Yjs update log, authorship, projection, windows, snapshots
libs/types        shared types, enums and constants
docs/adr          architecture decision records
docs/learnings    dated traps, with what inspired them and when they were revisited
docs/features     one folder per feature: spec.md + plan.md + test-plan.md
docs/media        screenshots the README embeds
.agents/skills    skills (single source; `.claude/skills` links here)
.agents/roles     agent role bodies shared by `.claude/agents` and `.codex/agents`
```

Every workspace package and `e2e/` has a `README.md` that states purpose only: no commands, configuration, file paths or symbols, because prose is not compiled. The root README's Run it block is the one exception; `apps/server/src/repository-shape/readme-run-block.test.ts` pins it to `package.json`, `.env.example`, the workspace and the demo users. Update a README in the same change as the code it describes ([HARNESS → Build](.claude/HARNESS.md#4-build)).

## Language

Everything in the repo is in English: code, identifiers, comments-free code, docs, ADRs, learnings, commits, PR titles and bodies. Conversation with the owner may be in Portuguese; files never are.

## Code conventions

- No comments; names carry the meaning. The one exception is a pointer to a decision: one line, `// NB ADR NNNN: <the rule in one sentence>`, placed on the constant or function that embodies it. It never explains mechanics, and a rule that deserves one deserves the ADR first. No acronyms in identifiers.
- Flat `if`s, early returns, no `else`.
- A compound condition gets a name (`isServedReply`, `isOnEditingSurface`) before the `if` that uses it.
- A name says what the variable holds: a promise is a `…Connection` or `…Promise`, never a `client`.
- One handler per request kind, dispatched from a record keyed by the kind, instead of one function with interleaved `if`s.
- Recurring mechanics have one shared helper: `LruMap`, `KeyedCooldown`, `SlidingWindow` and `withTimeout` in `apps/server/src/limits/`, `readJson` in `apps/web/src/lib/api.ts`, `documentQueryKey` and `pollWhileAvailable` in their feature's `*-api.ts`. Search before adding a local copy; a new one goes under `lib/` or the owning feature.
- Durations cross boundaries in milliseconds and convert at the edge (a `Retry-After` header, a label).
- Copy strings never sit inline in JSX; they live in a `*-copy.ts` file or `libs/types`.
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
- One source per agent surface, thin adapters per tool ([ADR 0014](docs/adr/0014-one-source-per-agent-surface.md)): skills in `.agents/skills` (`.claude/skills` links there), roles in `.agents/roles` (wrapped by `.claude/agents/*.md` and `.codex/agents/*.toml`), hook scripts in `.agents/hooks` (wired by `.claude/settings.json` and `.codex/hooks.json`).
- TypeScript intelligence: Claude Code uses the `typescript-lsp` plugin; everyone else runs `pnpm typecheck`.
- Secrets live in `.env` files that agents never edit; `.env.example` documents them.
