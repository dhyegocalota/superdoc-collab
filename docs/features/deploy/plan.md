# Deploy — implementation plan

Moved to `apps/server/src/repository-shape/` on 2026-10-17 (refinement-structure): the tests cited below as `apps/server/src/deploy/` and `apps/server/src/testing/repository-files.ts` live there now.

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Author this list with every box empty. A sub-agent ticks its own line with evidence. A wrong step is struck through with the reason, not deleted.

**Spec:** [docs/features/deploy/spec.md](spec.md)
**Tier:** 🔴
**Goal:** A production compose file Dokploy deploys from the repository without edits, an entrypoint that fails loudly on a bad seeding setup, a CI job that builds and boots the image, a ten-minute runbook, and a delivery README; the Dokploy click, the domain and the repository-public switch stay with the owner.
**Architecture:** `deploy/docker-compose.yml` is a second, production-only compose file (the local `docker-compose.yml` is untouched): one `app` service built from `docker/Dockerfile`, `expose: ["3000"]`, the named volume `superdoc-data` at `/data`, the values that must agree with the image and Traefik pinned, the rest interpolated from the Dokploy environment. The image gains a cached install layer and an output folder that no longer collides with the new `deploy/` folder; the entrypoint accepts the seeding flag only as `true` or `false`. A `docker` job in `verify.yml` builds with the GitHub Actions cache and boots the image on a named volume. Repository-level checks (compose rendering, entrypoint, Dockerfile shape, workflow, delivery documents) are Vitest suites under `apps/server/src/deploy/`, so `pnpm test:unit` runs them locally and in the CI `verify` job.
**Tech stack:** unchanged. Docker Compose v2 CLI (`docker compose config --format json`; verified locally on v2.13.0, no daemon or image pull needed), `docker/setup-buildx-action@v3`, `docker/build-push-action@v6`, Vitest 5.0.5, Node 24 `child_process`. No dependency is added; `pnpm-lock.yaml` does not change.
**Seam:** `docker/entrypoint.sh`, `docker/Dockerfile`, `.dockerignore`, the new `deploy/` folder, the `verify.yml` workflow, `README.md`, `.env.example`. No application code under `apps/*/src` changes except the new test folder `apps/server/src/deploy/` and the test helper `apps/server/src/testing/repository-files.ts`.
**Branch:** `feat/deploy`. Precondition: PR 4 (`feat/llm-insights`) is merged; then `git switch main && git pull && git switch -c feat/deploy`. Nothing in this plan runs on `feat/llm-insights`.

**Assumptions (decided, owner can override):**
- **This machine's Docker daemon cannot pull images** (the slice 3 test plan recorded `DeadlineExceeded` on `node:24-bookworm-slim`). No task depends on a local `docker build` or `docker run`. `docker compose config` is client-side and works here. The CI `docker` job is the build and boot proof; the owner's morning deploy is the acceptance.
- Task order differs from a naive "compose first": **the Dockerfile fix lands in Task 1, before the compose file in Task 2.** The build stage runs `pnpm deploy … /workspace/deploy` after `COPY . .`; once the repository has a `deploy/` folder, that target is not empty and pnpm 8.15.9 stops with `ERR_PNPM_DEPLOY_DIR_NOT_EMPTY` (reproduced on 2026-10-16). Task 1 moves the output to `/workspace/release` and excludes `deploy` from the build context, so no commit on the branch has an unbuildable image.
- "Environment keys listed without values" in the spec is implemented as interpolation: required keys are `${VAR:?message}` (a missing one stops `docker compose` before any container starts, with the variable named), optional keys are `${VAR-}` (unset renders as an empty string, which `loadLlmSettings` and the entrypoint already treat as absent). No value and no `env_file` in the file. Dokploy writes its Environment tab to a `.env` beside the compose file, which Compose reads for interpolation (from memory; the runbook marks it and names the signal if it is wrong).
- The compose file **pins** `PORT=3000`, `DATABASE_DIR=/data`, `WEB_DIST_DIR=/app/web` and `TRUST_PROXY=true`, instead of reading them from Dokploy: the port must match `expose` and the Domains tab, the directory must match the volume, and `TRUST_PROXY=true` is right exactly when this file is used (behind Traefik, no host port). The runbook says not to set them.
- The entrypoint becomes strict: `SEED_DEMO_USERS` must be exactly `true` or `false` (unset, `TRUE` or `1` exit 1 with the received value), and `DEMO_PASSWORD` is required, before Node runs, only when the flag is `true`. The local compose already requires the flag (`${SEED_DEMO_USERS:?}`) and the README Docker command sets it, so no documented flow changes.
- The compose checks run as a Vitest suite inside `pnpm test:unit`, in two blocks (lead ruling). The four checks that only read files (the variables the compose file reads, their documentation in `.env.example`, the empty example key, no committed OpenRouter key) always run. The eight checks that render the file with `docker compose config` sit in a `describe.skipIf` block named `Dokploy compose file rendered by docker compose (skipped without the Docker CLI)`, so a laptop without Docker shows them as skipped instead of failing. In CI the `verify` job sets `REQUIRE_DOCKER_COMPOSE=true` on its `pnpm test:unit` step; with that flag and no Compose the file throws `Docker Compose v2 is required in CI`, so CI can never pass by skipping. `ci-workflow.test.ts` pins the flag, and the test plan has a CI box for "rendering block ran with 0 skipped".
- The CI `docker` job goes beyond "build, no push": it also boots the image (refusal without `DEMO_PASSWORD`, health 200, SPA served, `/data` owned by uid 1000, a seeded sign-in), then restarts it and checks that seeding is idempotent (`existing: ana@example.com` in the log, sign-in 200 again). Every health poll is bounded by `--max-time 5 --retry-max-time 120`. It is the only place before the owner's deploy where the runtime image runs; slices 2–4 changed the image after its last local boot.
- The README drops its `Status` section (it went stale every slice) and points at the roadmap instead; `Quick start` becomes `Run locally` and `Run with Docker`; `Citations` becomes `Credits` with its text unchanged. `Features`, `LLM configuration`, `Architecture in brief`, `Process` and `License` stay as they are on `main` when Task 5 runs (slice 4 may have changed them). The demo URL is a sentence the owner replaces after the first deploy; the README never prints the production password.
- `.env.example` keeps every local value (the local quick start and `ENV_FILE=.env.example docker compose up` keep working) and gains production notes as `#` lines. The public `AUTH_SECRET` placeholder still passes the server's 32-character check; changing the server to reject it is application code, outside this spec (Coverage honesty).
- Dokploy screens are written from memory and marked "(from memory, verify in the UI)" wherever a label or tab name could differ.
- The scratchpad spec was amended in place by the planner on 2026-10-16, after the plan review: the compose, runbook, CI, Dockerfile, README and test-strategy lines match this plan, and the failure table states that a failing health check never restarts the container (`restart: unless-stopped` restarts on exit only) while Traefik stops routing to it. Task 0 copies that amended spec and checks the amendments are present, so the reviewer compares the diff with the spec the code was built from.
- A container whose health check is starting or failing gets no traffic from Traefik, so the domain answers `404 page not found` for about 20 s after each deploy (from memory). The runbook, the spec and ADR 0013 say so; the runbook's Logs step and `docker inspect` are the diagnosis.
- Making the repository public publishes its whole history. The runbook's step 6 runs a history scan first (`git log --all -p` for OpenRouter keys, `git log --all -- .env deploy/.env` for committed env files), and an OWNER box records it. On 2026-10-16 the reviewer found 0 key hits in history and `.env` never committed.

## Global constraints

- Everything in English. No comments in code, scripts or YAML (the `.env.example` `#` notes are the documented exception the file already uses). No `?? default`: absence is modelled (throw, early return, or a required field). No `else`; flat `if`s and early returns. Enums over string literals where a set of values is code; constants over magic literals, at the top of the file. Named parameters when a function takes more than one. Function declarations. No `.js` in imports. Type everything. Array methods over loops.
- Shell scripts start with `#!/bin/sh` and `set -eu`; multi-line workflow `run:` blocks start with `set -eu`. No `sleep` anywhere: waits are `curl --retry` or a condition.
- Red first wherever a behaviour changes: each task commits its failing tests alone in a `test(<scope>): …` commit, run red on the named assertion (never a missing module; `docs/learnings/2026-10-16-a-red-first-commit-must-fail-on-the-named-assertion.md`), then the implementation commit. Test names in present tense, never "should".
- Commit with `git add <exact paths> && git commit -m "…"` in **one** command, then `git show --stat HEAD` must list only the paths named in that step. Never `git add -A`, `git add .` or `--no-verify`. Commit only on `feat/deploy`. Attribution lines required by the agent harness go at the end of each commit body.
- No secret in the repository: no real key, password or `AUTH_SECRET` in any committed file; test values are obviously fake (`compose-test-…`, `ci-smoke-…`, `entrypoint-test-…`). Agents never read or edit `.env`.
- Nothing in this plan runs `docker build`, `docker run` or `docker compose up` locally.
- `poc/` untouched. The local `docker-compose.yml` untouched.

## Review focus

1. **A secret reaches the repository.** A pasted OpenRouter key, a real `AUTH_SECRET` or the demo password in the compose file, `.env.example`, the runbook or the README. Expected: every secret comes from the Dokploy environment and the repo holds none (Task 2: `reads every secret from the Dokploy environment`, `the example file leaves the OpenRouter key empty`, `no OpenRouter key is committed`; Task 6: `the example file marks AUTH_SECRET as a secret` and its two siblings).
2. **The container dies or loops on the demo password.** `SEED_DEMO_USERS=false` without `DEMO_PASSWORD` must start; `true` without it must stop before Node with the variable named, never start half-seeded; `TRUE` or unset must not silently skip seeding (Task 1: `starts the server without seeding or a demo password when seeding is off`, `refuses to seed without a demo password and starts nothing`, `refuses to seed with an empty demo password`, `refuses to start when the seeding flag is missing`, `refuses a seeding flag that is not exactly true or false`, `does not start the server when seeding fails`; Task 3: CI steps `Refuse to seed without a demo password` and `Restart keeps the data and the accounts`).
3. **`TRUST_PROXY` is wrong for where the app runs.** `false` behind Traefik rate-limits every visitor as one address; `true` with a host port lets anyone forge `X-Forwarded-For`. Expected: `true` pinned in the production file, which publishes no host port; `false` stays the local value (Task 2: `pins the production values that must match the image and the proxy`, `builds the repository image and reaches the app only through the proxy network`).
4. **`/data` is not writable by uid 1000.** A bind mount or a root-owned volume makes the server stop with `Database directory is not writable: /data`. Expected: a named volume that inherits the image's `node` ownership (Task 2: `keeps the data directory on a named volume`; Task 3: CI step `The data volume belongs to the node user`; Task 4: the runbook row for that error).
5. **The README goes stale or lies.** A missing delivery section, a dead relative link, the old `Status` paragraph, a runbook that forgets a variable the compose reads, or a "Try it" step naming a button that does not exist (Task 4: `every relative link in docs/features/deploy/runbook.md points at a file and a heading in the repository`, `a link to a heading its target does not have is reported`, `the runbook sets every variable the compose file reads`; Task 5: `the README carries every delivery section`, `the README drops the sections that went stale`, `the README links the deploy runbook`, the README link check; test plan: the "Try it" walk with Playwright MCP).

## File map

