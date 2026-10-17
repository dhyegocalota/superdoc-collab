# Tester briefing: bootstrap and auth

Written by the developer sub-agents when their steps are done. The developers do not run `test-plan.md` and do not declare the feature works.

## What changed

- `libs/types` — shared schemas (sign-in, sign-up, environment)
- `apps/server` — Hono and Hocuspocus on one port, Better Auth on SQLite through Drizzle, rate limiting, `/api/me`, `/api/health`, static serving of the SPA from `WEB_DIST_DIR`, `pnpm seed`
- `apps/web` — Vite and React SPA with sign-in, sign-up, protected `/documents` and sign-out (details in the Task 7 section)
- `e2e/` and `playwright.config.ts` — seven Playwright specs; the config builds, seeds and starts the server itself
- `docker/`, `docker-compose.yml` — single-image build, entrypoint that can seed demo users, healthcheck
- `.github/workflows/verify.yml` — typecheck, unit and E2E on pull requests and pushes to `main`
- `README.md` — run instructions, demo users, citations

## How to run

```bash
cp .env.example .env
pnpm install
set -a; source .env; set +a
pnpm seed
pnpm dev
```

Web on <http://localhost:5173>, server on <http://localhost:3000>. Demo users `ana`, `bruno`, `caio`, `dani` at `@example.com`, password `superdoc-demo`.

| Layer | Command | Notes |
|---|---|---|
| Typecheck | `pnpm typecheck` | includes the E2E project |
| `libs/types` unit | `pnpm --filter @superdoc-collab/types test:unit` | 3 tests |
| Server unit and integration | `pnpm --filter @superdoc-collab/server test:unit` | 45 tests, real HTTP, real SQLite, real WebSocket |
| Web unit | `pnpm --filter @superdoc-collab/web test:unit` | 13 tests |
| E2E | `pnpm test:e2e` | builds web and server, seeds, starts the server; needs `pnpm exec playwright install chromium` |
| Docker | `ENV_FILE=.env.example APP_ORIGIN=http://localhost:3000 SEED_DEMO_USERS=true docker compose up --build -d` | served on <http://localhost:3000>; `docker compose down -v` resets |

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `libs/types` unit (3) | the package did not exist | schemas validate and reject as specified |
| `apps/server` unit and integration (45) | the server did not exist | auth, rate limit, socket guard, health and static serving behave as specified |
| `apps/web` unit (13) | the web app did not exist | next-path sanitising and the sign-in form behave as specified |
| `e2e/auth.spec.ts` (7) | no app to drive | sign-up, sign-in, protection, sign-out and two users pass; green twice in a row |

## Hypotheses to attack

Every "it works" is a hypothesis the tester tries to break.

1. Hypothesis: the fourth sign-in attempt within ten seconds is rate limited and the message shows the seconds. Break it by: failing four times from one client, then waiting out the window; try other emails from the same address.
2. Hypothesis: the collaboration socket rejects a missing, foreign-origin or deleted session. Break it by: connecting with no cookie, with a valid cookie and a different `Origin`, and with a cookie whose session was deleted after sign-out.
3. Hypothesis: signing in from `/sign-in?next=/documents` lands on `/documents`. Break it by: `next=//evil.example`, `next=https://evil.example`, `next=/\\evil.example`, encoded variants.
4. Hypothesis: sign-out lands on exactly `/sign-in` with no redirect loop. Break it by: signing out from a deep link, with a stale tab open, and pressing Back afterwards.
5. Hypothesis: at 375 px width no screen scrolls horizontally. Break it by: sign-in, sign-up and `/documents` at 375 px and 320 px with long error messages.
6. Hypothesis: the Docker image serves the SPA and the seed runs inside the container. Break it by: a cold `docker compose up --build`, a deep link such as `/documents`, restart with the volume kept, then `down -v`.
7. Hypothesis: static serving cannot escape `WEB_DIST_DIR`. Break it by: `/..%2f`, `/%2e%2e/`, double encoding and absolute paths against `/`.

## Known gaps

- No password reset or email verification.
- No dark-mode switch in the UI.
- `TRUST_PROXY=true` is safe only behind a proxy that overwrites `X-Forwarded-For`; the deploy slice owns that.
- Better Auth's `/get-session` still returns the session token in its body; the web app uses `/api/me` only.
- CI (`verify.yml`) has not run on GitHub yet; it was only validated as YAML.

## Task 7: web app scaffold, design tokens and auth flow

**Changed:** new `apps/web` (Vite + React + Tailwind + shadcn). Auth pages in `apps/web/src/features/auth/`, `documents-page.tsx` in `apps/web/src/routes/`, tokens in `apps/web/src/styles/globals.css`.

**Run:** `pnpm dev` (server on 3000, web on Vite with `/api` and `/collaboration` proxied); `pnpm --filter @superdoc-collab/web build` writes `apps/web/dist`. Unit: `pnpm --filter @superdoc-collab/web test:unit`.

**Red before, green after:** `safe-next-path.test.ts` (6 cases), `sign-in-page.test.tsx` (3 cases).

**Hypotheses for the tester:**
- `/documents` without a session redirects to `/sign-in?next=%2Fdocuments`; after sign-in the user lands on `next`; `next=//evil.example` lands on `/documents`.
- A wrong password shows exactly "Invalid email or password." on the form, never a specific reason.
- After the rate limit trips, the form shows "Too many attempts. Try again in N seconds." using `X-Retry-After`.
- Sign-out returns to `/sign-in` and `/documents` redirects again.
- Reload on `/documents` keeps the session (cookie, `GET /api/me`).

**Gaps:** no unit test for sign-up, the 429 message or sign-out; dark mode tokens exist but nothing toggles `.dark`; the production bundle is one 580 kB chunk.
