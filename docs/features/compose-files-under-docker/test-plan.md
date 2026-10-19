# Test plan: Compose files under docker/

- [x] `vitest run src/repository-shape` before the move — expected: red on the new paths (evidence: 13 failed, ENOENT `docker/docker-compose.yml`, root entries `[ 'deploy', 'docker-compose.yml' ]`)
- [x] `vitest run src/repository-shape` after the move — expected: green (evidence: 11 files, 124 tests passed)
- [x] `bash scripts/verify.test.sh` — expected: `verify: all checks passed`
- [x] `docker compose -f docker/docker-compose.yml config` with `APP_ORIGIN`, `SEED_DEMO_USERS=false`, `AUTH_SECRET` set inline — expected: resolves, build context is the repository root (evidence: `context: <repository root>`, `dockerfile: docker/Dockerfile`)
- [x] `ENV_FILE=../.env.example APP_ORIGIN=http://localhost:3000 SEED_DEMO_USERS=true docker compose -f docker/docker-compose.local.yml config` — expected: resolves with the repository root as context (evidence: `context: <repository root>`)
- [x] Plain `docker compose -f docker/docker-compose.local.yml config` with a root `.env` — expected: fails on `APP_ORIGIN`; with `--env-file .env` resolves (evidence: both observed; the documented commands pass `--env-file .env`)
- [ ] Image build through the `docker` gate — expected: green; owner-executed, the daemon is not available to developers
