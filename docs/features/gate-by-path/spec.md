# Gate by path

**Status:** Building
**Tier:** 🟡
**Owner approval:** approved 2026-10-17
**ADRs:** [0028](../../adr/0028-the-local-gate-runs-what-the-diff-can-break.md), [0018](../../adr/0018-fan-out-ci-and-prebuild-the-projection-worker.md), [0022](../../adr/0022-mechanical-security-gates-and-a-security-reviewer.md)
**Not changing:** the gates themselves (typecheck, audit, secret scan, unit, E2E, image build), `.github/workflows/` beyond one added step, the tester's role for product changes, the reviewer and security reviewer for product changes, scenarios

## Problem

A one-word README change pays four to five sub-agents and two to four full gate runs, E2E included, each step queued separately behind the owner's machine-wide heavy-command lock. The gate is written three times and the lists disagree. Hosted CI is refused for billing and the owner will not pay, yet the harness still waits for it.

## Goals

- One executable gate, `pnpm verify`, that runs what the diff can break.
- No full run repeated on a commit that already passed, or for a delta that cannot break what it would test.
- A docs lane for documentation nobody follows step by step; tooling without a tester.
- The harness states that the gate is local.

## Non-goals

- Splitting the E2E suite by changed file.
- Removing `.github/workflows/`.
- Changing what product changes go through.

## Design

### Data flow

`pnpm verify [auto|all] [--plan]` → `scripts/verify.sh`:

1. `git fetch origin main` (a failure is printed and the last fetched ref is used). Base: `all` → merge base with `origin/main`. `auto` → the newest commit in `merge-base..HEAD` that has a record written with the current `node --version`, else the merge base. The class is always computed against the merge base; the record base only narrows the gates.
2. Changed paths: `git diff --name-only --no-renames <base>` (working tree against base) plus `git ls-files --others --exclude-standard`.
3. Each path takes the first matching row of `scripts/verify-gates.tsv` (`glob<TAB>class<TAB>gates`, bash pattern where `*` crosses `/`, `-` for no extra gates); no match → class `product`, gates `all`. The run is the union; the class is the highest of `docs < tooling < product`.
4. Packages for `unit`: the `apps/<name>` and `libs/<name>` folders of the paths whose row includes `unit`, plus their dependents through the `workspace:` dependencies of every package's `package.json`, to a fixed point.
5. Gates in this order, stop at the first failure: `doctor` (always), `format` (always, Prettier `--check --ignore-unknown` on the changed files that exist; `all` → `pnpm format:check`), `secrets` (always; fails when `gitleaks` is not on `PATH`, resolved outside `node_modules/.bin`), `typecheck`, `audit` (always), `hooks`, `shape` (always, the server's `src/repository-shape` tests, skipped when the server's unit suite runs), `unit` (`pnpm --filter <name>… test:unit`; `all` → `pnpm test:unit`), `e2e`, `docker` (fails without a running Docker, naming the doctor's fix, when a changed path's row lists `docker`; selected only by `all`, it prints that it was skipped and passes, as the doctor keeps Docker optional).
6. Green in `auto` or `all`, with the tree clean at the start and the end and `HEAD` unchanged → write `<git common dir>/verify/<HEAD sha>` atomically with the Node version, the class and the gates. A record at `HEAD` with a clean tree → the secret scan and the audit run, then `verify: <sha> already green`. `guard-verify-records.sh` blocks agents from writing records by hand.

`--plan` prints `base:`, `class:`, `gates:` and `packages:` and runs nothing.

### Interfaces

- `scripts/verify.sh`, `scripts/verify-gates.tsv`, `scripts/verify.test.sh`.
- `package.json`: `verify` → `bash scripts/verify.sh`; `test:verify`; `test:unit` includes `test:verify`. `verify.yml` `checks` runs `pnpm test:verify`.
- The doctor's `gitleaks` line says the gate fails without it.
- `/verify` and `/open-pr` call `pnpm verify` and read `class:` from `--plan`; `HARNESS.md` carries the docs lane, the tooling exemption and the local gate.

### Failure handling

A failed gate prints `verify: <gate> failed`, exits 1 and writes no record. A dirty tree never writes a record. A missing `gitleaks` fails its gate with the fix line; a missing Docker fails it when the image's own files (`docker/`, `deploy/`, `.dockerignore`, `railway.json`, the compose files) changed and is printed as skipped otherwise. Nothing passes silently.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Heavy lock | add `verify` to the owner's hook / rename the script | add `verify` to the hook | 2026-10-17 |
| Docs lane scope | docs only / docs and tooling | docs only; tooling keeps its spec and loses the tester | 2026-10-17 |
| Reviewer in the docs lane | mid model / none | mid model | 2026-10-17 |

## Test strategy summary

`scripts/verify.test.sh` builds a scratch repository with the real script and map, stub `pnpm`, `gitleaks`, `docker` and `node` on `PATH` that log their calls, and pins every scenario of the stress walk: docs, install docs, config, tooling, `AGENTS.md`, one app, `libs/types`, lockfile, the map itself, an unknown path, a rename out of an app, an untracked file, a mixed change, Docker present and absent, records written, reused, refused on a dirty tree or another Node, a failing gate, a missing gitleaks, a merge from `main`.
