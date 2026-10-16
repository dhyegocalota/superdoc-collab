# 0004. Technology stack

- Status: Accepted
- Date: 2026-10-16
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [POC results](../../poc/RESULTS.md), the take-home specification

## Context

Spec constraints: no third-party managed services except LLM providers; SuperDoc must read, show and update DOCX; DOCX under 10 MB; Docker is a bonus. The POC ran on SuperDoc 2.23.0, Hocuspocus 2.15.3 and `node:sqlite`.

## Decision

- Node 24: native `node:sqlite`, `@superdoc/sdk` native binaries, and Hocuspocus is Node.
- TypeScript; pnpm workspaces `apps/web`, `apps/server`, `libs/history`, `libs/types`.
- Hono and Hocuspocus in one process and port; Hono serves the built web app.
- SQLite in WAL mode, one file per concern: log, read model, auth.
- Drizzle with migrations. The `node:sqlite` driver is verified in the spike; Kysely or raw SQL is the fallback.
- Better Auth ([0005](0005-authentication-with-better-auth.md)).
- `worker_threads` with Piscina.
- React 19, Vite, TanStack Query, React Router.
- d3-shape (`stackOffsetWiggle`) and d3-scale rendered as React SVG.
- Vercel AI SDK ([0006](0006-llm-via-vercel-ai-sdk.md)).
- Vitest and Playwright.
- Docker Compose on the owner's VPS via Dokploy: Traefik for WSS, a volume for SQLite.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Next.js | Familiar | SuperDoc is client-only, so SSR buys nothing; WebSocket server and SQLite need one persistent process | Vite build + preview is the only combination proven with SuperDoc's worker |
| Bun | Fast runtime | Native binary risk | `@superdoc/sdk` ships native binaries |
| TanStack Router | Type-safe routing | Owner prefers React Router | Only three routes |
| Recharts / Chart.js | Quick charts | No streamgraph | Streamgraph is required |
| DuckDB | Analytical engine | Volume is too small | SQLite suffices |

## Consequences

- One deployable process serves HTTP, WebSocket and static assets.
- Database files are independent and individually backed up.
- The Drizzle driver choice depends on the spike outcome.

## Evidence

- The POC ran server, projection and tests on Node with `node:sqlite` and Vite build + preview ([POC results](../../poc/RESULTS.md)).

## Revisit when

- The `node:sqlite` Drizzle driver fails the spike.
- Deployment must run more than one server instance.

## Addendum 2026-10-16

Drizzle ships no driver for `node:sqlite`. The owner chose better-sqlite3 with Drizzle over `node:sqlite` with raw SQL (typed queries and drizzle-kit migrations outweigh one prebuilt native binary) and over Kysely (no official `node:sqlite` dialect). The POC libraries, written against `node:sqlite`, are rewritten to better-sqlite3 when ported in slice 2. The Hocuspocus server stays on 2.15.3, the version proven with SuperDoc 2.23 in the POC; 4.x changes the API and is a later task.