| Group | Owner | Paths |
|---|---|---|
| A — the only lane | `developer-s5` | `docs/features/deploy/**`, `docs/adr/0013-deploy-with-dokploy-compose.md`, `docs/adr/README.md`, `docs/features/README.md`, `docker/entrypoint.sh`, `docker/Dockerfile`, `.dockerignore`, `deploy/docker-compose.yml`, `.github/workflows/verify.yml`, `apps/server/src/deploy/**`, `apps/server/src/testing/repository-files.ts`, `README.md`, `.env.example`, then at Z: `docs/features/deploy/tester-briefing.md`, `docs/learnings/**` |

## Sequencing

One developer, strictly in order: Task 0 → 1 → 2 → 3 → 4 → 5 → 6 → Z. Each task consumes the previous one's files: Task 2's tests import the helper Task 1 creates, Task 4's runbook check reads the compose file from Task 2, Task 5's README links the runbook from Task 4 and the ADR from Task 0, Task 6's notes point at the runbook.

---

### Task 0: Feature folder, spec amendments and ADR 0013

**Files:**
- Create: `docs/features/deploy/spec.md`, `docs/features/deploy/plan.md`, `docs/features/deploy/test-plan.md`, `docs/features/deploy/tester-briefing.md` (the template, filled at Z1), `docs/adr/0013-deploy-with-dokploy-compose.md`
- Modify: `docs/adr/README.md` (index row), `docs/features/README.md` (roadmap row 5)

**Interfaces:**
- Consumes: the scratchpad files the lead hands over: `spec-deploy.md`, `plan-deploy.md`, `test-plan-deploy.md`.
- Produces: the folder the tester and the reviewer read; ADR 0013, which the runbook (Task 4) and the README (Task 5) link.

- [ ] **Step 1: Precondition** — `git branch --show-current` prints `feat/deploy`; `git log --oneline -1 main` is the PR 4 merge commit; `ls docs/adr/0012-*.md` exists; `ls docs/adr/0013-*.md` does not. Stop and report otherwise.
- [ ] **Step 2: Scaffold** — run the `feature` skill with slug `deploy` (tier 🔴, ADRs 0004, 0008, 0011, 0013). It refuses if the folder exists; it must not.
- [ ] **Step 3: Copy** — overwrite the scaffolded `spec.md`, `plan.md` and `test-plan.md` with the three scratchpad files, byte for byte. Check: `grep -c "\[x\]" docs/features/deploy/plan.md docs/features/deploy/test-plan.md` prints 0 for both.
- [ ] **Step 4: Check the amended spec** — the scratchpad spec already carries the planner's amendments; confirm them in the copy: `grep -c "deploy/README.md" docs/features/deploy/spec.md` prints 0; `grep -c "/workspace/release" docs/features/deploy/spec.md` prints 1; `grep -c "restarts on exit only" docs/features/deploy/spec.md` prints 1; `grep -c "REQUIRE_DOCKER_COMPOSE" docs/features/deploy/spec.md` prints 2. Any other count: stop and ask the lead for the amended spec.
- [ ] **Step 5: ADR** — run the `adr` skill for `docs/adr/0013-deploy-with-dokploy-compose.md` and write exactly this body, with `Date:` set to the output of `date +%F`:

````markdown
# 0013. Deploy with a Dokploy compose service built from the repository

- Status: Accepted (owner to confirm at the first deploy)
- Date: <output of date +%F>
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
````

- [ ] **Step 6: Indexes** — append to the table in `docs/adr/README.md`:

```markdown
| [0013](0013-deploy-with-dokploy-compose.md) | Deploy with a Dokploy compose service built from the repository | Accepted (owner to confirm at the first deploy) | <the same date as the ADR> |
```

  and in `docs/features/README.md` replace the roadmap row that starts with `| 5 | \`deploy\`` with:

```markdown
| 5 | [`deploy`](deploy/) | Compose on the owner's VPS through Dokploy, delivery README | Building |
```

- [ ] **Step 7: Commit**

```bash
git add docs/features/deploy/spec.md docs/features/deploy/plan.md docs/features/deploy/test-plan.md docs/features/deploy/tester-briefing.md docs/adr/0013-deploy-with-dokploy-compose.md docs/adr/README.md docs/features/README.md && git commit -m "docs(deploy): add the spec, plan, test plan and ADR 0013"
```

`git show --stat HEAD` lists exactly those seven paths.

---

### Task 1: Entrypoint seeding guard and the image build layout

**Files:**
- Create: `apps/server/src/testing/repository-files.ts`, `apps/server/src/deploy/entrypoint.test.ts`, `apps/server/src/deploy/dockerfile.test.ts`
- Modify: `docker/entrypoint.sh`, `docker/Dockerfile`, `.dockerignore`

**Interfaces:**
- Consumes: the built server's `dist/seed.js` and `dist/main.js` contract (the entrypoint runs them relative to its working directory, `/app` in the image); `MissingDemoPasswordError` wording (`Missing environment variable: DEMO_PASSWORD`, `apps/server/src/auth/seed-demo-users.ts`).
- Produces: `apps/server/src/testing/repository-files.ts` exporting `REPOSITORY_ROOT: string`, `repositoryPath(path: string): string`, `readRepositoryFile(path: string): string` (Task 2 extends it). The entrypoint's two refusal messages, which Task 3 (CI) and Task 4 (runbook) quote: `Missing environment variable: DEMO_PASSWORD (required when SEED_DEMO_USERS=true)` and `SEED_DEMO_USERS must be true or false, received: '<value>'`. The build output folder `/workspace/release`.

- [ ] **Step 1: Write the failing tests** — create `apps/server/src/testing/repository-files.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));

export function repositoryPath(path: string): string {
  return resolve(REPOSITORY_ROOT, path);
}

export function readRepositoryFile(path: string): string {
  return readFileSync(repositoryPath(path), 'utf8');
}
```

`apps/server/src/deploy/entrypoint.test.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { repositoryPath } from '../testing/repository-files';

const ENTRYPOINT = repositoryPath('docker/entrypoint.sh');
const SEED_OUTPUT = 'seed ran\n';
const MAIN_OUTPUT = 'main ran\n';
const SEED_FAILURE_EXIT_CODE = 3;
const DEMO_PASSWORD = 'entrypoint-test-password';

type EntrypointRun = { status: number | null; stdout: string; stderr: string };

let workingDirectory: string;

function writeStub({ name, source }: { name: string; source: string }): void {
  writeFileSync(join(workingDirectory, 'dist', name), source);
}

function runEntrypoint(variables: Record<string, string>): EntrypointRun {
  const result = spawnSync('sh', [ENTRYPOINT], { cwd: workingDirectory, env: { PATH: process.env.PATH, ...variables }, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

beforeEach(() => {
  workingDirectory = mkdtempSync(join(tmpdir(), 'superdoc-entrypoint-'));
  mkdirSync(join(workingDirectory, 'dist'));
  writeStub({ name: 'seed.js', source: `process.stdout.write(${JSON.stringify(SEED_OUTPUT)});` });
  writeStub({ name: 'main.js', source: `process.stdout.write(${JSON.stringify(MAIN_OUTPUT)});` });
});

afterEach(() => {
  rmSync(workingDirectory, { recursive: true, force: true });
});

describe('docker entrypoint', () => {
  test('starts the server without seeding or a demo password when seeding is off', () => {
    expect(runEntrypoint({ SEED_DEMO_USERS: 'false' })).toEqual({ status: 0, stdout: MAIN_OUTPUT, stderr: '' });
  });

  test('seeds the demo users and then starts the server when seeding is on', () => {
    expect(runEntrypoint({ SEED_DEMO_USERS: 'true', DEMO_PASSWORD })).toEqual({ status: 0, stdout: SEED_OUTPUT + MAIN_OUTPUT, stderr: '' });
  });

  test('refuses to seed without a demo password and starts nothing', () => {
    const run = runEntrypoint({ SEED_DEMO_USERS: 'true' });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain('Missing environment variable: DEMO_PASSWORD');
  });

  test('refuses to seed with an empty demo password', () => {
    const run = runEntrypoint({ SEED_DEMO_USERS: 'true', DEMO_PASSWORD: '' });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain('Missing environment variable: DEMO_PASSWORD');
  });

  test('refuses to start when the seeding flag is missing', () => {
    const run = runEntrypoint({});
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain("SEED_DEMO_USERS must be true or false, received: ''");
  });

  test('refuses a seeding flag that is not exactly true or false', () => {
    const run = runEntrypoint({ SEED_DEMO_USERS: 'TRUE', DEMO_PASSWORD });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain("SEED_DEMO_USERS must be true or false, received: 'TRUE'");
  });

  test('does not start the server when seeding fails', () => {
    writeStub({ name: 'seed.js', source: `process.exit(${SEED_FAILURE_EXIT_CODE});` });
    expect(runEntrypoint({ SEED_DEMO_USERS: 'true', DEMO_PASSWORD })).toEqual({ status: SEED_FAILURE_EXIT_CODE, stdout: '', stderr: '' });
  });
});
```

`apps/server/src/deploy/dockerfile.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import { readRepositoryFile, repositoryPath } from '../testing/repository-files';

const DOCKERFILE = 'docker/Dockerfile';
const BUILD_WORKSPACE = '/workspace';
const INSTALL_INSTRUCTION = 'RUN pnpm install --frozen-lockfile';
const COPY_SOURCES_INSTRUCTION = 'COPY . .';
const DEPLOY_INSTRUCTION_PREFIX = 'RUN pnpm deploy ';
const TOKEN_SEPARATOR = ' ';

function dockerfileLines(): string[] {
  return readRepositoryFile(DOCKERFILE).split('\n');
}

function deployTarget(): string {
  const instruction = dockerfileLines().find((line) => line.startsWith(DEPLOY_INSTRUCTION_PREFIX));
  if (!instruction) throw new Error(`${DOCKERFILE} has no pnpm deploy instruction`);
  return posix.relative(BUILD_WORKSPACE, instruction.split(TOKEN_SEPARATOR).slice(-1).join(''));
}

describe('Dockerfile', () => {
  test('installs dependencies from the workspace manifests before copying the sources', () => {
    const lines = dockerfileLines();
    const installIndex = lines.indexOf(INSTALL_INSTRUCTION);
    expect(installIndex).toBeGreaterThan(0);
    expect(lines.slice(0, installIndex)).not.toContain(COPY_SOURCES_INSTRUCTION);
    expect(lines.slice(installIndex)).toContain(COPY_SOURCES_INSTRUCTION);
  });

  test('pnpm deploy writes to a folder the repository does not have', () => {
    expect(deployTarget()).not.toBe('');
    expect(existsSync(repositoryPath(deployTarget()))).toBe(false);
  });
});
```

- [ ] **Step 2: Run them red** — `pnpm --filter @superdoc-history/server exec vitest run src/deploy`. Expected: 5 failed, 4 passed. The failures, each on its assertion:
  - `refuses to seed without a demo password and starts nothing`, `refuses to seed with an empty demo password`, `refuses to start when the seeding flag is missing`, `refuses a seeding flag that is not exactly true or false`: `AssertionError: expected +0 to be 1`
  - `installs dependencies from the workspace manifests before copying the sources`: `AssertionError: expected [ …(4) ] to not include 'COPY . .'`

  `pnpm deploy writes to a folder the repository does not have` passes now (there is no `deploy/` folder yet); it is the guard that turns red if Task 2 lands without this task's Dockerfile change. Then `pnpm --filter @superdoc-history/server typecheck` is clean.
- [ ] **Step 3: Commit the red tests**

```bash
git add apps/server/src/testing/repository-files.ts apps/server/src/deploy/entrypoint.test.ts apps/server/src/deploy/dockerfile.test.ts && git commit -m "test(docker): pin the entrypoint seeding guard and the install layer order"
```

