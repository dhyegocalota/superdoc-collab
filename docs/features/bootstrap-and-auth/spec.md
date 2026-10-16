# Bootstrap and auth

**Status:** Approved
**Tier:** 🔴
**Owner approval:** approved 2026-10-16
**ADRs:** [0004](../../adr/0004-stack.md) stack · [0005](../../adr/0005-authentication-with-better-auth.md) auth · [0008](../../adr/0008-vertical-slices.md) slices · [0009](../../adr/0009-design-system.md) design system
**Not changing:** `poc/` stays as it is and stays green; no documents, no SuperDoc, no history code yet (slice 2); no deployment to the VPS yet (slice 5), only the local Compose.

## Problem

Nothing exists outside the proof of concept. Every later slice needs a workspace that typechecks, tests and builds in one command, a server process that will host both HTTP and the collaboration socket, a web app with the agreed design system, real sign-in, and a session that the collaboration socket can trust. Getting these wrong late is expensive; getting them right now is cheap and demonstrable: a person signs up, signs in, lands on an empty workspace, signs out.

## Goals

1. One pnpm workspace: `apps/web`, `apps/server`, `libs/types`; `pnpm typecheck`, `pnpm test:unit`, `pnpm test:e2e`, `pnpm build`, `pnpm dev` work from the root.
2. `apps/server`: Hono on `@hono/node-server`, Hocuspocus attached to the **same HTTP server and port** on the `/collaboration` path, SQLite through `node:sqlite`, configuration validated at boot.
3. `apps/web`: React 19 + Vite + TanStack Query + React Router, Tailwind + shadcn/ui with the token set from ADR 0009, routes `/sign-in`, `/sign-up`, `/documents` (protected, empty state for now).
4. Better Auth with email and password, sessions in SQLite, built-in rate limiting on credential endpoints, generic error on bad credentials.
5. Collaboration socket trusts the same session: `onAuthenticate` resolves the Better Auth session from the upgrade request and rejects anonymous or expired sessions. Proven with an integration test, not with a document.
6. Seeded demo users (Ana, Bruno, Caio, Dani) through an idempotent `pnpm seed`.
7. Dockerfile (multi-stage, one image, web built into the server's static dir) and `docker-compose.yml` with a volume for `/data`; `docker compose up` serves the app on one port.
8. GitHub Actions workflow running the `/verify` gate on every pull request.

## Non-goals

Password reset, email verification, OAuth, user profiles, roles, document upload, any SuperDoc code, Dokploy configuration, dark-mode polish beyond tokens.

## Design

### Layout and why

```
apps/
  web/            Vite app. src/{app,routes,components/ui,features/auth,lib}. shadcn/ui components copied here.
  server/         Hono + Hocuspocus. src/{app.ts,server.ts,config,auth,collaboration,database,http,workers}
libs/
  types/          enums, constants and shared DTO types; no runtime dependencies
e2e/              Playwright specs that span web and server; the server is started by Playwright's webServer
docker/           Dockerfile, compose, entrypoint
.github/workflows/verify.yml
```

- `apps` vs `libs`: deployable processes versus code shared by them. `libs/history` arrives in slice 2 when the POC is ported, so it is not created empty now.
- E2E at the root, not inside `apps/web`: the specs exercise the server too, and later the multi-author harness from `poc/tests/harness.ts` moves here.
- One image, one port: Hocuspocus shares the HTTP server, so TLS and WebSocket upgrade are one Traefik route in slice 5 and the auth cookie is first-party for the socket.

### Data flow

```
browser ──POST /api/auth/sign-in/email──► Hono ──► Better Auth ──► SQLite (auth.sqlite)
        ◄── Set-Cookie: session (httpOnly, SameSite=Lax, Secure in prod) ──┘
browser ──GET /api/me──► Hono: session from cookie → {id, name, email}  |  401 when absent
browser ──WS /collaboration (cookie sent on upgrade)──► Hocuspocus.onAuthenticate
            → Better Auth getSession(headers) → context {userId}  |  reject when absent
```

### Configuration

`apps/server/src/config/environment.ts` parses `process.env` with zod at boot. Required variables have no fallback: a missing `AUTH_SECRET`, `DATABASE_DIR` or `APP_ORIGIN` stops the process with a named error. `.env.example` documents every variable. `DEMO_PASSWORD` is required only by `pnpm seed`.

### Databases

`DATABASE_DIR/auth.sqlite` opened with better-sqlite3 and Drizzle; the Better Auth tables come from the schema the Better Auth CLI generates for Drizzle, and drizzle-kit produces the committed SQL migrations, applied at boot. Later slices add `history.sqlite` and `read-model.sqlite` in the same directory, which is the Compose volume. One file per concern keeps WAL contention and backup scope separate.

### Session on the socket

The Hocuspocus provider is created with the same origin as the page, so the browser sends the session cookie on the WebSocket upgrade. `onAuthenticate` receives the upgrade request, builds `Headers` from it and calls Better Auth's `getSession`. No token is exposed to JavaScript. In slice 2 the same `context.userId` is the connection user for authorship (ADR 0002).

### Web app

- `AuthProvider` backed by TanStack Query (`['me']`); `RequireSession` wrapper redirects to `/sign-in` and back after login.
- Forms with react-hook-form + zod schemas shared with the server through `libs/types`.
- shadcn/ui components used: `button`, `input`, `label`, `card`, `form`, `toast`. Nothing else is added until a slice needs it.
- Tokens in `globals.css` per ADR 0009; light by default, `.dark` class switch ready.

### Failure handling

| Failure | Behaviour |
|---|---|
| Wrong email or password | Same 401 body for both; form shows one generic message |
| Rate limit hit | 429 with `Retry-After`; form shows "try again in N seconds" |
| Session expired while on `/documents` | `['me']` returns 401 → redirect to `/sign-in?next=/documents` |
| Socket without session | upgrade rejected; the provider's `onAuthenticationFailed` fires; no retry storm (provider configured not to reconnect on auth failure) |
| Missing environment variable | process exits with the variable name; Compose healthcheck fails visibly |
| SQLite directory missing | created at boot when `DATABASE_DIR` exists; otherwise named error |

### Interfaces

- `GET /api/health` → `{status: 'ok'}` (used by Compose healthcheck and CI).
- `GET /api/me` → `{user: {id, name, email}}` or 401.
- Better Auth routes under `/api/auth/*`.
- WebSocket `/collaboration` (Hocuspocus protocol), authenticated by cookie.
- `pnpm seed` → creates or updates the four demo users; prints their emails.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Auth mechanism | magic link · email+password (Better Auth) | email+password with Better Auth; magic link needs email delivery, a managed service | 2026-10-16 |
| Styling and components | Tailwind+shadcn/ui · Tailwind+Radix own · CSS Modules · Mantine/MUI | Tailwind + shadcn/ui | 2026-10-16 |
| Visual direction | coherent with SuperDoc · data-viz dark · own identity | coherent with SuperDoc | 2026-10-16 |
| Deployment target | own VPS via Dokploy · Fly.io · Railway/Render | own VPS via Dokploy; Compose shaped for it now | 2026-10-16 |
| Session on the socket | httpOnly cookie on upgrade (recommended) · short-lived socket ticket endpoint · token readable by JS | cookie on upgrade; same origin, nothing exposed to JS, one less endpoint | 2026-10-16 |
| CI | GitHub Actions · none | GitHub Actions running `/verify`; it is GitHub itself, not a third-party managed service, and it makes "tests pass" verifiable by the evaluator | 2026-10-16 |
| SQLite driver and data access | node:sqlite + raw SQL · better-sqlite3 + Drizzle · node:sqlite + Kysely | better-sqlite3 + Drizzle: typed queries and drizzle-kit migrations outweigh one native binary; Drizzle has no `node:sqlite` driver, so the POC libraries are rewritten to better-sqlite3 when ported in slice 2 | 2026-10-16 |
| Hocuspocus server version | 2.15.3 (proven with SuperDoc 2.23 in the POC) · 4.7 (latest, new API) | 2.15.3; the upgrade is its own task after slice 2 proves the port | 2026-10-16 |

## Test strategy summary

- Unit (Vitest): environment parsing fails on each missing variable with its name; seed is idempotent; `getSessionFromUpgradeRequest` resolves a valid cookie and rejects absent, malformed and expired ones; zod schemas shared by web and server reject the same inputs.
- Integration (Vitest, real server on a random port): sign-up → sign-in → `/api/me`; wrong password and unknown email return identical bodies; rate limit returns 429; a `ws` client connecting to `/collaboration` with the session cookie is authenticated, without it is rejected.
- E2E (Playwright specs in `e2e/`): sign-up, sign-in, protected redirect and return, sign-out, two users in two contexts see their own names, narrow viewport.
- Playwright MCP walk (tester): the whole flow as a new user and as a seeded user, unhappy paths, console and network clean, screenshots and video for the PR.
- Docker: `docker compose up` passes the healthcheck and serves `/sign-in`.
