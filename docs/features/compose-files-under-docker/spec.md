# Compose files under docker/

**Status:** Approved
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (owner's request, translated: "move deploy/docker-compose to docker/; move the root docker-compose to docker too, maybe with a dev name if it is the dev one")
**ADRs:** [0013](../../adr/0013-deploy-with-dokploy-compose.md) (unchanged; its file path is historical)
**Not changing:** the content of either compose file beyond the paths that move with them, the Dockerfile, the Railway deployment

## Change

- `deploy/docker-compose.yml` → `docker/docker-compose.yml` (the production compose Dokploy deploys). `build.context` becomes `..` and `dockerfile` stays `docker/Dockerfile` (relative to the context). The `deploy/` folder disappears; `.dockerignore` drops its `deploy` line.
- Root `docker-compose.yml` → `docker/docker-compose.local.yml` (the "Run with Docker" compose of the README; it is a local run, not a dev loop, so `local`, not `dev`). `build.context` becomes `..`; `env_file` becomes `${ENV_FILE:-../.env}`.
- Every reference follows: README Quick install (`docker compose -f docker/docker-compose.local.yml up`), `docs/install.md`, `docs/agent-install.md`, `docs/architecture.md`, `docs/features/deploy/runbook.md` (Compose Path `./docker/docker-compose.yml`), `.env.example` comment, `scripts/verify.sh`, `scripts/verify.test.sh`, `scripts/verify-gates.tsv` (drop the `deploy/*` and root `docker-compose*.yml` rows; `docker/*` already maps to the docker gate), `.github/workflows/*.yml`, and the repository-shape tests (`repository-files.ts`, `delivery-docs.test.ts` root entries, `readme-run-block.test.ts`). ADRs and dated learnings keep their historical paths.

## Test list

- Repository-shape tests pin the new paths and the absence of `deploy/` and a root compose file.
- `docker compose -f docker/docker-compose.local.yml config` and `docker compose -f docker/docker-compose.yml config` resolve (no daemon needed) with the build context at the repository root.
- `pnpm verify --plan` on the diff lists the docker gate.
