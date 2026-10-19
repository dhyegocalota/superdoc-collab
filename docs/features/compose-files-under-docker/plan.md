# Plan: Compose files under docker/

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `apps/server/src/repository-shape/` (root entries, compose path, README run block)

## Steps

- [x] **Step 1:** pin the new paths first: `repository-files.ts`, the root entry list and the README run block (red: ENOENT on both compose files, root still holds `deploy` and `docker-compose.yml`). — evidence: d071f1f1
- [x] **Step 2:** move both compose files, set `build.context: ..`, `env_file: ${ENV_FILE:-../.env}`, drop `deploy` from `.dockerignore`, remove the `deploy/` folder. — evidence: e12834e3
- [x] **Step 3:** follow every reference: README, install guide, agent install, deploy runbook, `.env.example`, `scripts/verify.sh`, `scripts/verify.test.sh`, `scripts/verify-gates.tsv`, HARNESS image proof. — evidence: e12834e3
- [x] **Step 4:** both compose files resolve with `docker compose config`; repository-shape suite and `scripts/verify.test.sh` green. — evidence: test-plan.md

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | compose reads `.env` and relative `env_file` from the compose file's folder, so the root `.env` stops feeding `APP_ORIGIN` | `config` prints `required variable APP_ORIGIN is missing a value` | pass `--env-file .env` and `ENV_FILE=../.env.example` in the documented commands |

**Steps with no backout:** none.
