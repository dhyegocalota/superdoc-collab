# Deploy — spec

Moved to `apps/server/src/repository-shape/` on 2026-10-17 (refinement-structure): the tests cited below as `apps/server/src/deploy/` and `apps/server/src/testing/repository-files.ts` live there now.

- Status: Approved on the owner's behalf (overnight authorization recorded in the slice 3 ledger, 2026-10-16): everything is prepared in the repository; the Dokploy click, the domain and the repo-public switch stay with the owner in the morning (the Dokploy API tokens answer 403 from this machine).
- Tier: red (production, secrets, public exposure) — one ADR, a runbook, a rollback path.
- Owner approval: approved 2026-10-16 (on the owner's behalf under the overnight authorization; decisions table below).
- ADRs: [0004](../../adr/0004-stack.md) (single process, SQLite on disk), [0008](../../adr/0008-vertical-slices.md), [0011](../../adr/0011-process-wide-llm-cost-caps.md), [0013](../../adr/0013-deploy-with-dokploy-compose.md) (new: Dokploy compose deployment, secrets from the Dokploy environment, one instance, named volume).
- Not changing: application code paths, auth, storage format, the local `docker-compose.yml` developer flow.

## Problem

The take-home asks for a deployed demo URL plus the repository. The app already builds into one image (`docker/Dockerfile`, health at `GET /api/health`), but nothing describes how it runs on the owner's VPS behind Traefik through Dokploy, the compose file is developer-shaped (`env_file`, `ports`), CI never builds the image, and the README has no deploy or delivery section.

## Goals

1. A production compose file Dokploy can deploy from the GitHub repository without edits: service `app` built from `docker/Dockerfile`, `expose: 3000` (no host `ports`), a named volume at `/data` for `DATABASE_DIR`, `restart: unless-stopped`, the image healthcheck, and every secret read from the Dokploy environment (nothing from a file in the repo).
2. A runbook in the README and `docs/features/deploy/runbook.md` that an owner can follow in ten minutes: create the compose service in Dokploy from the repo, set the environment (the exact variable list with the production values that are not secrets, and how to generate `AUTH_SECRET`), attach the domain with HTTPS, deploy, verify `GET /api/health` and the sign-in page, seed the demo accounts, roll back to the previous deployment.
3. CI proves the image builds: a `docker` job in `verify.yml` that builds (no push) with the GitHub Actions cache, so a broken Dockerfile fails the PR.
4. The delivery README: demo URL placeholder the owner fills, GitHub link, what to try first (demo accounts, the sample DOCX, the timeline, time travel, Summarize edits), LLM and starter-code citations (already present, moved under a "Credits" heading), honest limits (single instance, LLM caps, no email), how to run locally and with Docker.
5. Production defaults recorded as decisions: `TRUST_PROXY=true` (Traefik sets `X-Forwarded-For`), `SEED_DEMO_USERS=true` with a non-default `DEMO_PASSWORD` set by the owner and shared only in the delivery message, `LLM_MODEL=openai/gpt-6-luna`, the LLM caps at their defaults, `APP_ORIGIN=https://<domain>`.

## Non-goals

- Running the deploy from this session (no working Dokploy token; no Docker daemon able to pull images here).
- Multi-instance, managed databases, object storage, email (the brief forbids managed third-party services except the LLM provider).
- Pushing images to a registry (Dokploy builds from the repository).

## Design

### Files

- `deploy/docker-compose.yml` — the Dokploy compose: service `app`, `build: { context: .., dockerfile: docker/Dockerfile }`, `expose: ["3000"]` (no host `ports`), named volume `superdoc-data:/data`, `restart: unless-stopped`, the image healthcheck inherited. It pins `PORT=3000`, `DATABASE_DIR=/data`, `WEB_DIST_DIR=/app/web` and `TRUST_PROXY=true`; it reads `APP_ORIGIN`, `AUTH_SECRET` and `SEED_DEMO_USERS` as required `${VAR:?}` and the optional keys as `${VAR-}` from the Dokploy environment. No `env_file`, no secret value in the file.
- `docs/features/deploy/runbook.md` — the runbook (single source), linked from the root README.
- `.github/workflows/verify.yml` — new job `docker` (`docker/setup-buildx-action`, `docker/build-push-action` with `push: false`, `load: true`, `cache-from/to: type=gha`), independent of the `verify` job, that also boots the image: it refuses to seed without `DEMO_PASSWORD`, answers `GET /api/health` 200 on a named volume owned by uid 1000, serves the SPA, signs a seeded user in, then restarts the container and checks that seeding is idempotent. The `verify` job's `pnpm test:unit` step sets `REQUIRE_DOCKER_COMPOSE=true`.
- `docker/Dockerfile` — the workspace manifests are copied before the sources so the install layer is cached; `pnpm deploy` writes to `/workspace/release`, because a repository folder named `deploy/` now exists and `pnpm deploy` refuses a non-empty target; `.dockerignore` gains `deploy`. `docker/entrypoint.sh` accepts `SEED_DEMO_USERS` only as `true` or `false`, requires `DEMO_PASSWORD` only when it is `true`, and otherwise exits 1 with the variable named.
- `README.md` — "Live demo", "Try it", "Run locally", "Run with Docker", "Deploy (Dokploy)", "Limits", "Credits" (renamed from "Citations", text unchanged); the stale "Status" section is removed.
- `.env.example` — production notes next to each variable (which ones are secrets, which are fixed in production).
- `docs/adr/0013-deploy-with-dokploy-compose.md`.

### Data flow

```
GitHub repo (main) ──Dokploy compose service (deploy/docker-compose.yml)──▶ build docker/Dockerfile ──▶ container :3000
Traefik (Dokploy) ── https://<domain> ──▶ app (TRUST_PROXY=true, APP_ORIGIN=https://<domain>)
volume superdoc-data ──▶ /data (SQLite WAL + documents/*.docx + snapshots)
Dokploy environment ──▶ APP_ORIGIN, AUTH_SECRET, SEED_DEMO_USERS, DEMO_PASSWORD, OPENROUTER_API_KEY, LLM_MODEL, (OPENROUTER_BASE_URL, LLM_MAX_*); the compose file pins PORT=3000, DATABASE_DIR=/data, WEB_DIST_DIR=/app/web, TRUST_PROXY=true
```

### Failure handling

| Case | Behaviour |
|------|-----------|
| Missing or invalid environment | the server refuses to start with the variable named (existing behaviour); the runbook lists every variable |
| `SEED_DEMO_USERS=false` | the entrypoint skips seeding and does not require `DEMO_PASSWORD` |
| `SEED_DEMO_USERS` unset or not exactly `true`/`false` | the entrypoint exits 1 with `SEED_DEMO_USERS must be true or false, received: '<value>'` before the server starts |
| `SEED_DEMO_USERS=true` without `DEMO_PASSWORD` | the entrypoint exits 1 with `Missing environment variable: DEMO_PASSWORD (required when SEED_DEMO_USERS=true)` before Node runs |
| Image build broken | CI `docker` job fails the PR |
| Bad deploy | Dokploy rollback to the previous deployment (runbook step); data stays in the volume |
| Health failing | the container stays up but unhealthy: `restart: unless-stopped` restarts on exit only, never on a failing health check. Traefik stops routing to an unhealthy or still-starting container, so the domain answers 404 until it is healthy, including the first ~20 s after each deploy. The runbook's Logs step and `docker inspect` are the diagnosis |

### Security

- No secret in the repository: compose lists keys only; `.env.example` keeps empty values for real secrets; the runbook says how to generate `AUTH_SECRET` (`openssl rand -base64 48`). Before the repository goes public, the runbook scans the whole history for OpenRouter keys and committed `.env` files.
- `TRUST_PROXY=true` only in production behind Traefik (documented NB already in `.env.example`).
- Demo accounts carry a password the owner chooses; the README never prints it.

## Open questions → answers

| Question | Options | Answer | Date |
|----------|---------|--------|------|
| Who deploys | this session via Dokploy API · owner clicks | owner clicks (tokens 403); everything else prepared | 2026-10-16 |
| Compose shape | one file for both · separate production file | separate `deploy/docker-compose.yml`; local file unchanged | 2026-10-17 |
| Image build proof | none · CI build job · push to registry | CI build job, no push | 2026-10-17 |
| Demo users in production | off · on with the default password · on with an owner password | on, owner-set `DEMO_PASSWORD` shared privately | 2026-10-17 |

## Test strategy summary

- `apps/server/src/deploy/compose.test.ts` runs inside `pnpm test:unit`. Its file-only checks always run; the checks that render `docker compose -f deploy/docker-compose.yml config --format json` (Docker CLI only, no daemon) are skipped, visibly, without the Docker CLI, and required in CI through `REQUIRE_DOCKER_COMPOSE=true` on the `verify` job: no host `ports`, the pins, the volume, secrets from the environment, a refusal without each required variable.
- Entrypoint unit check: a shell test (or a vitest spawning `sh`) that `SEED_DEMO_USERS=false` without `DEMO_PASSWORD` does not exit non-zero before `main.js`.
- CI `docker` job green on the PR.
- README links resolve (a tiny script or test that every relative link in README and the runbook exists).
- Tester: follows the runbook against a local compose with `TRUST_PROXY=true` behind a local Traefik or Caddy if Docker works on the machine; otherwise `BLOCKED` with the reason and the owner performs the morning deploy as the acceptance.
