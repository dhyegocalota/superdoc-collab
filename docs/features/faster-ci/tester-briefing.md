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
