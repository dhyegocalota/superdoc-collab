# Test plan: Faster CI

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/server/src/history/projection-scheduler.test.ts::a given worker file is the one spawned` — input: a scheduler built with `projectionWorkerFile` pointing at a temp probe worker that answers `Blocks` with `sequence: PROBE_SEQUENCE` and exits only on `Stop`; expected: `scheduler.blocks(id)` resolves with `sequence === PROBE_SEQUENCE`, then `stop()` resolves.
- [ ] Confirmed it fails for the right reason: the constructor has no such option, the real worker boots and `blocks` rejects for the unknown document (a rejection, not a compile error or a timeout).
- [ ] `apps/server/src/testing/prebuilt-worker.test.ts::the Vitest run publishes a prebuilt projection worker` — input: `process.env.PROJECTION_WORKER_FILE`; expected: defined, a `file:` URL, the file exists and ends in `.js`.
- [ ] Confirmed it fails for the right reason: `expected undefined to be defined`.
- [ ] `apps/server/src/deploy/ci-workflow.test.ts::the jobs are typecheck, unit, e2e and docker` — input: today's `verify.yml`; expected red with the job list `['verify', 'docker']`.

## Unit

- [ ] `projection-scheduler.test.ts`: the whole file green with the prebuilt worker (21 existing tests plus the new one).
- [ ] `ci-workflow.test.ts::no job needs another` — input: `verify.yml`; expected: no line matches `^\s+needs:`.
- [ ] `ci-workflow.test.ts::the three Node jobs install through the composite action` — expected: `uses: ./.github/actions/install` appears in `typecheck`, `unit` and `e2e`, not in `docker`.
- [ ] `ci-workflow.test.ts::the unit matrix covers libs, web and server` — expected: the three `name:` entries with filters `./libs/*`, `@superdoc-history/web`, `@superdoc-history/server`.
- [ ] `ci-workflow.test.ts::Docker Compose is required for the server entry only` — expected: the unit step's env is exactly `REQUIRE_DOCKER_COMPOSE: ${{ matrix.name == 'server' }}`.
- [ ] `ci-workflow.test.ts::the unit step quotes the matrix filter` — expected: the step line is `pnpm --filter "${{ matrix.filter }}" test:unit`.
- [ ] `ci-workflow.test.ts::the e2e job installs chromium with its system dependencies` — expected: `playwright install --with-deps chromium` in the `e2e` job.
- [ ] `ci-workflow.test.ts::every job has a bounded timeout` — expected: four `timeout-minutes`, each at most 20.
- [ ] The six docker-job tests and the permissions test unchanged and green; `the verify job requires Docker Compose for the unit tests` replaced by the matrix-expression pin.
- [ ] Edge: `PROJECTION_WORKER_FILE` unset — input: `prebuiltProjectionWorkerFile()` with the variable deleted; expected: `null`, and a `startTestServer` boot still answers health (fallback to the tsx path).
- [ ] Edge: `PROJECTION_WORKER_FILE` names a missing file — input: a `file://` URL to a nonexistent path; expected: the error listener logs each failed spawn, the scheduler restarts it `MAX_WORKER_RESTARTS_PER_WINDOW` times and then sets `degraded` to `true` (that many error logs plus one); `blocks` rejects with `ProjectionDegradedError`; no hang.
- [ ] `pnpm typecheck` green (workspace plus `e2e`).
- [ ] `pnpm --filter "./libs/*" test:unit`, `pnpm --filter @superdoc-history/web test:unit`, `pnpm --filter @superdoc-history/server test:unit` each green on their own, as the matrix runs them.

## E2E (Playwright specs)

- [ ] Before `fullyParallel` is adopted: `pnpm test:e2e --fully-parallel --workers=4` three times on the fixed fixtures — expected: `48 passed` each time. A failure that passes alone means a shared-state spec; the config keeps file-level parallelism and the spec is named here.
- [ ] `pnpm test:e2e` with the new config, run 1 — expected: `48 passed`, wall time recorded.
- [ ] Run 2 — expected: `48 passed`.
- [ ] Run 3 — expected: `48 passed`. Any failure is a shared-state flake: record the spec name and the assertion.
- [ ] `CI=1 pnpm test:e2e` — expected: Playwright reports `Running 48 tests using 4 workers`.
- [ ] `e2e/auth.spec.ts::a new user signs up and lands on documents` — expected: still asserts `No documents yet` for the new user and passes.

## Prove it for real — Playwright MCP

Not applicable: no user-facing change. The product behaves the same; only the test harness and CI change. Stated here so the gap is explicit.

## Performance evidence

- [ ] Timing probe before and after (three boots each of `startTestServer`, `scheduler.forget`, sign-in, stop): worker boot drops from about 340 ms to under 150 ms locally.
- [ ] Server unit suite wall time locally before and after, from Vitest's `Duration` line.
- [ ] Workflow file validation: `actionlint .github/workflows/verify.yml` when installed; otherwise a YAML parse of the workflow and the composite action succeeds.

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: the prebuilt bundle behaves like the tsx-transpiled worker in every server test — attack: run the server suite with and without `PROJECTION_WORKER_FILE` and diff the pass lists; result: <refuted | held>
- [ ] Claim 2: the E2E suite has no remaining shared-state hazard under four workers — attack: run with `--workers=8` and `--repeat-each=2`; result: <refuted | held>
- [ ] Claim 3: the matrix filter `./libs/*` runs both libraries — attack: `pnpm --filter "./libs/*" test:unit` output lists `libs/types` and `libs/history`; result: <refuted | held>

## Coverage honesty

What is not tested and why.

- The workflow is not executed on GitHub before the owner pushes; the pins and a YAML parse are the only local proof. The first push is the real test, by the owner's choice.
- Billed-minute and wall-time estimates (about 14 and about 4 minutes) are projections from the measured step times; the first CI run confirms or corrects them.