`git show --stat HEAD` lists exactly those three paths.
- [ ] **Step 4: Entrypoint** — replace `docker/entrypoint.sh` with:

```sh
#!/bin/sh
set -eu

if [ "${SEED_DEMO_USERS-}" != "true" ] && [ "${SEED_DEMO_USERS-}" != "false" ]; then
  echo "SEED_DEMO_USERS must be true or false, received: '${SEED_DEMO_USERS-}'" >&2
  exit 1
fi

if [ "$SEED_DEMO_USERS" = "true" ] && [ -z "${DEMO_PASSWORD-}" ]; then
  echo "Missing environment variable: DEMO_PASSWORD (required when SEED_DEMO_USERS=true)" >&2
  exit 1
fi

if [ "$SEED_DEMO_USERS" = "true" ]; then
  node dist/seed.js
fi

exec node dist/main.js
```

  `sh -n docker/entrypoint.sh` prints nothing. The file keeps its mode (`git diff --summary` shows no mode change).
- [ ] **Step 5: Dockerfile and build context** — replace `docker/Dockerfile` with:

```dockerfile
FROM node:24-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY libs/history/package.json libs/history/package.json
COPY libs/types/package.json libs/types/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN pnpm deploy --prod --filter @superdoc-history/server /workspace/release

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_DIR=/data \
    WEB_DIST_DIR=/app/web
COPY --from=build /workspace/release/node_modules ./node_modules
COPY --from=build /workspace/release/package.json ./package.json
COPY --from=build /workspace/apps/server/dist ./dist
COPY --from=build /workspace/apps/server/drizzle ./drizzle
COPY --from=build /workspace/libs/history/drizzle ./libs/history/drizzle
COPY --from=build /workspace/apps/web/dist ./web
COPY docker/entrypoint.sh ./entrypoint.sh
RUN mkdir /data && chown node:node /data && chmod +x entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/entrypoint.sh"]
```

  and append one line, `deploy`, to `.dockerignore` (after `playwright-report`). Check: `grep -c "/workspace/deploy" docker/Dockerfile` prints 0; the `COPY …/package.json` lines name every workspace importer: `git show HEAD:pnpm-lock.yaml | sed -n '/^importers:/,/^packages:/p' | grep -E "^  [^ ]"` prints exactly `.`, `apps/server`, `apps/web`, `libs/history`, `libs/types`.
- [ ] **Step 6: Run them green** — `pnpm --filter @superdoc-history/server exec vitest run src/deploy` → 9 passed. `pnpm --filter @superdoc-history/server typecheck` clean.
- [ ] **Step 7: Commit**

```bash
git add docker/entrypoint.sh && git commit -m "fix(docker): refuse to seed without a demo password or an exact seeding flag"
git add docker/Dockerfile .dockerignore && git commit -m "chore(docker): cache the install layer and write pnpm deploy to /workspace/release"
```

  Run each line as its own command; after each, `git show --stat HEAD` lists only that line's paths.

---

### Task 2: Dokploy compose file

**Files:**
- Create: `deploy/docker-compose.yml`, `apps/server/src/deploy/compose.test.ts`
- Modify: `apps/server/src/testing/repository-files.ts`

**Interfaces:**
- Consumes: `REPOSITORY_ROOT`, `repositoryPath`, `readRepositoryFile` (Task 1).
- Produces: `deploy/docker-compose.yml` (service `app`, volume `superdoc-data`); the `REQUIRE_DOCKER_COMPOSE=true` switch that Task 3 sets in CI; in `repository-files.ts`, `DEPLOY_COMPOSE_FILE = 'deploy/docker-compose.yml'`, `capturedNames({ text, pattern }: { text: string; pattern: RegExp }): string[]` and `composeVariables(): string[]` (the distinct `${NAME…}` keys the compose file reads), which Task 4 and Task 6 use.

- [ ] **Step 1: Extend the helper** — replace `apps/server/src/testing/repository-files.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
export const DEPLOY_COMPOSE_FILE = 'deploy/docker-compose.yml';
const INTERPOLATED_VARIABLE_PATTERN = /\$\{([A-Z_]+)[:?-]/g;

export function repositoryPath(path: string): string {
  return resolve(REPOSITORY_ROOT, path);
}

export function readRepositoryFile(path: string): string {
  return readFileSync(repositoryPath(path), 'utf8');
}

export function capturedNames({ text, pattern }: { text: string; pattern: RegExp }): string[] {
  return [...text.matchAll(pattern)].flatMap((match) => match.slice(1, 2));
}

export function composeVariables(): string[] {
  return [...new Set(capturedNames({ text: readRepositoryFile(DEPLOY_COMPOSE_FILE), pattern: INTERPOLATED_VARIABLE_PATTERN }))];
}
```

- [ ] **Step 2: Write the failing test** — `apps/server/src/deploy/compose.test.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { composeVariables, capturedNames, DEPLOY_COMPOSE_FILE, readRepositoryFile, REPOSITORY_ROOT } from '../testing/repository-files';

const ENVIRONMENT_EXAMPLE_FILE = '.env.example';
const NO_ENVIRONMENT_FILE = '/dev/null';
const SERVICE_NAME = 'app';
const CONTAINER_PORT = '3000';
const DATA_DIRECTORY = '/data';
const DATA_VOLUME = 'superdoc-data';
const REQUIRED_VARIABLES = ['APP_ORIGIN', 'AUTH_SECRET', 'SEED_DEMO_USERS'];
const OPTIONAL_VARIABLES = ['DEMO_PASSWORD', 'OPENROUTER_API_KEY', 'LLM_MODEL', 'OPENROUTER_BASE_URL', 'LLM_MAX_CONCURRENT_JOBS', 'LLM_MAX_CALLS_PER_HOUR'];
const DOCUMENTED_VARIABLE_PATTERN = /^([A-Z_]+)=/gm;
const EMPTY_OPENROUTER_KEY_PATTERN = /^OPENROUTER_API_KEY=$/m;
const OPENROUTER_KEY_PATTERN = 'sk-or-v1-[A-Za-z0-9]{16,}';
const GIT_GREP_NO_MATCH_STATUS = 1;
const DOCKER_COMPOSE_REQUIREMENT_VARIABLE = 'REQUIRE_DOCKER_COMPOSE';
const DOCKER_COMPOSE_REQUIRED = 'true';
const DOCKER_COMPOSE_REQUIRED_MESSAGE = 'Docker Compose v2 is required in CI';
const REQUIRED_VALUES: Record<string, string> = {
  APP_ORIGIN: 'https://demo.example.com',
  AUTH_SECRET: 'compose-test-secret-with-at-least-32-characters',
  SEED_DEMO_USERS: 'false',
};
const DOKPLOY_VALUES: Record<string, string> = {
  ...REQUIRED_VALUES,
  SEED_DEMO_USERS: 'true',
  DEMO_PASSWORD: 'compose-test-demo-password',
  OPENROUTER_API_KEY: 'compose-test-openrouter-key',
};

type ComposeVolume = { type: string; source: string; target: string };
type ComposeService = {
  build: { context: string; dockerfile: string };
  environment: Record<string, string>;
  expose?: string[];
  ports?: unknown[];
  env_file?: unknown;
  healthcheck?: unknown;
  volumes?: ComposeVolume[];
  restart?: string;
};
type ComposeConfig = { services: Record<string, ComposeService> };
type ComposeRun = { status: number | null; stdout: string; stderr: string };

const isDockerComposeAvailable = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' }).status === 0;
const isDockerComposeRequired = process.env[DOCKER_COMPOSE_REQUIREMENT_VARIABLE] === DOCKER_COMPOSE_REQUIRED;

if (isDockerComposeRequired && !isDockerComposeAvailable) throw new Error(DOCKER_COMPOSE_REQUIRED_MESSAGE);

function renderCompose(variables: Record<string, string>): ComposeRun {
  const result = spawnSync('docker', ['compose', '--env-file', NO_ENVIRONMENT_FILE, '-f', DEPLOY_COMPOSE_FILE, 'config', '--format', 'json'], { cwd: REPOSITORY_ROOT, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...variables }, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function renderedService(variables: Record<string, string>): ComposeService {
  const run = renderCompose(variables);
  if (run.status !== 0) throw new Error(run.stderr);
  const service = (JSON.parse(run.stdout) as ComposeConfig).services[SERVICE_NAME];
  if (!service) throw new Error(`The compose file has no service named ${SERVICE_NAME}`);
  return service;
}

function withoutVariable(name: string): Record<string, string> {
  return Object.fromEntries(Object.entries(DOKPLOY_VALUES).filter(([key]) => key !== name));
}

describe('Dokploy compose file', () => {
  test('reads exactly the required and optional variables from the environment', () => {
    expect(composeVariables().sort()).toEqual([...REQUIRED_VARIABLES, ...OPTIONAL_VARIABLES].sort());
  });

  test('every variable read from the environment is documented in the example file', () => {
    const documented = capturedNames({ text: readRepositoryFile(ENVIRONMENT_EXAMPLE_FILE), pattern: DOCUMENTED_VARIABLE_PATTERN });
    expect(composeVariables().filter((name) => !documented.includes(name))).toEqual([]);
  });

  test('the example file leaves the OpenRouter key empty', () => {
    expect(readRepositoryFile(ENVIRONMENT_EXAMPLE_FILE)).toMatch(EMPTY_OPENROUTER_KEY_PATTERN);
  });

  test('no OpenRouter key is committed', () => {
    expect(spawnSync('git', ['grep', '-nE', OPENROUTER_KEY_PATTERN], { cwd: REPOSITORY_ROOT, encoding: 'utf8' }).status).toBe(GIT_GREP_NO_MATCH_STATUS);
  });
});

describe.skipIf(!isDockerComposeAvailable)('Dokploy compose file rendered by docker compose (skipped without the Docker CLI)', () => {
  test('builds the repository image and reaches the app only through the proxy network', () => {
    const service = renderedService(DOKPLOY_VALUES);
    expect(service.build).toEqual(expect.objectContaining({ context: REPOSITORY_ROOT, dockerfile: 'docker/Dockerfile' }));
    expect(service.expose).toEqual([CONTAINER_PORT]);
    expect(service.ports).toBeUndefined();
    expect(service.env_file).toBeUndefined();
    expect(service.healthcheck).toBeUndefined();
    expect(service.restart).toBe('unless-stopped');
  });

  test('keeps the data directory on a named volume', () => {
    expect(renderedService(DOKPLOY_VALUES).volumes).toEqual([expect.objectContaining({ type: 'volume', source: DATA_VOLUME, target: DATA_DIRECTORY })]);
  });

  test('pins the production values that must match the image and the proxy', () => {
    expect(renderedService(DOKPLOY_VALUES).environment).toEqual(expect.objectContaining({ PORT: CONTAINER_PORT, DATABASE_DIR: DATA_DIRECTORY, WEB_DIST_DIR: '/app/web', TRUST_PROXY: 'true' }));
  });

  test('reads every secret from the Dokploy environment', () => {
    expect(renderedService(DOKPLOY_VALUES).environment).toEqual(expect.objectContaining(DOKPLOY_VALUES));
  });

  test('passes optional variables as empty when Dokploy does not set them', () => {
    const environment = renderedService(REQUIRED_VALUES).environment;
    expect(OPTIONAL_VARIABLES.map((name) => [name, environment[name]])).toEqual(OPTIONAL_VARIABLES.map((name) => [name, '']));
  });

  test.each(REQUIRED_VARIABLES)('refuses to render without %s', (name) => {
    const run = renderCompose(withoutVariable(name));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(`required variable ${name} is missing a value`);
  });
});
```

  and, so the red run reaches the assertions instead of stopping at a missing file, a stub `deploy/docker-compose.yml` shaped like the developer compose:

