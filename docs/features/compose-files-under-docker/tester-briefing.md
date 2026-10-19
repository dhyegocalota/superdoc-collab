# Tester briefing: Compose files under docker/

## What changed

- `deploy/docker-compose.yml` is now `docker/docker-compose.yml`; the root `docker-compose.yml` is now `docker/docker-compose.local.yml`. Both build with the repository root as context (`..`); the local file reads `${ENV_FILE:-../.env}`.
- `deploy/` is gone; `.dockerignore`, `scripts/verify.sh`, `scripts/verify.test.sh`, `scripts/verify-gates.tsv`, HARNESS image proof, README, install guide, agent install, deploy runbook and `.env.example` follow.
- Repository-shape tests pin the new paths and the root entry list.

## Deviation from the spec

Compose resolves `.env` and a relative `env_file` from the compose file's folder, so the documented local commands differ from the spec: the README passes `ENV_FILE=../.env.example`, and the install guide and agent install pass `--env-file .env` on `up` and `down -v`. Without it `config` fails with `required variable APP_ORIGIN is missing a value`.

## Run

```bash
pnpm --filter @superdoc-collab/server exec vitest run src/repository-shape
bash scripts/verify.test.sh
APP_ORIGIN=http://localhost:3000 SEED_DEMO_USERS=false AUTH_SECRET=x docker compose -f docker/docker-compose.yml config
ENV_FILE=../.env.example APP_ORIGIN=http://localhost:3000 SEED_DEMO_USERS=true docker compose -f docker/docker-compose.local.yml config
```

## Red today, green after

Commit d071f1f1 is red: ENOENT on `docker/docker-compose.yml` and `docker/docker-compose.local.yml`, and `expected [ 'deploy', 'docker-compose.yml' ] to deeply equal []` in the root entry test. Green at e12834e3.

## Hypotheses

- Both `config` outputs print `context:` as the repository root and `dockerfile: docker/Dockerfile`.
- `docker compose -f docker/docker-compose.local.yml up --build -d` with the README environment starts the app on port 3000.
- Dokploy with Compose Path `./docker/docker-compose.yml` builds the same image.

## Gaps

- The image build and a real `up` were not run; no Docker daemon was used.
- Historical feature folders (`docs/features/deploy/{spec,plan,test-plan,tester-briefing}.md`), ADRs and learnings keep the old paths.
