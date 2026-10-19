# Faster CI

**Status:** Shipped 2026-10-17
**Tier:** 🟡 medium (CI layout, Playwright parallelism, one new option through `startServer` into `ProjectionScheduler`)
**Owner approval:** approved 2026-10-17 (chat: the three lanes as proposed; no push until the owner says so)
**ADRs:** [0018](../../adr/0018-fan-out-ci-and-prebuild-the-projection-worker.md)
**Not changing:** the `docker` job, what the tests assert about the product, the production worker spawn path, the cooldown and throttle constants, the Dockerfile.

## Problem

A pull request waits 15 to 16 minutes for the `verify` job: 9m15s of E2E specs run one at a time, 5m03s of unit tests where the server package boots 93 servers whose projection worker is transpiled by tsx on every boot while the web package's jsdom workers fight for the same four cores. The repository is private, so the minutes are billed too (about 18 per run).

## Goals

1. Wall time per push of about 4 minutes; billed minutes at or below today's.
2. E2E specs run in parallel on CI with four workers and stay green together.
3. Server unit tests boot a prebuilt projection worker bundle, built once per Vitest run with the production build options.
4. Typecheck, each unit package, E2E and the Docker image run as independent jobs; a red job names what failed.
5. Every change is pinned by a test: the workflow layout, the scheduler's worker-file option, the prebuilt bundle, the sign-in helper.

## Non-goals

- Sharding the E2E suite across runners (ADR 0018: single runner; revisit past four minutes).
- Making the selection-summary cooldown configurable; the 43 s spec stays as it is.
- Sharing a server across tests within a file.
- A gate job for branch protection (none exists on this plan).

## Design

### Data flow

```
verify.yml
  typecheck ─ composite install ─ pnpm typecheck
  unit[libs|web|server] ─ composite install ─ pnpm --filter <package> test:unit   (server: REQUIRE_DOCKER_COMPOSE=true)
  docker ─ unchanged

e2e.yml (workflow_dispatch only, never on push or pull request)
  e2e ─ composite install ─ playwright version ─ browsers cache ─ playwright install --with-deps chromium ─ pnpm test:e2e ─ artifacts on failure

apps/server vitest run
  globalSetup: tsup build(projection-worker.ts, serverBuildOptions) → node_modules/.cache/superdoc-collab-vitest/projection-worker.js
               process.env.PROJECTION_WORKER_FILE = file:// URL
  test → startTestServer → startServer({ projectionWorkerFile }) → new ProjectionScheduler({ databaseDirectory, projectionWorkerFile })
       → createWorker: file given → new Worker(file); none → today's source/dist resolution
```

### Interfaces

