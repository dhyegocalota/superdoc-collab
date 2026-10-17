# @superdoc-history/server

One Node process on one port: Hono serves the REST API and the built SPA, Hocuspocus serves the collaboration WebSocket, and two worker threads run the projection and the language-model jobs ([ADR 0004](../../docs/adr/0004-stack.md)).

## Commands

Run from the repository root with `pnpm --filter @superdoc-history/server <script>`.

| Script | Does |
|---|---|
| `dev` | `tsx watch src/main.ts`; reads its configuration from the shell (`scripts/with-env.sh` loads `.env`) |
| `build` | tsup bundles `main`, `seed` and `projection-worker` into `dist/`, inlining `@superdoc-history/types` and `@superdoc-history/history`; `better-sqlite3` and `@superdoc/sdk` stay external |
| `start` | `node dist/main.js` |
| `seed` | creates the demo users; idempotent, existing accounts keep their password |
| `typecheck` | `tsc --noEmit` |
| `test:unit` | Vitest against real HTTP, real SQLite and a real WebSocket |

## Layout

| Folder | Holds |
|---|---|
| [`src/http/`](src/http/) | the Hono app, health, `me`, the signed-in guard, client address behind a proxy, the static SPA |
| [`src/auth/`](src/auth/) | Better Auth, sessions and the demo-user seed ([ADR 0005](../../docs/adr/0005-authentication-with-better-auth.md)) |
| [`src/documents/`](src/documents/) | document routes and repository, roles, share links, DOCX storage on local disk |
| [`src/collaboration/`](src/collaboration/) | Hocuspocus, member authentication on the socket, identity declarations, read-only version rooms |
| [`src/history/`](src/history/) | the projection worker and its throttle, timeline, events and versions routes |
| [`src/insights/`](src/insights/) | topics, per-topic sentences and selection summaries, the LLM client, prompts, cooldowns and the process-wide caps ([ADR 0011](../../docs/adr/0011-process-wide-llm-cost-caps.md)) |
| [`src/database/`](src/database/) | the `auth.sqlite` connection, migrations and Drizzle schema; generated migrations live in [`drizzle/`](drizzle/) |
| [`src/config/`](src/config/) | environment parsing and validation |
| [`src/testing/`](src/testing/) | test server, collaboration, events and timeline clients, the mocked language model |
| [`src/repository-shape/`](src/repository-shape/) | checks on repository files: CI workflows, compose, Dockerfile, entrypoint and the links in every README |

The update log, the projection and the read model live in [`libs/history`](../../libs/history/).

## Configuration

`PORT`, `APP_ORIGIN`, `AUTH_SECRET` (at least 32 characters), `DATABASE_DIR` and `TRUST_PROXY` (`true` or `false`) are required. `WEB_DIST_DIR` serves a built SPA from the same port. `LLM_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `LLM_MAX_CONCURRENT_JOBS` and `LLM_MAX_CALLS_PER_HOUR` configure the model; without a key the insights degrade to `failed`. `seed` also reads `DEMO_PASSWORD`. [`.env.example`](../../.env.example) documents every variable.
