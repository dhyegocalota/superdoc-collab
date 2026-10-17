# 0014. Fan CI out into independent jobs and boot a prebuilt projection worker in tests

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: run 39028424391 of `verify.yml` (15m38s wall, 48 E2E tests in 9m15s, server unit tests in 5m03s), a local timing probe of `startTestServer` (worker boot 340 ms of 450 ms per boot), `docs/learnings/2026-10-16-worker-threads-need-an-error-listener.md`

## Context

Every pull request runs one `verify` job that does checkout, install, typecheck, unit and E2E in series, next to a `docker` job. The job takes 15 to 16 minutes and the repository is private, so the minutes are billed. Three measured causes:

1. Playwright runs with `workers: 1`. The 48 specs take 9m15s in series; locally with four workers they take 2m18s, and only two assertions break: both read `No documents yet` for a shared demo user that another parallel spec has just given a document.
2. The server unit tests boot 93 real servers. Each boot spawns the projection worker thread, and in source mode that thread registers tsx and transpiles the worker's import graph again. Locally that is 340 ms of a 450 ms boot; on the 4 vCPU runner, while the web package's jsdom workers compete for the same cores, each test takes about 5 s, fourteen times the local figure. The sum is 1094 s of test time over four workers.
3. The web unit tests spend 45% of their 166 s booting jsdom per file under the same contention.

## Decision

- **Independent jobs.** `verify.yml` has `typecheck`, `unit` (a matrix of `libs`, `web` and `server`), `e2e` and `docker`, none needing another. The wall time becomes the slowest job. Checkout, pnpm, Node and `pnpm install` live in one composite action under `.github/actions/` so the four jobs share one definition. No branch protection names a job today, so no gate job is kept.
- **E2E in parallel.** `fullyParallel: true`; four workers on CI (the runner's vCPU count) and Playwright's default locally. The sign-in helper asserts the URL and the banner name only; the empty-state copy is asserted by the one spec whose user is brand new.
- **One prebuilt worker per Vitest run.** A Vitest `globalSetup` in `apps/server` bundles `projection-worker.ts` once with tsup, using the same options as the production build, into `node_modules/.cache/` so bare imports still resolve, and publishes its `file://` URL in `PROJECTION_WORKER_FILE`. `startTestServer` reads that variable and hands the URL to `startServer`, which passes it to `ProjectionScheduler` as `projectionWorkerFile`. The scheduler spawns the given file when it has one and keeps the source and dist resolution otherwise. Production code reads no environment variable for this.
- **Single E2E runner.** No sharding: the cooldown spec (43 s) sets the floor and a second runner would add a full setup and build for about one minute of wall time saved. Revisit if the suite grows past four minutes.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Keep one job, raise Playwright workers only | One file changes | Unit tests still 5 min under contention; wall stays near 8 min | Does not reach the target |
| Shard E2E over two or four runners | Wall near 2 min | Each shard pays setup, browsers and the web build; billed minutes rise above today's | Private repository; cost matters as much as wall time |
| Share one server across a test file | Fewer boots | Rewrites 17 test files that rely on a fresh database per test | Too wide for a CI change; isolation is the point of those tests |
| Resolve a prebuilt worker from inside `createWorker` by looking for a file | No new option on the scheduler | Production code probes the file system for a test artifact | Test concerns stay in the test harness |
| Prebuild with esbuild directly | No tsup in the setup | esbuild is not a direct dependency; options would be duplicated | tsup is already the build tool and its options are reusable |
| `pool: 'vmThreads'` for the web tests | Faster jsdom boot | Known isolation caveats with module state | Not needed once web runs on its own runner |

## Consequences

- Six runners start per push instead of two. Estimated billed minutes fall from about 18 to about 14 because the long serial job disappears; the wall time falls from about 15.5 to about 4 minutes.
- A failure now lands in the job that owns it; a red unit matrix entry names the package.
- Local `pnpm test:unit` in `apps/server` builds the worker once (about a second) before the first test; `pnpm test:e2e` uses half the local cores.
- The server tests prove the real worker bundle, the same artifact production runs, instead of a tsx-transpiled copy.
- Any new spec that relies on a demo user's document list being empty will be flaky under parallel workers; specs create their own documents and assert on them.

## Evidence

- `apps/server/src/deploy/ci-workflow.test.ts` pins the job layout, the matrix, the composite action and the `REQUIRE_DOCKER_COMPOSE` requirement on the server entry.
- `apps/server/src/history/projection-scheduler.test.ts` proves the scheduler spawns a given worker file; `apps/server/src/testing/prebuilt-worker.test.ts` proves the Vitest run publishes one.
- `e2e/auth.spec.ts` keeps the empty-state assertion only for the newly signed-up user.

## Revisit when

- The E2E suite passes four minutes on CI, or the repository goes public and minutes stop being billed (sharding becomes free).
- Branch protection starts requiring a named check (add a gate job that needs the others).
- The projection worker stops being a worker thread.