- `.github/actions/install/action.yml`: composite action; pnpm, Node from `.nvmrc` with the pnpm cache, `pnpm install --frozen-lockfile`. Callers check out first.
- `.github/workflows/verify.yml`: jobs `checks` (`timeout-minutes: 5`; `pnpm format:check`, `pnpm typecheck`, `pnpm test:hooks`, the gates main added while the branch was open), `unit` (`timeout-minutes: 10`; matrix `include` of `name` and `filter`: `libs` → `./libs/*`, `web` → `@superdoc-collab/web`, `server` → `@superdoc-collab/server`; `fail-fast: false`; step `pnpm --filter "${{ matrix.filter }}" test:unit`, the filter quoted so the shell never expands the glob; step env `REQUIRE_DOCKER_COMPOSE: ${{ matrix.name == 'server' }}`, which renders `true` or `false`), `docker` (unchanged, `timeout-minutes: 20`). The `e2e` job moved to `.github/workflows/e2e.yml` (owner's decision on 2026-10-17): `on: workflow_dispatch` only, the same steps (version step, browsers cache keyed by it, `playwright install --with-deps chromium`, `pnpm test:e2e`, failure artifacts), `timeout-minutes: 15`, read-only token; run on request with `gh workflow run e2e.yml --ref <branch>` before a merge.
- `playwright.config.ts`: file-level parallelism only, no `fullyParallel`. Measured 2026-10-17: `--fully-parallel --workers=4` ran in 1.9 min but failed `selection-summary.spec.ts:49` because `readSelectionCalls` reads a process-wide counter on the fake OpenRouter that the file's other specs move concurrently; file-level parallelism keeps a file's specs in one worker and ran in 2.3 min. `workers` is `CONTINUOUS_INTEGRATION_WORKERS` (4) when `process.env.CI` is set and `LOCAL_WORKERS` (`'50%'`) otherwise. A later change may opt single files into parallel tests once their shared counters are per document.
- `e2e/fixtures.ts` `expectSignedInAs`: asserts the documents URL and the banner name. `e2e/auth.spec.ts` sign-up spec asserts `MINE_EMPTY_MESSAGE` imported from `../apps/web/src/features/documents/documents-copy`, as `documents.spec.ts` already does, for its brand-new user.
- `apps/server/tsup.config.ts`: exports `serverBuildOptions: Options` and `export default defineConfig(serverBuildOptions)`.
- `apps/server/vitest.global-setup.ts`: default export builds the worker with `{ ...serverBuildOptions, entry: { 'projection-worker': ... }, outDir, clean: true, silent: true, config: false }` (`config: false` so tsup does not merge `tsup.config.ts` from the working directory a second time) and sets `process.env.PROJECTION_WORKER_FILE`; returns a teardown that clears the variable. `apps/server/vitest.config.ts` lists it under `globalSetup`.
- `apps/server/src/testing/test-server.ts`: `prebuiltProjectionWorkerFile(): URL | null` reads the variable; `startTestServer` passes `projectionWorkerFile` to `startServer`. `apps/server/src/server.test.ts` calls `startServer` directly ten times and passes `prebuiltProjectionWorkerFile()` too.
- `apps/server/src/server.ts` `startServer({ ..., projectionWorkerFile = null }: { ...; projectionWorkerFile?: URL | null })` forwards to the scheduler.
- `apps/server/src/history/projection-scheduler.ts`: constructor `{ databaseDirectory, projectionWorkerFile = null }`; `createWorker({ databaseDirectory, projectionWorkerFile })` spawns the file when it is not null.
- `apps/server/src/deploy/ci-workflow.test.ts`: pins the new layout (job names, no `needs` anywhere, the composite action used by the three Node jobs, the matrix entries, `REQUIRE_DOCKER_COMPOSE` tied to the server entry, bounded timeouts, the docker job untouched).

### Failure handling

- `PROJECTION_WORKER_FILE` unset (a test run outside Vitest's global setup): `prebuiltProjectionWorkerFile()` returns null and the scheduler falls back to the tsx source path; slower, still correct.
- `PROJECTION_WORKER_FILE` names a missing file: each spawn fails, the error listener logs it, the scheduler restarts the worker until `MAX_WORKER_RESTARTS_PER_WINDOW` and then degrades, exactly as for any crashing worker.
- The tsup build fails in global setup: Vitest aborts before any test with tsup's error; nothing runs against a stale bundle because `clean: true` empties the cache directory first.
- A matrix entry fails: `fail-fast: false` lets the other entries finish so the red job names every failing package.
- Parallel E2E flake from shared demo users: the helper no longer asserts an empty list; any future spec that needs an empty list must sign up its own user (ADR 0018 consequences).

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Build the three lanes (parallel E2E, job fan-out, prebuilt worker)? | yes / subset | yes, keep it local, no push yet | 2026-10-17 |
| Run the E2E suite on every push and pull request? | automatic job / manual dispatch only | manual only: "é muito demorado e caro"; run on request before the actual merge | 2026-10-17 |
| Shard E2E across two runners? | two runners (wall ~3 min, ~16 billed) / one runner (wall ~4.5 min, ~14 billed) | not answered; one runner taken as the cheaper default (ADR 0018), owner can override | 2026-10-17 |

## Test strategy summary

Unit: workflow pins in `ci-workflow.test.ts`; scheduler spawns a given file (`projection-scheduler.test.ts`); the Vitest run publishes a bundle that exists (`testing/prebuilt-worker.test.ts`). E2E: the whole suite with spec files in parallel workers (no `fullyParallel`), three runs in a row, zero failures. Tester: timing evidence for the prebuilt worker (the hypothesis was a boot under 150 ms against 340 ms before; developer-1 measured 271 ms against 334 ms, the rest being the bundle's own load, and the server suite at 65 s against 99 s locally), the local E2E wall time, `act`-free workflow validation with `actionlint` if installed, otherwise a YAML parse.
