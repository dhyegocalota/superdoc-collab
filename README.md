# SuperDoc History

A collaborative DOCX editor that records every edit and will turn that record into a timeline of who changed what and when, with time travel and LLM-written summaries. It is the take-home project for SuperDoc ([brief](docs/brief/superdoc-eng-sample-project.docx)); the design rationale is in [`docs/adr/`](docs/adr/).

## Status

Slice 1 of 5 shipped: workspace, apps, Docker, CI and Better Auth with seeded users. Slice 2 is built and under review: documents, sharing, live collaboration and history capture. The timeline, time travel, LLM insights and the deploy follow. See the roadmap in [`docs/features/README.md`](docs/features/README.md).

## Features

- **Documents.** Upload a `.docx` (up to 10 MB) or create a blank document; the list shows "Mine" and "Shared with me" with the owner, the last update and your role. Rename, download and delete from the editor header (delete is owner only).
- **Live editing.** Documents open in SuperDoc with several people editing at once; members and who is online show in the header.
- **Sharing.** The owner gets an edit link and a read-only link, copies them from the Share dialog and can rotate either one. Anyone signed in who opens a link joins with that link's access; a rotation invalidates the link and keeps the members it already admitted. Readers see edits live but cannot type, and a reader can open a document only after the owner has opened it once.
- **History capture.** Every Yjs update is appended to a log with the connection's user, identities are bound to authors from SuperDoc's awareness, and a projection turns the log into edit events (who inserted or deleted what, in which block, when). `GET /api/documents/:id/events` serves them; tracked changes already in an uploaded file are imported with their original authors. The timeline that draws these events is the next slice.

Data lives under `DATABASE_DIR`: `auth.sqlite` (users, sessions, documents, members, share links), `history.sqlite` (update log, snapshots, identities), `read-model.sqlite` (edit events and the projection cursor) and `documents/<id>.docx`. No environment variable was added for this slice.

## Quick start

Requirements: Node 24 (`.nvmrc`) and pnpm 8.15.9.

### Local development

```bash
cp .env.example .env
pnpm install
set -a; source .env; set +a
pnpm seed
pnpm dev
```

The server reads its configuration from the shell; there is no dotenv loader. Web runs on <http://localhost:5173> and proxies `/api` and `/collaboration` to the server on port 3000. Agents never edit `.env`.

The editor needs the built bundle: SuperDoc's worker breaks under `vite dev`. To use documents, run `pnpm build`, then start the server with `WEB_DIST_DIR=apps/web/dist` and open the server's own port.

### Docker

```bash
ENV_FILE=.env.example APP_ORIGIN=http://localhost:3000 SEED_DEMO_USERS=true docker compose up --build -d
curl -s -o /dev/null -w '%{http_code}' -H 'content-type: application/json' -H 'origin: http://localhost:3000' -d '{"email":"ana@example.com","password":"superdoc-demo"}' localhost:3000/api/auth/sign-in/email
```

The sign-in smoke check must print `200`.

One image serves the SPA and the API on <http://localhost:3000>; the healthcheck calls `/api/health`. Reset all data with `docker compose down -v`. The image carries both history migration sets (`libs/history/drizzle`) and `@superdoc/sdk`'s native binary, which imports tracked changes from uploads; the server creates `/data/documents` at boot.

Run any command with the variables from `.env` loaded without printing them: `scripts/with-env.sh pnpm dev` (or `ENV_FILE=.env.example scripts/with-env.sh …`). Agents never read or edit `.env`; this script is how they start the app with real secrets.

## Demo users

Ana, Bruno, Caio and Dani: `ana@example.com`, `bruno@example.com`, `caio@example.com`, `dani@example.com`. The password is `DEMO_PASSWORD` (`superdoc-demo` in `.env.example`). `pnpm seed` is idempotent.

## Tests

| Command | Covers |
|---|---|
| `pnpm typecheck` | every package plus the E2E project |
| `pnpm test:unit` | `libs/types` (7), `libs/history` (29), `apps/server` (129, real HTTP, real SQLite, real WebSocket), `apps/web` (56, Vitest and Testing Library) |
| `pnpm test:e2e` | 16 Playwright specs: auth (7), documents and sharing (7), two-author collaboration and attribution (2); builds and starts the stack itself, needs Chromium (`pnpm exec playwright install chromium`) |
| `pnpm verify` | the three above, in order; the same gate runs in CI ([`verify.yml`](.github/workflows/verify.yml)) |

## Architecture in brief

One Node process on one port: Hono serves the API and the built SPA, and Hocuspocus serves the collaboration WebSocket. Better Auth stores users and sessions in SQLite through Drizzle and better-sqlite3. `libs/history` holds the update log, the projection and the read model; one worker thread projects the log into edit events. The web app is a React and Vite SPA. See [ADR 0001](docs/adr/0001-event-sourcing-over-yjs.md), [ADR 0004](docs/adr/0004-stack.md), [ADR 0005](docs/adr/0005-authentication-with-better-auth.md) and [ADR 0009](docs/adr/0009-design-system.md).

## Process

Work follows a written harness: agree on a spec, record decisions as ADRs, plan, build with developer sub-agents, prove with a separate tester sub-agent, review with a reviewer sub-agent, then ship.

- [`AGENTS.md`](AGENTS.md): facts and code conventions
- [`.claude/HARNESS.md`](.claude/HARNESS.md): the process
- [`docs/adr/`](docs/adr/): decisions and alternatives
- [`docs/features/`](docs/features/): spec, plan, test plan and tester briefing per feature
- [`docs/learnings/`](docs/learnings/): dated traps
- [`poc/`](poc/RESULTS.md): proof-of-concept results behind the history architecture

## Citations

**LLM use.** This codebase is developed with Claude Code (Anthropic) driving the harness in this repository. Every pull request is built by developer sub-agents, tested by a separate tester sub-agent with Playwright MCP and reviewed by a reviewer sub-agent; decisions are recorded in ADRs. A later slice adds LLM features to the product through the Vercel AI SDK, with the provider set by environment ([ADR 0006](docs/adr/0006-llm-via-vercel-ai-sdk.md)).

**Starter code.**

- shadcn/ui components (MIT) copied under `apps/web/src/components/ui`
- superpowers skills (MIT, version 6.4.1) vendored under `.agents/skills`
- Drizzle schema generated by the Better Auth CLI at `apps/server/src/database/schema/auth.ts`

## License

No license yet. The repository is private until delivery.
