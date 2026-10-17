# Plan: Faster CI

**Spec:** spec.md
**Tier:** 🟡 medium
**Seam:** `startServer` → `ProjectionScheduler` (one new optional input); Playwright config and `e2e/fixtures.ts`; `.github/`.
**Assumptions (decided, owner can override):**
- One E2E runner, no sharding (ADR 0018).
- The prebuilt bundle lives under `apps/server/node_modules/.cache/superdoc-history-vitest/` so `better-sqlite3` and `@superdoc/sdk` resolve from `apps/server/node_modules` exactly as they do from `dist/`.
- No gate job; no branch protection exists on this plan.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/server/src/history/projection-scheduler.ts`, `apps/server/src/history/projection-scheduler.test.ts`, `apps/server/src/server.ts`, `apps/server/src/server.test.ts`, `apps/server/src/testing/test-server.ts`, `apps/server/src/testing/prebuilt-worker.test.ts`, `apps/server/vitest.global-setup.ts`, `apps/server/vitest.config.ts`, `apps/server/tsup.config.ts` | `developer-1` |
| G2 | `playwright.config.ts`, `e2e/fixtures.ts`, `e2e/auth.spec.ts` | `developer-2` |
| G3 | `.github/workflows/verify.yml`, `.github/actions/install/action.yml`, `apps/server/src/deploy/ci-workflow.test.ts` | `developer-3` |

## Sequencing

G1, G2 and G3 touch disjoint files and run in parallel. G3's test reads the workflow file only. Nothing waits.

## Steps

### G1

- [x] **Step 1:** failing test in `projection-scheduler.test.ts`, `a given worker file is the one spawned`: the test writes a probe worker (`.js`, imports only `node:worker_threads`) into a temp directory. The probe answers every `ProjectionRequestKind.Blocks` request with `{ kind: ProjectionRequestKind.Blocks, documentId, sequence: PROBE_SEQUENCE, blocks: [] }` and exits only on `ProjectionRequestKind.Stop`; it never exits on its own, so `restart()` never fires. Enum values reach the probe source through template interpolation of the TypeScript enums; no string literal in the test. The test builds `new ProjectionScheduler({ databaseDirectory, projectionWorkerFile })`, awaits `scheduler.blocks(randomUUID())`, expects `sequence` to be `PROBE_SEQUENCE`, then `await scheduler.stop()`. Red for the right reason: the constructor ignores the option, the real worker boots and `blocks` rejects for an unknown document. Evidence: c43c936.
- [x] **Step 2:** `createWorker({ databaseDirectory, projectionWorkerFile })`: `projectionWorkerFile` non-null → `new Worker(projectionWorkerFile, { workerData })`; null → the existing source/dist branches. Constructor takes `{ databaseDirectory, projectionWorkerFile = null }: { databaseDirectory: string; projectionWorkerFile?: URL | null }`. Green. Evidence: 379ecef.
- [x] **Step 3:** `startServer` accepts `projectionWorkerFile?: URL | null` (default `null` at the signature) and forwards it. `startTestServer` reads `prebuiltProjectionWorkerFile()` (`process.env.PROJECTION_WORKER_FILE` → `new URL(value)` or null) and passes it; `server.test.ts` passes `prebuiltProjectionWorkerFile()` in its ten direct `startServer` calls. Evidence: 379ecef.
- [x] **Step 4:** failing test `testing/prebuilt-worker.test.ts`: `PROJECTION_WORKER_FILE` is set, parses as a `file:` URL and names an existing `.js` file. Fails with `expected undefined to be defined` because nothing sets it. Evidence: 87cea72.
- [x] **Step 5:** `tsup.config.ts` exports `serverBuildOptions: Options` and `export default defineConfig(serverBuildOptions)`; `vitest.global-setup.ts` builds the worker entry with `{ ...serverBuildOptions, entry, outDir: node_modules/.cache/superdoc-history-vitest, clean: true, silent: true, config: false }`, sets the variable to the bundle's `file://` URL, returns a teardown that deletes it; `vitest.config.ts` adds `globalSetup`. Green; `pnpm --filter @superdoc-history/server test:unit` all green; `pnpm typecheck` green. Evidence: 54d828d.
- [x] **Step 6:** measure: run the timing probe (three boots: `startTestServer`, `scheduler.forget`, sign-in, stop) and record the worker boot figure in `tester-briefing.md`. Evidence: tester-briefing.md, section G1 (boot 265 ms prebuilt against 335 ms source, five runs each).

### G2

