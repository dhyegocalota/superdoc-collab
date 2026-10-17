# 0013. Deploy with a Dokploy compose service built from the repository

Moved to `apps/server/src/repository-shape/` on 2026-10-17 (refinement-structure): the tests cited below as `apps/server/src/deploy/` and `apps/server/src/testing/repository-files.ts` live there now.

- Status: Superseded by [0019](0019-deploy-on-railway.md) (the owner chose a host of their own before the first deploy)
- Date: 2026-10-16
- Deciders: Claude (lead, by delegated authority); Dhyego Calota (owner, to confirm at the first deploy)
- Inspired by: [0004](0004-stack.md) ("Docker Compose on the owner's VPS via Dokploy: Traefik for WSS, a volume for SQLite"), [0008](0008-vertical-slices.md) (slice 5 risks: WebSockets behind Traefik, SQLite volume, demo URL), [0011](0011-process-wide-llm-cost-caps.md), the brief (a deployed demo URL plus the repository; no managed services except LLM providers)

## Context

The app already builds into one image (`docker/Dockerfile`) that serves the SPA, the API and the collaboration WebSocket on port 3000, with all state in SQLite and DOCX files under `DATABASE_DIR`. The owner's VPS runs Dokploy, which fronts services with Traefik and Let's Encrypt. The local `docker-compose.yml` is developer-shaped: it publishes port 3000 on the host and reads an `env_file` that does not exist on a server. Dokploy's API tokens answer 403 from the build machine and its Docker daemon cannot pull images, so the deploy is a set of files plus a runbook the owner follows; CI is the only place the image is built and booted before then.

## Decision

- A second compose file, `deploy/docker-compose.yml`, is the production definition. Dokploy deploys it as a **Compose** service from the GitHub repository (branch `main`, compose path `./deploy/docker-compose.yml`) and builds `docker/Dockerfile` with the repository root as context. The local `docker-compose.yml` stays as it is.
- One service, `app`, one replica. `expose: ["3000"]` and no host `ports`; Dokploy's Domains tab attaches the Traefik labels and network, terminates HTTPS and forwards the WebSocket upgrade.
- State lives on the named volume `superdoc-data` at `/data`. A fresh named volume copies the image's `/data`, owned by `node` (uid 1000), so the server can write; bind mounts are not used.
- The compose file pins the values that must agree with the image and the proxy: `PORT=3000`, `DATABASE_DIR=/data`, `WEB_DIST_DIR=/app/web`, `TRUST_PROXY=true`. It reads `APP_ORIGIN`, `AUTH_SECRET` and `SEED_DEMO_USERS` as required (`${VAR:?}`, so a missing one stops the deploy before a container starts) and the optional keys as `${VAR-}` (unset becomes empty, which the server already treats as absent). No secret value and no `env_file` are in the repository; Dokploy's Environment tab holds them.
- Production values: `SEED_DEMO_USERS=true` with an owner-chosen `DEMO_PASSWORD` shared only in the delivery message; `LLM_MODEL=openai/gpt-6-luna`; the language-model caps at their ADR 0011 defaults; `AUTH_SECRET` from `openssl rand -base64 48`; `APP_ORIGIN=https://<domain>`.
- The entrypoint accepts `SEED_DEMO_USERS` only as `true` or `false` and requires `DEMO_PASSWORD` only when it is `true`, failing with the variable named in the same words as the server's own environment errors.
- CI proves the image: a `docker` job builds it with the GitHub Actions cache (no push) and boots it on a named volume: refusal without `DEMO_PASSWORD`, health 200, the SPA served, `/data` owned by uid 1000, a seeded sign-in.
- `restart: unless-stopped` restarts the container when it exits, never because its health check fails; a container that stays up but unhealthy is left running, and Traefik stops routing to it until the check passes.
- Rollback is a code rollback: revert on `main` and deploy, or deploy a branch pinned at the last good commit. Data stays on the volume; migrations so far only add tables and columns.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Dokploy **Application** with the Dockerfile build type | Fewer files; Dokploy manages environment, domain and mounts in its UI | Volume, port and pinned values live only in the UI, invisible to review and CI | The compose file makes the production shape reviewable and testable |
| One compose file for local and production | One file | Local needs a host port and an env file; production must have neither | Each environment would carry the other's risks |
| Build in CI, push to GHCR, Dokploy pulls | Fast deploys, reproducible by digest | A registry credential on the VPS and a release workflow; a spec non-goal | More moving parts than a one-instance demo needs |
| Plain `docker compose` over SSH with Caddy for TLS | No platform | Hand-made TLS, no deploy history, no UI for the owner | Dokploy already runs on the VPS |
| `SEED_DEMO_USERS=false`; reviewers sign up | No shared password | Reviewers start alone, with no collaborator to try the timeline with | The demo is collaborative; a seeded team shows it in a minute |

## Consequences

- `TRUST_PROXY=true` is pinned, so the container must never be reachable except through Traefik; the compose file publishes no host port.
- A deploy without `APP_ORIGIN`, `AUTH_SECRET` or `SEED_DEMO_USERS` fails at `docker compose` with the variable named; with `SEED_DEMO_USERS=true` and no `DEMO_PASSWORD` the container exits and Dokploy's logs show why.
- The public `AUTH_SECRET` placeholder in `.env.example` passes the server's 32-character check; only the runbook and the notes in `.env.example` keep it out of production.
- A repository folder named `deploy/` now exists, so the build stage writes `pnpm deploy` output to `/workspace/release` (`pnpm deploy` refuses a non-empty target) and `.dockerignore` excludes `deploy`.
- Dokploy reports a compose deploy as done when `docker compose up -d` returns, not when the container is healthy. Traefik skips a container whose health check is starting or failing, so the domain answers 404 for the first ~20 s after every deploy, and for as long as the check fails (from memory; the runbook documents the signal).
- One instance only (ADR 0004): caps, cooldowns and SQLite assume one process. Backups are a manual copy of the stopped volume.
- The Dokploy screens in the runbook are written from memory and marked so; the owner confirms them at the first deploy.

## Evidence

- `apps/server/src/deploy/compose.test.ts` renders the file with `docker compose config --format json`: no host port, the pins, the volume, secrets from the environment, a refusal without each required variable. `entrypoint.test.ts` and `dockerfile.test.ts` pin the entrypoint and the build layout; the `docker` job in `.github/workflows/verify.yml` builds and boots the image.
- `ERR_PNPM_DEPLOY_DIR_NOT_EMPTY` reproduced with pnpm 8.15.9 on 2026-10-16 by deploying into a folder that held a `docker-compose.yml`.

## Revisit when

- A second instance, a managed database or object storage is needed; Dokploy changes how compose services read their environment; or the demo moves off the owner's VPS.