```yaml
services:
  app:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    environment:
      PORT: "3000"
```

- [ ] **Step 3: Run it red** — `pnpm --filter @superdoc-history/server exec vitest run src/deploy/compose.test.ts`. Expected: 9 failed, 3 passed. Failures on their assertions: `expected undefined to deeply equal [ '3000' ]` (no `expose`), `expected undefined to deeply equal [ ObjectContaining{…} ]` (no volume), `expected { PORT: '3000' } to deeply equal ObjectContaining{…}` (pins, then secrets), `expected [ Array(6) ] to deeply equal [ [ 'DEMO_PASSWORD', '' ], …(5) ]` (optional keys), `expected +0 not to be +0` three times (each required variable), `expected [] to deeply equal [ 'APP_ORIGIN', 'AUTH_SECRET', …(7) ]`. Passing guards: `every variable read from the environment is documented in the example file`, `the example file leaves the OpenRouter key empty`, `no OpenRouter key is committed`. (This machine has the Docker CLI, so the rendering block runs; on a machine without it that block shows 8 skipped.) Run `pnpm --filter @superdoc-history/server exec vitest run src/deploy/dockerfile.test.ts` too: still 2 passed (the stub `deploy/` folder exists and the Task 1 target is `release`).
- [ ] **Step 4: Commit the red test**

```bash
git add apps/server/src/testing/repository-files.ts apps/server/src/deploy/compose.test.ts deploy/docker-compose.yml && git commit -m "test(deploy): pin the Dokploy compose file"
```

`git show --stat HEAD` lists exactly those three paths.
- [ ] **Step 5: Compose file** — replace `deploy/docker-compose.yml` with:

```yaml
services:
  app:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    expose:
      - "3000"
    environment:
      PORT: "3000"
      DATABASE_DIR: /data
      WEB_DIST_DIR: /app/web
      TRUST_PROXY: "true"
      APP_ORIGIN: ${APP_ORIGIN:?Set APP_ORIGIN to https://<your domain> in the Dokploy environment}
      AUTH_SECRET: ${AUTH_SECRET:?Set AUTH_SECRET in the Dokploy environment}
      SEED_DEMO_USERS: ${SEED_DEMO_USERS:?Set SEED_DEMO_USERS to true or false in the Dokploy environment}
      DEMO_PASSWORD: ${DEMO_PASSWORD-}
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY-}
      LLM_MODEL: ${LLM_MODEL-}
      OPENROUTER_BASE_URL: ${OPENROUTER_BASE_URL-}
      LLM_MAX_CONCURRENT_JOBS: ${LLM_MAX_CONCURRENT_JOBS-}
      LLM_MAX_CALLS_PER_HOUR: ${LLM_MAX_CALLS_PER_HOUR-}
    volumes:
      - superdoc-data:/data
    restart: unless-stopped

volumes:
  superdoc-data:
```

- [ ] **Step 6: Run it green** — `pnpm --filter @superdoc-history/server exec vitest run src/deploy` → 21 passed. Without the Docker CLI on `PATH`, `compose.test.ts` reports 4 passed and 8 skipped; with `REQUIRE_DOCKER_COMPOSE=true` and no Docker CLI the file fails with `Docker Compose v2 is required in CI`. By hand, the refusal reads well: `env -i PATH="$PATH" HOME="$HOME" APP_ORIGIN=https://demo.example.com SEED_DEMO_USERS=true docker compose -f deploy/docker-compose.yml config` exits non-zero and prints `required variable AUTH_SECRET is missing a value: Set AUTH_SECRET in the Dokploy environment`. `docker compose -f docker-compose.yml config --quiet` with `ENV_FILE=.env.example APP_ORIGIN=http://localhost:3000 SEED_DEMO_USERS=true` still exits 0 (the local file is untouched).
- [ ] **Step 7: Commit**

```bash
git add deploy/docker-compose.yml && git commit -m "feat(deploy): add the Dokploy compose file"
```

`git show --stat HEAD` lists only `deploy/docker-compose.yml`.

---

### Task 3: CI job that builds and boots the image

**Files:**
- Create: `apps/server/src/deploy/ci-workflow.test.ts`
- Modify: `.github/workflows/verify.yml`

**Interfaces:**
- Consumes: `readRepositoryFile` (Task 1); the entrypoint refusal message (Task 1); `docker/Dockerfile` (Task 1); `GET /api/health`, `POST /api/auth/sign-in/email`, the SPA title `SuperDoc History` (`apps/web/index.html`).
- Produces: the `docker` job, whose step names the test plan and the PR body quote: `Refuse to seed without a demo password`, `Start the image on a named volume`, `Health answers 200`, `The web app is served`, `The data volume belongs to the node user`, `A seeded demo user signs in`, `Restart keeps the data and the accounts`; and `REQUIRE_DOCKER_COMPOSE: 'true'` on the `verify` job's `pnpm test:unit` step.

- [ ] **Step 1: Write the failing test** — `apps/server/src/deploy/ci-workflow.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { readRepositoryFile } from '../testing/repository-files';

const WORKFLOW_FILE = '.github/workflows/verify.yml';
const DOCKER_JOB_FRAGMENTS = ['\n  docker:\n', 'file: docker/Dockerfile', 'push: false', 'cache-from: type=gha', "grep -q 'Missing environment variable: DEMO_PASSWORD'", '/api/health', '--max-time 5', '--retry-max-time 120', 'stat -c %u /data', '/api/auth/sign-in/email', 'docker restart app', "grep -q 'existing: ana@example.com' app.log"];
const UNIT_STEP_REQUIRING_DOCKER_COMPOSE = "      - run: pnpm test:unit\n        env:\n          REQUIRE_DOCKER_COMPOSE: 'true'\n";

describe('CI workflow', () => {
  test('a docker job builds the image without pushing it, boots it and restarts it', () => {
    const workflow = readRepositoryFile(WORKFLOW_FILE);
    expect(DOCKER_JOB_FRAGMENTS.filter((fragment) => !workflow.includes(fragment))).toEqual([]);
  });

  test('the verify job requires Docker Compose for the unit tests', () => {
    expect(readRepositoryFile(WORKFLOW_FILE)).toContain(UNIT_STEP_REQUIRING_DOCKER_COMPOSE);
  });
});
```

- [ ] **Step 2: Run it red** — `pnpm --filter @superdoc-history/server exec vitest run src/deploy/ci-workflow.test.ts` → 2 failed: `AssertionError: expected [ '\n  docker:\n', …(11) ] to deeply equal []` and `expected 'name: verify\n\non:\n  pull_request:\…' to contain '      - run: pnpm test:unit\n        …'`.
- [ ] **Step 3: Commit the red test**

```bash
git add apps/server/src/deploy/ci-workflow.test.ts && git commit -m "test(ci): pin the docker build and boot job"
```

- [ ] **Step 4: Workflow** — replace `.github/workflows/verify.yml` with (the `verify` job gains only `env: REQUIRE_DOCKER_COMPOSE: 'true'` on its `pnpm test:unit` step; the `docker` job is new):

```yaml
name: verify

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: verify-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - id: playwright
        run: echo "version=$(pnpm exec playwright --version | awk '{print $2}')" >> "$GITHUB_OUTPUT"
      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.playwright.outputs.version }}
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm typecheck
      - run: pnpm test:unit
        env:
          REQUIRE_DOCKER_COMPOSE: 'true'
      - run: pnpm test:e2e
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-artifacts
          path: |
            playwright-report
            test-results
          if-no-files-found: ignore

  docker:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      IMAGE: superdoc-history:ci
      SMOKE_ORIGIN: http://127.0.0.1:3000
      SMOKE_AUTH_SECRET: ci-smoke-auth-secret-with-at-least-32-characters
      SMOKE_DEMO_PASSWORD: ci-smoke-demo-password
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/Dockerfile
          push: false
          load: true
          tags: ${{ env.IMAGE }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      - name: Refuse to seed without a demo password
        run: |
          set -eu
          status=0
          docker run --rm -e SEED_DEMO_USERS=true "$IMAGE" > refusal.log 2>&1 || status=$?
          cat refusal.log
          test "$status" -eq 1
          grep -q 'Missing environment variable: DEMO_PASSWORD' refusal.log
      - name: Start the image on a named volume
        run: >-
          docker run -d --name app -p 3000:3000 -v superdoc-ci-data:/data
          -e APP_ORIGIN="$SMOKE_ORIGIN" -e AUTH_SECRET="$SMOKE_AUTH_SECRET" -e TRUST_PROXY=true
          -e SEED_DEMO_USERS=true -e DEMO_PASSWORD="$SMOKE_DEMO_PASSWORD" "$IMAGE"
      - name: Health answers 200
        run: curl --fail --silent --show-error --max-time 5 --retry 30 --retry-delay 2 --retry-max-time 120 --retry-all-errors "$SMOKE_ORIGIN/api/health"
      - name: The web app is served
        run: |
          set -eu
          curl --fail --silent --show-error --output index.html "$SMOKE_ORIGIN/"
          grep -q '<title>SuperDoc History</title>' index.html
      - name: The data volume belongs to the node user
        run: test "$(docker exec app stat -c %u /data)" = "1000"
      - name: A seeded demo user signs in
        run: |
          set -eu
          status=$(curl --silent --output /dev/null --write-out '%{http_code}' -H 'content-type: application/json' -H "origin: $SMOKE_ORIGIN" -d "{\"email\":\"ana@example.com\",\"password\":\"$SMOKE_DEMO_PASSWORD\"}" "$SMOKE_ORIGIN/api/auth/sign-in/email")
          echo "sign-in status: $status"
          test "$status" = "200"
      - name: Restart keeps the data and the accounts
        run: |
          set -eu
          docker restart app
          curl --fail --silent --show-error --max-time 5 --retry 30 --retry-delay 2 --retry-max-time 120 --retry-all-errors "$SMOKE_ORIGIN/api/health"
          docker logs app > app.log 2>&1
          grep -q 'existing: ana@example.com' app.log
          status=$(curl --silent --output /dev/null --write-out '%{http_code}' -H 'content-type: application/json' -H "origin: $SMOKE_ORIGIN" -d "{\"email\":\"ana@example.com\",\"password\":\"$SMOKE_DEMO_PASSWORD\"}" "$SMOKE_ORIGIN/api/auth/sign-in/email")
          echo "sign-in after restart status: $status"
          test "$status" = "200"
      - if: failure()
        run: docker logs app
```

- [ ] **Step 5: Check it** — `ruby -ryaml -e 'puts YAML.load_file(ARGV[0])["jobs"].keys.inspect' .github/workflows/verify.yml` prints `["verify", "docker"]`; `pnpm --filter @superdoc-history/server exec vitest run src/deploy` → 23 passed. The job itself runs only on the pull request (Z5); nothing here runs Docker.
- [ ] **Step 6: Commit**

```bash
git add .github/workflows/verify.yml && git commit -m "ci: build and boot the image on every pull request"
```

`git show --stat HEAD` lists only the workflow.

---

### Task 4: Deploy runbook

**Files:**
- Create: `docs/features/deploy/runbook.md`, `apps/server/src/deploy/delivery-docs.test.ts`

