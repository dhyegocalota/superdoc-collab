# Tester briefing: Deploy

Moved to `apps/server/src/repository-shape/` on 2026-10-17 (refinement-structure): the tests cited below as `apps/server/src/deploy/` and `apps/server/src/testing/repository-files.ts` live there now.

Written by the lead after the single lane finished. Nobody on the build side ran `test-plan.md` or declares the deployment works; the owner performs the first real deploy in the morning and ticks the OWNER boxes.

## What changed

- `docker/entrypoint.sh` — `SEED_DEMO_USERS` must be exactly `true` or `false`; `DEMO_PASSWORD` is required only when it is `true`; migrations run inside the seed; `exec node dist/main.js` at the end.
- `docker/Dockerfile`, `.dockerignore` — the five workspace manifests, lockfile and workspace file are copied before `COPY . .` (cached install layer); `pnpm deploy` writes to `/workspace/release` (a repository folder named `deploy/` would collide with the old target); `deploy/` excluded from the build context.
- `deploy/docker-compose.yml` — the Dokploy compose: `expose: 3000` (no host port), named volume `superdoc-data` at `/data`, `restart: unless-stopped`, pinned `PORT`/`DATABASE_DIR`/`WEB_DIST_DIR`/`TRUST_PROXY=true`, required variables with `${X:?message}`, optional ones empty.
- `apps/server/src/deploy/*.test.ts` — entrypoint, Dockerfile order, compose rendering (skips visibly without the Docker CLI; throws under `REQUIRE_DOCKER_COMPOSE=true`), CI workflow pins, README/runbook link and section checks, `.env.example` secret notes.
- `.github/workflows/verify.yml` — `permissions: contents: read`; the `verify` job's unit step sets `REQUIRE_DOCKER_COMPOSE=true`; a new `docker` job builds the image with the Actions cache (no push), boots it, asserts the refusal without `DEMO_PASSWORD`, health 200, the SPA, `/data` owned by uid 1000, a seeded sign-in, then restarts the container and asserts `existing: ana@example.com` and a second sign-in.
- `docs/features/deploy/runbook.md` — the owner's morning steps (Dokploy screens marked "from memory, verify in the UI"), the environment table, `AUTH_SECRET` generation, Cloudflare "DNS only", the health/Traefik 404 window, the git-history secret scan before going public, rollback, backup and restore.
- `README.md` — Live demo (placeholder the owner fills), Try it, Run locally, Run with Docker, Deploy (Dokploy), Demo users, Tests, Architecture in brief, Process, Limits, Credits, License.
- `.env.example` — production notes per variable (which are secrets, which are fixed in production), values unchanged.
- `docs/adr/0013-deploy-with-dokploy-compose.md`.

## How to run

- Automated: `pnpm typecheck`, `pnpm test:unit` (the compose rendering block runs when `docker compose version` works; on this laptop the CLI exists but the daemon cannot pull images, so never run `docker build`/`docker compose up` here), `pnpm test:e2e` unchanged from slice 4.
- CI: the PR's `verify` and `docker` jobs are the evidence for the CI boxes (run id and job URL in the evidence line).
- Entrypoint by hand: `SEED_DEMO_USERS=maybe sh docker/entrypoint.sh` must refuse with the exact message; `SEED_DEMO_USERS=true` without `DEMO_PASSWORD` must refuse; `SEED_DEMO_USERS=false` must reach `node dist/main.js` (it may then fail on missing server variables — that is the server's own refusal, not the entrypoint's).
- Compose: `docker compose -f deploy/docker-compose.yml --env-file /dev/null config` with the required variables exported renders; without `AUTH_SECRET` it fails with the `required variable AUTH_SECRET is missing a value` message.
- OWNER boxes (morning): follow the runbook; health 200 through the domain; sign-in; seed; timeline; `docker ps` shows `3000/tcp` with no `0.0.0.0:` mapping; rollback once; history scan before making the repository public.

## Red today, green after

Every task committed its failing tests alone (`git log --oneline main..HEAD`); the red counts are in each `.superpowers/sdd/plan-deploy/task-N-report.txt`.

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `apps/server/src/deploy/entrypoint.test.ts` | the old entrypoint accepted any flag and required `DEMO_PASSWORD` always | strict flag, password only when seeding |
| `apps/server/src/deploy/dockerfile.test.ts` | manifests copied after `COPY . .`; target `/workspace/deploy` | cached layer; `/workspace/release` |
| `apps/server/src/deploy/compose.test.ts` | no `deploy/docker-compose.yml` | the Dokploy compose |
| `apps/server/src/deploy/ci-workflow.test.ts` | no `docker` job, no `REQUIRE_DOCKER_COMPOSE`, no `permissions` | the new job and flags |
| `apps/server/src/deploy/readme-links.test.ts` (name may differ) | stub runbook, missing sections, a missing anchor | the runbook and README sections |

## Hypotheses to attack

1. Hypothesis: no secret or real value lives in the repository. Break it by: `git grep -n "sk-or-"`, `git log -p --all -S "sk-or-v1-"`, grepping `AUTH_SECRET=`/`DEMO_PASSWORD=` with values across all refs, reading `deploy/docker-compose.yml` and `.env.example`.
2. Hypothesis: the entrypoint cannot start the server in a half-configured state. Break it by: `SEED_DEMO_USERS=TRUE`, `=1`, empty, unset; `DEMO_PASSWORD` set to an empty string; a password containing `$`, ` #` or quotes (the runbook forbids them — confirm the refusal or the documented caveat).
3. Hypothesis: the production compose cannot publish a host port or read a local `.env`. Break it by: rendering with `--env-file /dev/null` and inspecting `ports`; placing a stray `.env` next to `deploy/` and rendering again.
4. Hypothesis: the CI `docker` job proves the image boots and seeds idempotently. Break it by: reading the job log for the refusal step, the health poll, the `existing:` line after the restart; check its wall time is under the 20-minute cap.
5. Hypothesis: every README/runbook link and anchor resolves. Break it by: renaming a heading locally and running the checker; checking a link inside a fenced block is not required to resolve.
6. Hypothesis: the runbook's claims match the code. Break it by: comparing every quoted message and variable with `apps/server/src/config/environment.ts`, `docker/entrypoint.sh` and the compose.

## Known gaps

- The Docker image is built and booted only by CI and by the owner's deploy; nothing on this laptop can pull images.
- Dokploy UI steps are from memory; the owner verifies them in the UI.
- The compose rendering tests need the Docker CLI with Compose v2; without it they skip visibly (CI requires them).
- A failing health check never restarts the container (`restart: unless-stopped` restarts on exit only); Traefik skips the container while unhealthy.
