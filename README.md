# SuperDoc History

A collaborative DOCX editor that records every edit and turns that record into a timeline of who changed what and when, with time travel and LLM-written summaries. It is the take-home project for SuperDoc ([brief](docs/brief/superdoc-eng-sample-project.docx)); the design rationale is in [`docs/adr/`](docs/adr/).

## Status

Slices 1 and 2 shipped: workspace, Docker, CI, Better Auth, documents, sharing, live collaboration and history capture. Slice 3 is being built on `feat/timeline-and-time-travel`: the timeline panel, time travel and the LLM topics and summaries. The on-demand summary and the deploy follow. See the roadmap in [`docs/features/README.md`](docs/features/README.md).

## Features

- **Documents.** Upload a `.docx` (up to 10 MB) or create a blank document; the list shows "Mine" and "Shared with me" with the owner, the last update and your role. Rename, download and delete from the editor header (delete is owner only).
- **Live editing.** Documents open in SuperDoc with several people editing at once; members and who is online show in the header.
- **Sharing.** The owner gets an edit link and a read-only link, copies them from the Share dialog and can rotate either one. Anyone signed in who opens a link joins with that link's access; a rotation invalidates the link and keeps the members it already admitted. Readers see edits live but cannot type, and a reader can open a document only after the owner has opened it once.
- **History capture.** Every Yjs update is appended to a log with the connection's user, identities are bound to authors from SuperDoc's awareness, and a projection turns the log into edit events (who inserted or deleted what, in which block, when).
 `GET /api/documents/:id/events` serves them in pages of 500; tracked changes already in an uploaded file are imported with their original authors.
- **Timeline panel.** A streamgraph of edit volume over time, one band per topic (or per author while no topics exist), with labels inside the bands. Hover shows the band, the time bin and who contributed; the bin size follows the history span, from minutes up to days, and you can pin it with `?binMs=` on `GET /timeline`. The panel updates while people type: the projection runs on a 1.5 s throttle from every logged update.
- **Filter.** One box: plain text matches inserted or deleted text, case-insensitively; `@person` matches an author's name or email. Both narrow the chart, the list and the highlights, and the filter lives in the URL.
- **Top edits.** Per topic, sorted by volume: the contributors, `+N words -M words` and one LLM sentence about what the edits changed. A topic is summarized again only after it receives new edits, at most once a minute per document.
- **Time travel.** Click a moment, or scrub, to open the document as it was then: read-only, in a framed viewer with a "back to live" banner, with the edits of that moment highlighted. Versions are exact: a mark is kept per minute and per bootstrap, a request resolves to the nearest mark at or before it, and each version has its own read-only endpoint (`/collaboration/versions/<id>/<sequence>`) that never writes the log. `GET /api/documents/:id/versions?around=<sequence>` lists the marks around a sequence (`around` is required).
- **Topics.** Four to eight topics per document, named by the model once and recomputed when five or more new blocks land outside every topic (at most once a minute). Editors can refresh them from the panel; the refresh budget is one run per document every 30 seconds, and a second request inside it answers 429 with `Retry-After`.

Data lives under `DATABASE_DIR`: `auth.sqlite` (users, sessions, documents, members, share links, topics and summaries), `history.sqlite` (update log, snapshots, identities), `read-model.sqlite` (edit events, version marks and the projection cursor) and `documents/<id>.docx`. Documents projected before version marks existed are rebuilt at startup, and their versions answer 202 until then.

### LLM configuration

Topics and the per-topic sentences go through the Vercel AI SDK and OpenRouter. Set `LLM_MODEL` (`.env.example` uses `openai/gpt-6-luna`) and `OPENROUTER_API_KEY`; `OPENROUTER_BASE_URL` is optional and points the client at another compatible endpoint. Without a key the app keeps working: the topics state becomes `failed` with the reason, and the chart shows one band per author. The prompts carry document text and author names only, never emails; each block is cut at 500 characters, markup in the text is escaped, and the prompts tell the model that block and edit content is data, not instructions. The test suite mocks the model; the one real call is a smoke test that is skipped without a key:

```bash
scripts/with-env.sh pnpm --filter @superdoc-history/server exec vitest run src/insights/topics-llm.smoke.test.ts
```

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
| `pnpm test:unit` | `libs/types` (7), `libs/history`, `apps/server` (real HTTP, real SQLite, real WebSocket; the 150 ms timeline latency budget is asserted only when `CI` is unset) and `apps/web` (Vitest and Testing Library) |
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

**LLM use.** This codebase is developed with Claude Code (Anthropic) driving the harness in this repository. Every pull request is built by developer sub-agents, tested by a separate tester sub-agent with Playwright MCP and reviewed by a reviewer sub-agent; decisions are recorded in ADRs. The product itself calls a model in two places: topic names for a document and one sentence per topic, through the Vercel AI SDK and OpenRouter with `openai/gpt-6-luna` ([ADR 0006](docs/adr/0006-llm-via-vercel-ai-sdk.md)). Only author names and block text are sent, capped at 500 characters per block; without a key the features degrade to a `failed` state instead of failing the page.

**Starter code.**

- shadcn/ui components (MIT) copied under `apps/web/src/components/ui`
- superpowers skills (MIT, version 6.4.1) vendored under `.agents/skills`
- Drizzle schema generated by the Better Auth CLI at `apps/server/src/database/schema/auth.ts`

## License

No license yet. The repository is private until delivery.