**Interfaces:**
- Consumes: `capturedNames`, `composeVariables`, `readRepositoryFile`, `repositoryPath` (Tasks 1–2); ADR 0013 (Task 0); `deploy/docker-compose.yml` (Task 2); the entrypoint messages (Task 1); the server's own messages: `Environment variable APP_ORIGIN must be a bare origin`, `Database directory is not writable: /data`, `listening on :3000`, the seed's `created:` / `existing:` lines.
- Produces: `docs/features/deploy/runbook.md` with the anchors `#6-hand-it-over` and `#8-back-up-and-reset`, which the README (Task 5) links; `brokenTargets({ document, text }: { document: string; text: string }): string[]`, the link checker that also resolves `#anchors` against the GitHub slugs of the target's headings (lowercase, only `[a-z0-9 -]` kept, spaces to `-`, fenced code ignored).

- [ ] **Step 1: Write the failing test** — `apps/server/src/deploy/delivery-docs.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import { capturedNames, composeVariables, readRepositoryFile, repositoryPath } from '../testing/repository-files';

const README_FILE = 'README.md';
const RUNBOOK_FILE = 'docs/features/deploy/runbook.md';
const LINKED_DOCUMENTS = [RUNBOOK_FILE];
const LINK_PATTERN = /\]\(([^)\s]+)\)/g;
const HEADING_PATTERN = /^#{1,6} (.+)$/gm;
const FENCED_BLOCK_PATTERN = /```[\s\S]*?```/g;
const SLUG_DISALLOWED_PATTERN = /[^a-z0-9 -]/g;
const SPACE_PATTERN = / /g;
const EXTERNAL_LINK_PATTERN = /^(https?:|mailto:|#)/;
const ANCHOR_SEPARATOR = '#';
const MARKDOWN_EXTENSION = '.md';

function slugOf(heading: string): string {
  return heading.toLowerCase().replace(SLUG_DISALLOWED_PATTERN, '').replace(SPACE_PATTERN, '-');
}

function headingSlugs(path: string): string[] {
  return capturedNames({ text: readRepositoryFile(path).replace(FENCED_BLOCK_PATTERN, ''), pattern: HEADING_PATTERN }).map(slugOf);
}

function isBroken({ document, target }: { document: string; target: string }): boolean {
  const path = target.split(ANCHOR_SEPARATOR, 1).join('');
  const anchor = target.slice(path.length + ANCHOR_SEPARATOR.length);
  const targetPath = posix.join(posix.dirname(document), path);
  if (!existsSync(repositoryPath(targetPath))) return true;
  if (!anchor) return false;
  if (!targetPath.endsWith(MARKDOWN_EXTENSION)) return false;
  return !headingSlugs(targetPath).includes(anchor);
}

function brokenTargets({ document, text }: { document: string; text: string }): string[] {
  return capturedNames({ text, pattern: LINK_PATTERN }).filter((target) => !EXTERNAL_LINK_PATTERN.test(target)).filter((target) => isBroken({ document, target }));
}

describe('delivery documents', () => {
  test.each(LINKED_DOCUMENTS)('every relative link in %s points at a file and a heading in the repository', (document) => {
    expect(brokenTargets({ document, text: readRepositoryFile(document) })).toEqual([]);
  });

  test('a link to a heading its target does not have is reported', () => {
    const text = `[missing](${RUNBOOK_FILE}#no-such-heading) [present](${RUNBOOK_FILE}#6-hand-it-over)`;
    expect(brokenTargets({ document: README_FILE, text })).toEqual([`${RUNBOOK_FILE}#no-such-heading`]);
  });

  test('the runbook sets every variable the compose file reads', () => {
    const runbook = readRepositoryFile(RUNBOOK_FILE);
    expect(composeVariables().filter((name) => !runbook.includes(`\n${name}=`))).toEqual([]);
  });
});
```

  and a stub `docs/features/deploy/runbook.md` holding the single line `# Deploy runbook: Dokploy`.
- [ ] **Step 2: Run it red** — `pnpm --filter @superdoc-history/server exec vitest run src/deploy/delivery-docs.test.ts` → 2 failed, 1 passed: `the runbook sets every variable the compose file reads` fails with `expected [ 'APP_ORIGIN', 'AUTH_SECRET', …(7) ] to deeply equal []`; `a link to a heading its target does not have is reported` fails with `expected [ …(2) ] to deeply equal [ Array(1) ]` (the stub has no `6. Hand it over` heading, so the present anchor is reported too); the link check passes on the stub (no links yet).
- [ ] **Step 3: Commit the red test**

```bash
git add apps/server/src/deploy/delivery-docs.test.ts docs/features/deploy/runbook.md && git commit -m "test(deploy): pin the runbook links and variables"
```

- [ ] **Step 4: Runbook** — replace `docs/features/deploy/runbook.md` with:

````markdown
# Deploy runbook: Dokploy

How to put SuperDoc History on a VPS that runs Dokploy, check it, seed the demo accounts and roll back. About ten minutes once DNS resolves. The decision behind this shape is [ADR 0013](../../adr/0013-deploy-with-dokploy-compose.md).

Steps marked **(from memory, verify in the UI)** describe Dokploy screens that could not be checked from the machine that wrote this runbook. Labels may differ slightly in your Dokploy version; the intent of each step does not.

## What gets deployed

- [`deploy/docker-compose.yml`](../../../deploy/docker-compose.yml): one service, `app`, built from [`docker/Dockerfile`](../../../docker/Dockerfile) with the repository root as the build context.
- The container listens on port 3000 inside the Dokploy network (`expose`, no host port). Traefik terminates HTTPS and forwards both HTTP and the collaboration WebSocket to it.
- All data lives on the named volume `superdoc-data`, mounted at `/data`: `auth.sqlite`, `history.sqlite` and `read-model.sqlite` (each with its `-wal` and `-shm` files) and `documents/<id>.docx`.
- The compose file pins `PORT=3000`, `DATABASE_DIR=/data`, `WEB_DIST_DIR=/app/web` and `TRUST_PROXY=true`. Everything else comes from the Dokploy environment.
- One instance only ([ADR 0004](../../adr/0004-stack.md)). Never scale the service above one replica: SQLite and the language-model caps assume a single process.

## Before you start

1. Pick a domain or subdomain you control, for example `history.example.com`. Create a DNS `A` record pointing it at the VPS's public IP, and an `AAAA` record if the VPS has IPv6. Let's Encrypt needs it to resolve before step 3. If the DNS is on Cloudflare, set the record to **DNS only** (grey cloud): behind Cloudflare's proxy every visitor arrives from a Cloudflare address, the rate limits treat them all as one client, and the certificate challenge can fail (from memory, verify in the UI).
2. Make sure Dokploy can read the repository: its GitHub app has access to `dhyegocalota/superdoc-take-home`, or the repository is public and you use the Git provider with `https://github.com/dhyegocalota/superdoc-take-home.git`.
3. Generate the auth secret on any machine and keep the output for step 2:

   ```bash
   openssl rand -base64 48
   ```

   Never reuse the `AUTH_SECRET` from `.env.example`: it is public and long enough to pass validation.
4. Choose the demo accounts' password: at least 8 characters, letters, digits, `-` and `_` only. Compose's `.env` parser reads `$` as a variable, treats ` #` as the start of a comment and strips quotes, so any other character can silently change the password. It goes only into the Dokploy environment and the delivery message, never into the repository.
5. Have the OpenRouter API key ready. Without it the app still runs; topics and summaries then say the language model is unavailable.

## 1. Create the compose service (from memory, verify in the UI)

1. Dokploy → **Projects** → **Create Project**, name `superdoc-history`.
2. Open the project → **Create Service** → **Compose**. Name `superdoc-history`, compose type **Docker Compose** (not Stack) → **Create**.
3. In the service, **General** tab: provider **GitHub** (or **Git** with the public URL), repository `dhyegocalota/superdoc-take-home`, branch `main`, **Compose Path** `./deploy/docker-compose.yml` → **Save**.

## 2. Set the environment (from memory, verify in the UI)

**Environment** tab → paste the block below, replace the four values in angle brackets → **Save**.

```dotenv
APP_ORIGIN=https://<your domain>
AUTH_SECRET=<the output of openssl rand -base64 48>
SEED_DEMO_USERS=true
DEMO_PASSWORD=<the demo password you chose>
OPENROUTER_API_KEY=<your OpenRouter key>
LLM_MODEL=openai/gpt-6-luna
OPENROUTER_BASE_URL=
LLM_MAX_CONCURRENT_JOBS=
LLM_MAX_CALLS_PER_HOUR=
```

| Variable | Secret | What it does |
|---|---|---|
| `APP_ORIGIN` | no | The public origin. Exactly `https://` plus the domain: no path, no trailing slash, or the server refuses to start. |
| `AUTH_SECRET` | yes | Signs sessions. Changing it signs everyone out. |
| `SEED_DEMO_USERS` | no | `true` makes the container create Ana, Bruno, Caio and Dani on start. Idempotent: existing accounts keep their password. |
| `DEMO_PASSWORD` | yes | The demo accounts' password. Required while `SEED_DEMO_USERS=true`; the container refuses to start without it. |
| `OPENROUTER_API_KEY` | yes | The language-model key. Empty keeps the app running without topics and summaries. |
| `LLM_MODEL` | no | The model id sent to OpenRouter. |
| `OPENROUTER_BASE_URL` | no | Empty in production; only tests point it at a fake. |
| `LLM_MAX_CONCURRENT_JOBS` | no | Empty keeps the default of 2 model jobs at once ([ADR 0011](../../adr/0011-process-wide-llm-cost-caps.md)). |
| `LLM_MAX_CALLS_PER_HOUR` | no | Empty keeps the default of 60 model calls per rolling hour. |

Do not set `PORT`, `DATABASE_DIR`, `WEB_DIST_DIR` or `TRUST_PROXY`: the compose file pins them.

## 3. Attach the domain (from memory, verify in the UI)

**Domains** tab → **Add Domain**: host `<your domain>`, path `/`, service name `app`, container port `3000`, **HTTPS** on, certificate provider **Let's Encrypt** → **Create**. Dokploy adds the Traefik labels and its network to the service when it deploys; the compose file declares neither. The WebSocket on `/collaboration` needs no extra setting.

## 4. Deploy (from memory, verify in the UI)

**General** tab → **Deploy**. Follow the build under **Deployments** → the newest entry. The first build takes a few minutes: it installs dependencies and builds the web app and the server.

On the first start, the service's **Logs** show:

```text
created: ana@example.com, bruno@example.com, caio@example.com, dani@example.com
existing: 
listening on :3000
```

Later deploys list the four emails under `existing:` instead.

| What you see | Cause | Fix |
|---|---|---|
| `required variable AUTH_SECRET is missing a value` (or `APP_ORIGIN`, `SEED_DEMO_USERS`) in the deploy log | The Environment tab was not saved, or Dokploy wrote its `.env` outside the compose file's folder | Save the Environment tab and deploy again. If it persists, open the service's **Advanced** tab and set a custom compose command that adds `--env-file` with the path of the `.env` Dokploy writes, for example `--env-file ./.env` when it writes at the repository root (from memory, verify in the UI). Do not move the compose file: the repository root already holds the local `docker-compose.yml`. |
| `Missing environment variable: DEMO_PASSWORD (required when SEED_DEMO_USERS=true)` in the logs, container restarting | `DEMO_PASSWORD` is empty | Set it and deploy again, or set `SEED_DEMO_USERS=false`. |
| `SEED_DEMO_USERS must be true or false` in the logs | Any other value, for example `TRUE` or `1` | Set exactly `true` or `false`. |
| `Environment variable APP_ORIGIN must be a bare origin` | A path or a trailing slash | Set `https://<your domain>` and nothing else. |
| `Database directory is not writable: /data` | `/data` was replaced by a bind mount owned by root | Remove the mount from the **Advanced** → **Volumes** tab (from memory, verify in the UI); keep the named volume from the compose file. |
| The browser shows a Traefik `404 page not found` | The container is not healthy yet, or the domain is not attached to service `app`, port `3000`. Traefik skips a container while its health check is starting or failing, so the first ~20 s after every deploy answer 404 (from memory, verify in the UI). | Wait for **Logs** to show `listening on :3000` and about 20 s more. If the 404 stays, redo step 3. |
| The 404 stays although **Logs** show `listening on :3000` | The health check keeps failing. The container stays up but unhealthy: `restart: unless-stopped` restarts it only when it exits, never on a failing health check | On the VPS, `docker ps` shows the container as `unhealthy`; `docker inspect --format '{{json .State.Health}}' <container>` prints the last probes. Fix the cause and deploy again. |
| The container keeps restarting | It exits on start; Docker restarts it after every exit | Read the first error in **Logs**: it is one of the rows above. |
| A certificate warning | DNS did not resolve when Let's Encrypt asked | Fix the DNS record, then deploy again. |
| Sign-in answers `403` | `APP_ORIGIN` is not the URL in the browser's address bar | Set it to that exact origin and deploy again. |