- [x] **Step 7:** `e2e/fixtures.ts` `expectSignedInAs` asserts the URL and the banner name only; `e2e/auth.spec.ts` sign-up spec asserts `MINE_EMPTY_MESSAGE` imported from `../apps/web/src/features/documents/documents-copy` (as `documents.spec.ts` does) for its new user. Evidence: 0e39053; red on `auth.spec.ts:25` and `auth.spec.ts:42` before.
- [x] **Step 8:** measured by the lead on 2026-10-17: `pnpm test:e2e --fully-parallel --workers=4` ran in 1.9 min and failed `selection-summary.spec.ts:49` (`readSelectionCalls` expected 3, received 10: the fake OpenRouter counter is process-wide and the file's other specs moved it). Decision: no `fullyParallel`; file-level parallelism, measured at 2.3 min. `playwright.config.ts` gets `workers: process.env.CI ? CONTINUOUS_INTEGRATION_WORKERS : LOCAL_WORKERS` with the two constants at the top. `pnpm typecheck:e2e` green. Evidence: 8fba3c8; `pnpm typecheck:e2e` green.
- [x] **Step 9:** `pnpm test:e2e` with the final config locally, 48 passed; repeat twice more and record the three wall times in `tester-briefing.md`. Evidence: 48 passed (2.0m) three times.

### G3

- [x] **Step 10:** failing tests in `ci-workflow.test.ts`: jobs are exactly `typecheck` (renamed `checks` after the merge of main, so it also runs `pnpm format:check` and `pnpm test:hooks`), `unit`, `e2e`, `docker`; no `needs:` anywhere; the three Node jobs use `./.github/actions/install` and `docker` does not; the unit matrix lists `libs`, `web`, `server` with filters `./libs/*`, `@superdoc-history/web`, `@superdoc-history/server`; the unit step is `pnpm --filter "${{ matrix.filter }}" test:unit` with the quotes; its env is `REQUIRE_DOCKER_COMPOSE: ${{ matrix.name == 'server' }}`; the e2e job keeps `playwright install --with-deps chromium`; `fail-fast: false` on the matrix; every job has `timeout-minutes` at most 20 (four occurrences). Replace `verifyJob()` with a `job(name)` slicer and replace `the verify job requires Docker Compose for the unit tests` with the matrix-expression pin. The six docker-job tests and the permissions test stay as they are. Confirm the new tests fail on the current file. Evidence: 04ae9d3 (red, 8 failing), test 'the workflow runs exactly the typecheck, unit, e2e and docker jobs'.
- [x] **Step 11:** `.github/actions/install/action.yml` (composite: pnpm/action-setup@v4, setup-node@v4 with `node-version-file: .nvmrc`, `cache: pnpm`, `cache-dependency-path: pnpm-lock.yaml`; `pnpm install --frozen-lockfile` with `shell: bash`) and the new `verify.yml`. Green. Validate the YAML parses (`python3 -c 'import yaml'` or `node` with `yaml` from the pnpm store), and run `actionlint` when available. Evidence: 0142f47; 16 tests green; YAML parsed with Ruby; actionlint not installed.

### G3, owner's change of 2026-10-17

- [x] **Step 12:** the E2E suite leaves the automatic CI. Red first: `e2e-workflow.test.ts` pins `.github/workflows/e2e.yml` (`workflow_dispatch` only, no `pull_request` or `push`, one `e2e` job through the composite action, read-only token, bounded timeout) and `ci-workflow.test.ts` pins `checks`, `unit`, `docker` (ec70f0a, 4 red). Green: `e2e.yml` created with the former job, `verify.yml` without it (b8a4865, 39 repository-shape tests). Run on request: `gh workflow run e2e.yml --ref <branch>`.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | A worker spawned from a `file://` URL cannot resolve `better-sqlite3` | `Cannot find package 'better-sqlite3'` in the worker error listener | Move the cache directory under `apps/server/` (any path whose ancestors include `apps/server/node_modules`) |
| 5 | `process.env` set in global setup does not reach forked test workers | `prebuilt-worker.test.ts` red, variable undefined in the test | Switch to writing the URL to a file in the cache directory and read it in `test-server.ts` |
| 5 | tsup's `clean: true` wipes a directory other than the cache | Files missing under `apps/server` | Set `outDir` explicitly and verify it is the cache path before building; drop `clean` and remove the one file by hand |
| 7 | Another spec relied on the empty-state assertion | That spec red under parallel run | Add the assertion back only in specs that sign up a fresh user |
| 8 | A spec shares state with another and flakes under parallel workers | Any failure in three local runs that passes alone | Mark that spec's file `test.describe.configure({ mode: 'serial' })` and record a learning |
| 11 | A matrix filter matches no package | `No projects matched the filters` in the job log | Use the package names from `package.json` for all three entries |
| 11 | `cache: pnpm` in a composite action fails to find the lockfile | setup-node error naming `pnpm-lock.yaml` | Pass `cache-dependency-path: pnpm-lock.yaml` |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** the three developers wrote `tester-briefing.md` (G1, G2, G3) — 82fd4de.
- [x] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md`: 28 boxes ticked with evidence, one defect (main's `format:check` and `test:hooks` gates missing after the merge) fixed in 69da03d — evidence in `test-plan.md`.
- [x] **Reviewer:** a fresh `reviewer` sub-agent reviewed the diff (two IMPORTANT, five MINOR; 1 to 5 fixed in e3c6e47, 5595626, bc30596, 2b0cd0d; 6 benign under attack; 7 waits for the first CI run) and ran the three refutations: claims 1 and 3 held, claim 2 held for the shipped config and fails only under `--repeat-each`. Verdict: ship-ready YES.
- [x] **/check-ui:** not applicable, no UI touched.
- [ ] **/open-pr:** on hold; the owner asked for no push until they say so.
