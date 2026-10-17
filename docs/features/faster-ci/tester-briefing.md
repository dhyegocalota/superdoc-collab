# Tester briefing: <Feature title>

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- <file or module> — <one line>

## How to run

```bash
<commands to start the stack and open the feature>
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `<path>::<name>` |  |  |

## Hypotheses to attack

Every "it works" is a hypothesis the tester tries to break.

1. Hypothesis: <claim>. Break it by: <suggested attack>.

## Known gaps

- <what the developer knows is missing or untested>

## G3

**Changed:** `.github/workflows/verify.yml` now has the jobs `typecheck`, `unit` (matrix `libs`, `web`, `server`, `fail-fast: false`), `e2e` and `docker`, with no `needs:`. `.github/actions/install/action.yml` is a new composite action (pnpm, Node from `.nvmrc`, pnpm cache keyed on `pnpm-lock.yaml`, frozen install). `apps/server/src/deploy/ci-workflow.test.ts` has a `job(name)` slicer and the new pins. The docker job is unchanged.

**Run:** `pnpm --filter @superdoc-history/server exec vitest run src/deploy/ci-workflow.test.ts` (16 tests).

**Red then green:** commit 04ae9d3 fails 8 of 16 on the old workflow (job list is `['verify', 'docker']`, missing `typecheck`, `unit` and `e2e` jobs). Commit 0142f47 turns them green. Commit 337b690 only fixes a type error in the test.

**Hypotheses to verify:**
- The workflow and action files parse as YAML (parsed with Ruby; `actionlint` is not installed here).
- On a real run, the three Node jobs start in parallel and the matrix legs show as `unit (libs)`, `unit (web)` and `unit (server)`.
- Each filter matches a package: `./libs/*`, `@superdoc-history/web`, `@superdoc-history/server`.
- Only the server leg sets `REQUIRE_DOCKER_COMPOSE` to true; the others get false.
- `cache: pnpm` with `cache-dependency-path` works inside the composite action.

**Gaps:** nothing here ran on GitHub Actions. The "no `needs:`" test already passed before the change, so it guards against regression only. `pnpm typecheck` still reports one error from the G1 projection-scheduler red test, outside G3.

## G2

### What changed

- `e2e/fixtures.ts`: `expectSignedInAs` asserts the URL and the banner name only.
- `e2e/auth.spec.ts`: the sign-up spec asserts `MINE_EMPTY_MESSAGE` for its brand-new user.
- `playwright.config.ts`: `workers: process.env.CI ? CONTINUOUS_INTEGRATION_WORKERS : LOCAL_WORKERS` with `4` and `'50%'`. No `fullyParallel`.

### How to run

```bash
pnpm typecheck:e2e
pnpm test:e2e
```

### Red today, green after

Red on the untouched tree with `pnpm test:e2e --workers=4 e2e/auth.spec.ts e2e/documents.spec.ts` (2 failed, 14 passed), both on `getByText('No documents yet')`:

- `e2e/auth.spec.ts:25:5 › visiting documents signed out redirects to sign-in and returns after login`
- `e2e/auth.spec.ts:42:5 › two users in two contexts see their own names`

### Runs with the final config

```
48 passed (2.0m)
48 passed (2.0m)
48 passed (2.0m)
```

### Hypotheses to attack

1. Hypothesis: no spec depended on the empty-state text from `expectSignedInAs` except the sign-up spec. Break it by: grep for other callers and run with `--workers=4` repeatedly.
2. Hypothesis: file-level parallelism is stable. Break it by: run with `CI=1` and with `--repeat-each=3`.

### Known gaps

- Only local runs; `CI=1` on GitHub runners is unmeasured.

## G1

### What changed

- `apps/server/src/history/projection-scheduler.ts`: the constructor takes `projectionWorkerFile` (default `null`); `createWorker` spawns it when it is not null and keeps the source and dist paths otherwise.
- `apps/server/src/server.ts`: `startServer` accepts `projectionWorkerFile` and forwards it to the scheduler.
- `apps/server/src/testing/test-server.ts`: `prebuiltProjectionWorkerFile()` reads `PROJECTION_WORKER_FILE`; `startTestServer` passes it. `apps/server/src/server.test.ts` passes it in its ten direct `startServer` calls.
- `apps/server/tsup.config.ts`: exports `serverBuildOptions`; the default export wraps it.
- `apps/server/vitest.global-setup.ts` (new) builds only the worker entry into `apps/server/node_modules/.cache/superdoc-history-vitest/` and sets the variable; `vitest.config.ts` lists it under `globalSetup`.

### How to run

```bash
pnpm --filter @superdoc-history/server test:unit
pnpm typecheck
```

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `projection-scheduler.test.ts::a given worker file is the one spawned` (red at c43c936) | the constructor ignored the option, the real worker booted and failed with `no such table: projection_cursor` | the probe worker answers with the probe sequence (379ecef) |
| `testing/prebuilt-worker.test.ts::the Vitest run publishes a prebuilt projection worker that exists` (red at 87cea72) | `expected undefined to be defined` | global setup builds the bundle and sets the variable (54d828d) |

### Measurements

Probe: start server, `scheduler.forget`, sign up and in, stop. Five runs each, milliseconds, probe file deleted afterwards.

| Worker | Boot (forget round trip) | Whole probe run |
|--------|--------------------------|-----------------|
| prebuilt bundle | 253 to 290 (median 271) | 349 to 433 |
| tsx source (variable deleted) | 328 to 341 (median 334) | 430 to 438 |

Vitest `Duration` of the server suite: 98.91 s before, 65.51 s after (40 passed and 2 skipped of 42 files before; 41 and 2 of 43 after). One run each, on a machine with other agents active.

### Hypotheses to attack

1. Hypothesis: every `startTestServer` and every `server.test.ts` server spawns the bundle, not the source. Break it by: log `process.env.PROJECTION_WORKER_FILE` in a test, or spy on `Worker` construction.
2. Hypothesis: the bundle resolves `better-sqlite3` and `@superdoc/sdk` from `apps/server/node_modules`. Break it by: run a projection test (`events-client` flow) and look for `Cannot find package` in stderr.
3. Hypothesis: a stale bundle never runs. Break it by: change `projection-worker.ts`, rerun, and check the output differs; `clean: true` empties the directory first.
4. Hypothesis: a missing file degrades like any crashing worker. Break it by: set the variable to a missing path and expect restarts then the degraded message.
5. Hypothesis: the production build still emits `main`, `seed` and `projection-worker`. Break it by: `pnpm --filter @superdoc-history/server build` and list `dist/`.

### Known gaps

- The spec's goal of a worker boot under 150 ms is not met: the prebuilt boot is about 270 ms against 334 ms. The remaining time is the bundle's own load (importing `@superdoc/sdk` alone costs about 80 ms) plus opening SQLite and running migrations in the worker.
- The variable name is declared in `test-server.ts` and again in `vitest.global-setup.ts`, because importing `test-server.ts` into the setup would load the whole server in the Vitest main process.
- The teardown clears the variable and leaves the bundle in the cache directory; the next run's `clean: true` replaces it.
- Not run: the E2E suite, the production build, the test plan.