## 5. Check it

```bash
curl -s https://<your domain>/api/health
```

prints `{"status":"ok"}`.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'content-type: application/json' -H 'origin: https://<your domain>' -d '{"email":"ana@example.com","password":"<the demo password>"}' https://<your domain>/api/auth/sign-in/email
```

prints `200`.

Then, in a browser:

1. Open `https://<your domain>`: the sign-in page loads over HTTPS without a warning.
2. Sign in as `ana@example.com` with the demo password, **Upload .docx** with [the brief](../../brief/superdoc-eng-sample-project.docx), and type a sentence.
3. **Share** → copy the edit link → open it in a private window, sign in as `bruno@example.com` and type next to Ana: each sees the other's edits within a second.
4. **Toggle timeline**: the chart shows both authors; click a moment, the document opens as it was, **Back to live** returns.
5. **Summarize edits** answers with one to three sentences (needs the OpenRouter key).

## 6. Hand it over

1. In `README.md`, replace the line that starts with `- **Demo:**` with `- **Demo:** https://<your domain>` and merge it through a pull request.
2. Make the repository public. This cannot be taken back: the whole history becomes public. First check the history for secrets, from a fresh clone of `main`; both commands must print what is shown:

   ```bash
   git log --all -p | grep -cE 'sk-or-v1-[A-Za-z0-9]{16,}'
   ```

   prints `0`, and

   ```bash
   git log --all --oneline -- .env deploy/.env
   ```

   prints nothing. Then GitHub → **Settings** → **General** → **Danger Zone** → **Change visibility**.
3. Send the delivery message: the demo URL, the GitHub link, the four demo emails and the demo password.
4. Optional: turn on **Autodeploy** in the **General** tab (from memory, verify in the UI) so every push to `main` deploys.

## 7. Roll back

Data stays on the volume across deploys and rollbacks. Migrations so far only add tables and columns, so an older release runs on a database that a newer one migrated.

**Revert (preferred).** Revert the bad pull request's merge commit on a branch, merge it, and deploy:

```bash
git switch main && git pull
git switch -c fix/revert-bad-release
git revert -m 1 <merge commit of the bad pull request>
git push -u origin fix/revert-bad-release
```

**Pin a known-good commit (fastest).** Point a branch at the last good commit and deploy it:

```bash
git push origin <last good commit>:refs/heads/release/rollback
```

Dokploy → **General** → branch `release/rollback` → **Save** → **Deploy** (from memory, verify in the UI), then run step 5 again. When `main` is fixed, set the branch back to `main`, deploy, and delete the branch with `git push origin --delete release/rollback`.

If your Dokploy version lists a **Rollback** action on a past entry under **Deployments** (from memory, verify in the UI), it does the same as pinning.

## 8. Back up and reset

Dokploy prefixes the volume with the service's app name (from memory, verify in the UI). Find it on the VPS:

```bash
docker volume ls --filter name=superdoc-data
```

**Back up.** **Stop** the service in Dokploy so SQLite is not writing, then:

```bash
docker run --rm -v <volume name>:/data:ro -v "$PWD":/backup busybox tar czf /backup/superdoc-data.tgz -C /data .
```

**Deploy** again to start it.

**Restore.** Stop the service, then:

```bash
docker run --rm -v <volume name>:/data -v "$PWD":/backup busybox sh -c 'find /data -mindepth 1 -delete && tar xzpf /backup/superdoc-data.tgz -C /data'
```

and deploy. `tar` running as root keeps the files owned by uid 1000, the `node` user the container runs as.

**Reset.** Stop the service, run `docker volume rm <volume name>`, and deploy: the volume is recreated empty, owned by `node`, and the demo accounts are seeded again.
````

- [ ] **Step 5: Run it green** — `pnpm --filter @superdoc-history/server exec vitest run src/deploy` → 26 passed. By hand: `openssl rand -base64 48 | tr -d '\n' | wc -c` prints 64 and the output contains no `$`.
- [ ] **Step 6: Commit**

```bash
git add docs/features/deploy/runbook.md && git commit -m "docs(deploy): add the Dokploy runbook"
```

---

### Task 5: Delivery README

**Files:**
- Modify: `README.md`, `apps/server/src/deploy/delivery-docs.test.ts`

**Interfaces:**
- Consumes: the runbook and its anchors (Task 4), ADR 0013 (Task 0), `deploy/docker-compose.yml` (Task 2), the `docker` job (Task 3), the UI labels in `apps/web` (`Upload .docx`, `New document`, `Share`, `Toggle timeline`, `Top edits`, `Back to live`, `Summarize edits`).
- Produces: the README sections `Live demo`, `Try it`, `Run locally`, `Run with Docker`, `Deploy (Dokploy)`, `Limits`, `Credits`, and the `- **Demo:**` line the runbook's step 6 replaces.

- [ ] **Step 1: Write the failing tests** — replace `apps/server/src/deploy/delivery-docs.test.ts` with:

```ts
import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import { capturedNames, composeVariables, readRepositoryFile, repositoryPath } from '../testing/repository-files';

const README_FILE = 'README.md';
const RUNBOOK_FILE = 'docs/features/deploy/runbook.md';
const LINKED_DOCUMENTS = [README_FILE, RUNBOOK_FILE];
const LINK_PATTERN = /\]\(([^)\s]+)\)/g;
const HEADING_PATTERN = /^#{1,6} (.+)$/gm;
const FENCED_BLOCK_PATTERN = /```[\s\S]*?```/g;
const SLUG_DISALLOWED_PATTERN = /[^a-z0-9 -]/g;
const SPACE_PATTERN = / /g;
const EXTERNAL_LINK_PATTERN = /^(https?:|mailto:|#)/;
const ANCHOR_SEPARATOR = '#';
const MARKDOWN_EXTENSION = '.md';
const SECOND_LEVEL_HEADING_PATTERN = /^## (.+)$/gm;
const DELIVERY_SECTIONS = ['Live demo', 'Try it', 'Run locally', 'Run with Docker', 'Deploy (Dokploy)', 'Limits', 'Credits'];
const STALE_SECTIONS = ['Status', 'Quick start', 'Citations'];
const RUNBOOK_LINK = `](${RUNBOOK_FILE})`;

function slugOf(heading: string): string {
  return heading.toLowerCase().replace(SLUG_DISALLOWED_PATTERN, '').replace(SPACE_PATTERN, '-');
}

function headingSlugs(path: string): string[] {
  return capturedNames({ text: readRepositoryFile(path).replace(FENCED_BLOCK_PATTERN, ''), pattern: HEADING_PATTERN }).map(slugOf);
}

function isBroken({ document, target }: { document: string; target: string }): boolean {
  const path = target.split(ANCHOR_SEPARATOR, 1).join('');
  const anchor = target.slice(path.length + ANCHOR_SEPARATOR.length);
  const targetPath = posix.join(posix.dirname(document), path);
  if (!existsSync(repositoryPath(targetPath))) return true;
  if (!anchor) return false;
  if (!targetPath.endsWith(MARKDOWN_EXTENSION)) return false;
  return !headingSlugs(targetPath).includes(anchor);
}

function brokenTargets({ document, text }: { document: string; text: string }): string[] {
  return capturedNames({ text, pattern: LINK_PATTERN }).filter((target) => !EXTERNAL_LINK_PATTERN.test(target)).filter((target) => isBroken({ document, target }));
}

function readmeSections(): string[] {
  return capturedNames({ text: readRepositoryFile(README_FILE), pattern: SECOND_LEVEL_HEADING_PATTERN });
}

describe('delivery documents', () => {
  test.each(LINKED_DOCUMENTS)('every relative link in %s points at a file and a heading in the repository', (document) => {
    expect(brokenTargets({ document, text: readRepositoryFile(document) })).toEqual([]);
  });

  test('a link to a heading its target does not have is reported', () => {
    const text = `[missing](${RUNBOOK_FILE}#no-such-heading) [present](${RUNBOOK_FILE}#6-hand-it-over)`;
    expect(brokenTargets({ document: README_FILE, text })).toEqual([`${RUNBOOK_FILE}#no-such-heading`]);
  });

  test('the README carries every delivery section', () => {
    expect(DELIVERY_SECTIONS.filter((section) => !readmeSections().includes(section))).toEqual([]);
  });

  test('the README drops the sections that went stale', () => {
    expect(STALE_SECTIONS.filter((section) => readmeSections().includes(section))).toEqual([]);
  });

  test('the README links the deploy runbook', () => {
    expect(readRepositoryFile(README_FILE)).toContain(RUNBOOK_LINK);
  });

  test('the runbook sets every variable the compose file reads', () => {
    const runbook = readRepositoryFile(RUNBOOK_FILE);
    expect(composeVariables().filter((name) => !runbook.includes(`\n${name}=`))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them red** — `pnpm --filter @superdoc-history/server exec vitest run src/deploy/delivery-docs.test.ts` → 3 failed, 4 passed: `expected [ 'Live demo', 'Try it', …(5) ] to deeply equal []`, `expected [ Array(3) ] to deeply equal []` (Status, Quick start, Citations still present), `expected '# SuperDoc History…' to contain '](docs/features/deploy/runbook.md)'`. Both link checks and the anchor case pass (the current README's links resolve and carry no anchors).
- [ ] **Step 3: Commit the red tests**

```bash
git add apps/server/src/deploy/delivery-docs.test.ts && git commit -m "test(readme): pin the delivery sections and links"
```

- [ ] **Step 4: README** — edit `README.md` on top of whatever `main` holds, in this order:
  1. Delete the whole `## Status` section (its heading and paragraph). In its place, before `## Features`, insert:

````markdown
## Live demo

- **Demo:** not deployed yet; the owner adds the URL after the first deploy ([runbook, step 6](docs/features/deploy/runbook.md#6-hand-it-over)).
- **Repository:** <https://github.com/dhyegocalota/superdoc-take-home>

The demo accounts' password comes with the delivery message. Every slice, its spec and its pull request are listed in the [roadmap](docs/features/README.md#roadmap).

## Try it

1. Sign in as `ana@example.com` with the demo password, or create your own account.
2. **Upload .docx** with your own file or with the brief ([`docs/brief/superdoc-eng-sample-project.docx`](docs/brief/superdoc-eng-sample-project.docx)); **New document** starts from a blank page.
3. Type a few sentences, delete a word, then **Share** and copy the edit link.
4. Open the link in a private window, sign in as `bruno@example.com` and edit next to Ana: each sees the other's edits and cursor.
5. **Toggle timeline**: the chart shows edit volume over time per topic (per author until topics exist), and **Top edits** lists who changed what.
6. Filter with plain text, or `@bruno` for one person: the chart, the list and the highlights narrow together.
7. Click a moment on the chart to read the document as it was then; **Back to live** returns.
8. **Summarize edits** writes one to three sentences about exactly the edits the panel shows.
````

  2. Replace the three lines `## Quick start`, the blank line, `Requirements: Node 24 (\`.nvmrc\`) and pnpm 8.15.9.`, the blank line and `### Local development` with:

```markdown
## Run locally

Requirements: Node 24 (`.nvmrc`) and pnpm 8.15.9.
```

  3. Move the paragraph that starts with `Run any command with the variables from \`.env\` loaded` from the Docker part to the end of `## Run locally` (after the paragraph about `WEB_DIST_DIR=apps/web/dist`), unchanged.
  4. Replace `### Docker` with `## Run with Docker`. At the end of the paragraph that ends with `the server creates \`/data/documents\` at boot.`, append the sentence: ``The entrypoint requires `SEED_DEMO_USERS` to be exactly `true` or `false`, and `DEMO_PASSWORD` when it is `true`.``
  5. After that paragraph, before `## Demo users`, insert:

````markdown
## Deploy (Dokploy)

Production runs [`deploy/docker-compose.yml`](deploy/docker-compose.yml) as a Dokploy compose service built from this repository: one container behind Traefik with HTTPS, its data on a named volume at `/data`, and every secret in the Dokploy environment ([ADR 0013](docs/adr/0013-deploy-with-dokploy-compose.md)). The compose file pins `TRUST_PROXY=true`, which is safe only behind that proxy. The [runbook](docs/features/deploy/runbook.md) creates the service, sets the environment, attaches the domain, checks the deploy, seeds the demo accounts and rolls back. CI builds and boots the image on every pull request (job `docker` in [`verify.yml`](.github/workflows/verify.yml)).
````

  6. In `## Demo users`, replace the sentences ``The password is `DEMO_PASSWORD` (`superdoc-demo` in `.env.example`). `pnpm seed` is idempotent.`` with: ``Locally the password is `DEMO_PASSWORD` (`superdoc-demo` in `.env.example`); on the demo URL it is the one in the delivery message. `pnpm seed` and the container's entrypoint are idempotent: existing accounts keep their password.``
  7. In `## Tests`, replace the `pnpm test:unit`, `pnpm test:e2e` and `pnpm verify` rows with:

```markdown
| `pnpm test:unit` | `libs/types`, `libs/history`, `apps/server` (real HTTP, real SQLite, real WebSocket; the 150 ms timeline latency budget is asserted only when `CI` is unset; the deploy checks in `apps/server/src/deploy` render the compose file with the Docker CLI and Compose v2, no daemon needed; that block is skipped without the Docker CLI and required in CI) and `apps/web` (Vitest and Testing Library) |
| `pnpm test:e2e` | Playwright specs for auth, documents and sharing, two-author collaboration, the timeline, time travel, topics and summaries; builds and starts the stack itself, needs Chromium (`pnpm exec playwright install chromium`) |
| `pnpm verify` | the three above, in order; the same gate runs in CI ([`verify.yml`](.github/workflows/verify.yml)) next to the `docker` job that builds and boots the image |
```

  8. Before `## Citations`, insert:

````markdown
## Limits

- **One instance.** SQLite files, the projection worker and the language-model caps live in one process ([ADR 0004](docs/adr/0004-stack.md)). The app does not scale horizontally, and a restart forgets the in-memory cooldowns.
- **Language-model caps.** At most 2 model jobs at once and 60 model calls per rolling hour for the whole server ([ADR 0011](docs/adr/0011-process-wide-llm-cost-caps.md)). Past them, topics show "The topics could not be named. Try again." and summaries show "The edits could not be summarized. Try again.", and editing keeps working.
- **No email.** Accounts have no verification and no password reset; the demo accounts share one password.
- **DOCX only.** Up to 10 MB per file; no PDF or image import.
- **Manual backups.** The [runbook](docs/features/deploy/runbook.md#8-back-up-and-reset) shows how to copy the data volume.
````

  9. Rename `## Citations` to `## Credits`; its text stays as it is.

  Check: `grep -n "^## " README.md` prints, in order, `Live demo`, `Try it`, `Features`, `Run locally`, `Run with Docker`, `Deploy (Dokploy)`, `Demo users`, `Tests`, `Architecture in brief`, `Process`, `Limits`, `Credits`, `License`.
- [ ] **Step 5: Run them green** — `pnpm --filter @superdoc-history/server exec vitest run src/deploy` → 30 passed.
- [ ] **Step 6: Commit**

```bash
git add README.md && git commit -m "docs(readme): add the live demo, try it, deploy, limits and credits sections"
```

---

### Task 6: Production notes in `.env.example`

**Files:**
- Modify: `.env.example`, `apps/server/src/deploy/delivery-docs.test.ts`

**Interfaces:**
- Consumes: `capturedNames`, `composeVariables`, `readRepositoryFile`, `repositoryPath`; the runbook (Task 4).
- Produces: a `# Secret…` note on the line above `AUTH_SECRET`, `DEMO_PASSWORD` and `OPENROUTER_API_KEY`.

- [ ] **Step 1: Write the failing tests** — replace `apps/server/src/deploy/delivery-docs.test.ts` with:

```ts
import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import { capturedNames, composeVariables, readRepositoryFile, repositoryPath } from '../testing/repository-files';

const README_FILE = 'README.md';
const RUNBOOK_FILE = 'docs/features/deploy/runbook.md';
const ENVIRONMENT_EXAMPLE_FILE = '.env.example';
const LINE_SEPARATOR = '\n';
const SECRET_NOTE_PREFIX = '# Secret';
const SECRET_VARIABLES = ['AUTH_SECRET', 'DEMO_PASSWORD', 'OPENROUTER_API_KEY'];
const LINKED_DOCUMENTS = [README_FILE, RUNBOOK_FILE];
const LINK_PATTERN = /\]\(([^)\s]+)\)/g;
const HEADING_PATTERN = /^#{1,6} (.+)$/gm;
const FENCED_BLOCK_PATTERN = /```[\s\S]*?```/g;
const SLUG_DISALLOWED_PATTERN = /[^a-z0-9 -]/g;
const SPACE_PATTERN = / /g;
const EXTERNAL_LINK_PATTERN = /^(https?:|mailto:|#)/;
const ANCHOR_SEPARATOR = '#';
const MARKDOWN_EXTENSION = '.md';
const SECOND_LEVEL_HEADING_PATTERN = /^## (.+)$/gm;
const DELIVERY_SECTIONS = ['Live demo', 'Try it', 'Run locally', 'Run with Docker', 'Deploy (Dokploy)', 'Limits', 'Credits'];
const STALE_SECTIONS = ['Status', 'Quick start', 'Citations'];
const RUNBOOK_LINK = `](${RUNBOOK_FILE})`;

function slugOf(heading: string): string {
  return heading.toLowerCase().replace(SLUG_DISALLOWED_PATTERN, '').replace(SPACE_PATTERN, '-');
}

function headingSlugs(path: string): string[] {
  return capturedNames({ text: readRepositoryFile(path).replace(FENCED_BLOCK_PATTERN, ''), pattern: HEADING_PATTERN }).map(slugOf);
}

function isBroken({ document, target }: { document: string; target: string }): boolean {
  const path = target.split(ANCHOR_SEPARATOR, 1).join('');
  const anchor = target.slice(path.length + ANCHOR_SEPARATOR.length);
  const targetPath = posix.join(posix.dirname(document), path);
  if (!existsSync(repositoryPath(targetPath))) return true;
  if (!anchor) return false;
  if (!targetPath.endsWith(MARKDOWN_EXTENSION)) return false;
  return !headingSlugs(targetPath).includes(anchor);
}

function brokenTargets({ document, text }: { document: string; text: string }): string[] {
  return capturedNames({ text, pattern: LINK_PATTERN }).filter((target) => !EXTERNAL_LINK_PATTERN.test(target)).filter((target) => isBroken({ document, target }));
}

function readmeSections(): string[] {
  return capturedNames({ text: readRepositoryFile(README_FILE), pattern: SECOND_LEVEL_HEADING_PATTERN });
}

function lineAbove({ lines, name }: { lines: string[]; name: string }): string {
  const index = lines.findIndex((line) => line.startsWith(`${name}=`));
  if (index < 1) throw new Error(`${ENVIRONMENT_EXAMPLE_FILE} has no line above ${name}=`);
  return lines.slice(index - 1, index).join('');
}

describe('delivery documents', () => {
  test.each(LINKED_DOCUMENTS)('every relative link in %s points at a file and a heading in the repository', (document) => {
    expect(brokenTargets({ document, text: readRepositoryFile(document) })).toEqual([]);
  });

  test('a link to a heading its target does not have is reported', () => {
    const text = `[missing](${RUNBOOK_FILE}#no-such-heading) [present](${RUNBOOK_FILE}#6-hand-it-over)`;
    expect(brokenTargets({ document: README_FILE, text })).toEqual([`${RUNBOOK_FILE}#no-such-heading`]);
  });

  test('the README carries every delivery section', () => {
    expect(DELIVERY_SECTIONS.filter((section) => !readmeSections().includes(section))).toEqual([]);
  });

  test('the README drops the sections that went stale', () => {
    expect(STALE_SECTIONS.filter((section) => readmeSections().includes(section))).toEqual([]);
  });

  test('the README links the deploy runbook', () => {
    expect(readRepositoryFile(README_FILE)).toContain(RUNBOOK_LINK);
  });

  test('the runbook sets every variable the compose file reads', () => {
    const runbook = readRepositoryFile(RUNBOOK_FILE);
    expect(composeVariables().filter((name) => !runbook.includes(`\n${name}=`))).toEqual([]);
  });

  test.each(SECRET_VARIABLES)('the example file marks %s as a secret', (name) => {
    expect(lineAbove({ lines: readRepositoryFile(ENVIRONMENT_EXAMPLE_FILE).split(LINE_SEPARATOR), name })).toMatch(new RegExp(`^${SECRET_NOTE_PREFIX}`));
  });
});
```

- [ ] **Step 2: Run them red** — `pnpm --filter @superdoc-history/server exec vitest run src/deploy/delivery-docs.test.ts` → 3 failed, 7 passed: `expected 'APP_ORIGIN=http://localhost:5173' to match /^# Secret/`, `expected 'DATABASE_DIR=./data' to match /^# Secret/`, `expected '# NB: LLM access goes through OpenRou…' to match /^# Secret/`.
- [ ] **Step 3: Commit the red tests**

```bash
git add apps/server/src/deploy/delivery-docs.test.ts && git commit -m "test(deploy): pin the secret notes in the example environment"
```

- [ ] **Step 4: Notes** — replace `.env.example` with (every value is unchanged; only `#` lines are added):

```dotenv
# Local values work as they are. Production values live in the Dokploy environment (docs/features/deploy/runbook.md); deploy/docker-compose.yml pins PORT, DATABASE_DIR, WEB_DIST_DIR and TRUST_PROXY
PORT=3000
# Production: https://<your domain>, a bare origin with no path and no trailing slash
APP_ORIGIN=http://localhost:5173
# Secret. Production: a fresh value from `openssl rand -base64 48`; this placeholder is public and must never reach a deploy
AUTH_SECRET=change-me-32-characters-minimum-secret
DATABASE_DIR=./data
# Secret in production: the demo accounts' password, set only in the Dokploy environment and shared in the delivery message
DEMO_PASSWORD=superdoc-demo
# NB: set TRUST_PROXY=true only behind Traefik (deploy), which overwrites X-Forwarded-For; keep false for local runs
TRUST_PROXY=false
# Exactly true or false. Production: true; the container then seeds the four demo accounts on start and requires DEMO_PASSWORD
SEED_DEMO_USERS=false
# NB: LLM access goes through OpenRouter (owner decision); the model id is configurable
# Secret. Production: the owner's key, set only in the Dokploy environment; empty keeps the app running without topics and summaries
OPENROUTER_API_KEY=
LLM_MODEL=openai/gpt-6-luna
# Empty in production; tests point it at a fake
OPENROUTER_BASE_URL=
# Optional: process-wide cap on LLM jobs running at once (default 2)
LLM_MAX_CONCURRENT_JOBS=
# Optional: process-wide cap on model calls per rolling hour (default 60)
LLM_MAX_CALLS_PER_HOUR=
```

  Check: `git diff -U0 .env.example | grep '^[-+][A-Z]'` prints nothing (no value changed); `sh -c 'set -a; . ./.env.example; set +a; echo "$SEED_DEMO_USERS $LLM_MODEL"'` prints `false openai/gpt-6-luna`.
- [ ] **Step 5: Run everything green** — `pnpm --filter @superdoc-history/server exec vitest run src/deploy` → 33 passed; `pnpm typecheck` clean; `pnpm --filter @superdoc-history/server test:unit` green.
- [ ] **Step 6: Commit**

```bash
git add .env.example && git commit -m "docs(env): add production notes to the example environment"
```

---

### Z. Prove and ship

- [ ] **Z1: Tester briefing** — `developer-s5` fills `docs/features/deploy/tester-briefing.md`: what changed (one line per task), how to run the deploy suite (`pnpm --filter @superdoc-history/server exec vitest run src/deploy`), the production-shaped local run of the entrypoint (from `apps/server` after `pnpm build`: `env PORT=3300 APP_ORIGIN=http://127.0.0.1:3300 AUTH_SECRET=deploy-walk-secret-0123456789abcdef0123 DATABASE_DIR=$(mktemp -d) TRUST_PROXY=true SEED_DEMO_USERS=true DEMO_PASSWORD=deploy-walk-password WEB_DIST_DIR=../web/dist sh ../../docker/entrypoint.sh`), and **the Docker caveat**: this machine cannot pull images, so every image box is checked from the CI `docker` job's log on the draft PR, and the runbook boxes marked OWNER are the owner's morning acceptance after merge. Commit: `git add docs/features/deploy/tester-briefing.md && git commit -m "docs(deploy): add the tester briefing"`.
- [ ] **Z2: Tester run (local boxes)** — a fresh `tester` sub-agent executes `test-plan.md`: every local box ticked with evidence; the CI boxes marked `BLOCKED: runs on the pull request`; the OWNER boxes marked `BLOCKED: owner-executed after merge`.
- [ ] **Z3: Reviewer** — a fresh `reviewer` sub-agent reviews `git diff main...HEAD` against the spec, with the five Review focus lines as its checklist, and refutes the three adversarial claims in `test-plan.md`. Findings fixed through new red/green commits before Z5.
- [ ] **Z4: Learnings** — write, with the `learning` skill, `docs/learnings/<date>-pnpm-deploy-refuses-a-non-empty-target.md` (Signal: the image build stops with `ERR_PNPM_DEPLOY_DIR_NOT_EMPTY` right after a folder is added to the repository; Cause: the build stage copies the whole repository into `/workspace` and then deploys into a folder under it; Do: deploy into a folder the repository cannot have and pin it with `dockerfile.test.ts`; Anchor: `docker/Dockerfile`, `apps/server/src/deploy/dockerfile.test.ts`), add it to the `tooling` table in `docs/learnings/README.md`, and append a `Revisited` line to `docs/learnings/2026-10-16-a-red-first-commit-must-fail-on-the-named-assertion.md` ("still true; slice 5 used stub compose and runbook files so each red run reached its assertion"). State any other learning found, or "nothing else learned". Commit: `git add docs/learnings/<file> docs/learnings/README.md docs/learnings/2026-10-16-a-red-first-commit-must-fail-on-the-named-assertion.md && git commit -m "docs(learnings): record the pnpm deploy target trap"`.
- [ ] **Z5: `/open-pr deploy --draft`** — gates 1–6 pass with the CI and OWNER boxes `BLOCKED` as above; no UI changed, so no `/check-ui` media (state it in the PR body). The PR body lists the morning steps for the owner (runbook steps 1–7) and links ADR 0013 and the runbook.
- [ ] **Z6: CI evidence** — when both jobs finish, the tester ticks the CI boxes from `gh pr checks` and `gh run view <run id> --log --job <docker job id>`; a red `docker` job sends the PR back to Build. Then `gh pr ready`.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|---|---|---|---|
| 1.5 | The manifest-only layer misses a workspace importer added later | CI build fails at `pnpm install` with `ERR_PNPM_OUTDATED_LOCKFILE` or a missing `workspace:*` package | add the `COPY <package>/package.json` line; the Step 5 importer check lists them |
| 1.5 | A dependency's install script needs sources that are not copied yet | CI build fails inside `RUN pnpm install` naming that package's `postinstall` | `git revert` the `chore(docker)` commit (the entrypoint commit stays) and keep `COPY . .` before install |
| 1.4 | Someone runs the image without `SEED_DEMO_USERS` and it now exits | `SEED_DEMO_USERS must be true or false, received: ''` in the container log | set the flag; documented in README and runbook; reverting `fix(docker)` restores the silent skip |
| 2.3 | CI's newer Compose renders JSON differently (numbers in `expose`, extra keys) | `compose.test.ts` fails only in the CI `verify` job | loosen that assertion to `objectContaining` or compare strings; never drop the assertion |
| 2.3 | A developer machine has no Docker CLI | the rendering block of `compose.test.ts` shows 8 skipped; in CI, where `REQUIRE_DOCKER_COMPOSE=true`, the file fails with `Docker Compose v2 is required in CI` | locally nothing to do (the skip names why); in CI fix the runner image, never drop the flag |
| 3.4 | The GitHub Actions cache is unavailable or rate-limited | build step warns `failed to export cache` or runs cold for ~6 min | rerun; if it persists, drop `cache-to` in a follow-up, the build still proves the image |
| 3.4 | The image boots in CI but health never answers | `Health answers 200` gives up after `--retry-max-time 120` (each try capped by `--max-time 5`); the `docker logs app` step prints the first error (migration, native module, env) | back to Build with that log line; the PR stays draft |
| 3.4 | The restart re-seeds or loses data | `Restart keeps the data and the accounts` fails: no `existing: ana@example.com` in `app.log`, or sign-in is not 200 | back to Build: seeding must stay idempotent and `/data` must survive a restart |
| 3.4 | `docker run` of the refusal step pulls nothing but `--rm` hides the log | the step fails without output | `refusal.log` is printed before the assertions; read it |
| 4.4 | Dokploy writes its `.env` outside the compose file's folder | deploy log `required variable AUTH_SECRET is missing a value` although the tab is saved | the runbook row: a custom compose command in Dokploy's Advanced tab that adds `--env-file` with the path Dokploy writes (from memory); the compose file is not moved, the root already holds the local `docker-compose.yml` |
| 4.4 | A runbook Dokploy label differs from the owner's version | the owner cannot find a button named in step 1 or 3 | the step is marked "from memory"; the owner notes the real label and a docs follow-up fixes the runbook |
| 5.4 | Slice 4 changed the README sections this task edits | an anchor sentence in Step 4 is not found | apply the same intent to `main`'s text; the delivery-docs suite is the arbiter |
| 6.4 | A note line misses its `#` and `scripts/with-env.sh` executes it | `with-env.sh` fails with `command not found` | add the `#`; the Step 4 `sh` check catches it before commit |
| Z5 | Owner acceptance fails after merge (Traefik 404, certificate, unhealthy container) | the runbook's step 5 checks fail | the runbook's failure table (a 404 for ~20 s after a deploy is expected; a lasting one is not); roll back with step 7; the data volume is untouched |

**Steps with no backout:** none inside the repository; every commit is a revert away. Outside it, the owner's **repository-public switch** (runbook step 6.2) cannot be taken back in effect: once public, the history is cloned and cached. The no-secret checks of Tasks 2 and 6 cover the working tree; the runbook's history scan (step 6.2, an OWNER box) covers every commit and runs right before the switch.

## Self-review

- Spec coverage: Goal 1 (production compose, no edits in Dokploy, secrets from the environment) → Task 2; Goal 2 (ten-minute runbook: create, environment with values and `AUTH_SECRET` generation, domain with HTTPS, deploy, health, sign-in, seed, rollback) → Task 4; Goal 3 (CI builds the image with the GitHub Actions cache, no push) → Task 3, plus the boot and restart checks; Goal 4 (delivery README: demo URL sentence, GitHub link, what to try first, credits, limits, run locally and with Docker) → Task 5; Goal 5 (production defaults as decisions: `TRUST_PROXY=true`, seeding with an owner password, `LLM_MODEL`, caps at defaults, `APP_ORIGIN=https://<domain>`) → ADR 0013 (Task 0), compose pins (Task 2), runbook environment block (Task 4), `.env.example` notes (Task 6). Files list: the `deploy/README.md` line is replaced by the runbook (Task 0 amendment); `docker/Dockerfile` changed for the reasons recorded (Task 1). Failure table: missing env → Tasks 2 and 4; `SEED_DEMO_USERS=false` → Task 1; image build broken → Task 3; bad deploy → runbook step 7; health failing → Task 3 and the runbook table. Security: keys only, empty example key, `openssl rand -base64 48`, `TRUST_PROXY` only behind Traefik, password never printed → Tasks 2, 4, 5, 6. Test strategy: compose `config` → Task 2; entrypoint shell test → Task 1; CI job → Tasks 3 and Z6; README and runbook links → Tasks 4 and 5; tester `BLOCKED` with the owner's deploy as acceptance → test plan.
- Not turned into tasks: multi-instance, registry pushes, managed services (spec non-goals); running the deploy from this session (non-goal; Dokploy tokens answer 403).
- Placeholders: none. Angle-bracket values inside the runbook (`<your domain>`, `<the demo password you chose>`) are instructions to the owner, and `Date:` in the ADR is the output of `date +%F` at Task 0.
- Names: `REPOSITORY_ROOT`, `repositoryPath`, `readRepositoryFile`, `capturedNames`, `DEPLOY_COMPOSE_FILE`, `composeVariables` are spelled identically in Tasks 1, 2, 4, 5 and 6; the volume `superdoc-data`, service `app`, port `3000` and folder `/workspace/release` likewise. The entrypoint messages in Task 1 match the CI grep in Task 3 and the runbook rows in Task 4.
- Verified while planning, in a throwaway copy of `main`: every test file in this plan typechecks and passes against the files in this plan (33 tests; without the Docker CLI the compose rendering block shows 8 skipped, and with `REQUIRE_DOCKER_COMPOSE=true` the file throws), each red run fails on the assertion stated in its step, `docker compose config --format json` renders the compose file as asserted on Compose v2.13.0, a manifests-only `pnpm install --frozen-lockfile` resolves all five importers, `pnpm deploy` into a folder holding a file fails with `ERR_PNPM_DEPLOY_DIR_NOT_EMPTY`, and the workflow parses as YAML with jobs `verify` and `docker`. Compose reads a `.env` beside the compose file for interpolation, keeps base64 characters (`+/=`) and turns `ab$cd-ef` into `ab-ef` (the runbook's no-`$` rule); the compose test passes `--env-file /dev/null`, so a stray local `deploy/.env` cannot change its result.
