# Test plan: Gate by path

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts). Tooling change: the lead ticks with the gate output and the reviewer refutes (ADR 0028).

## The failing test first

- [ ] `scripts/verify.test.sh` against the stub — expected: every case fails, the run ends `verify: N check(s) failed` and exits 1
- [ ] Confirmed it fails for the right reason: the stub's `verify.sh is not implemented`, not a fixture error

## Classification (`--plan` in the scratch repository)

- [ ] README typo — expected: `class: docs`, `gates: doctor format secrets shape`
- [ ] `docs/install.md` — expected: `class: docs`
- [ ] `apps/web/README.md` — expected: `class: docs`
- [ ] `apps/web/vite.config.ts` — expected: `class: product`, gates include `typecheck unit e2e`, `packages: @superdoc-collab/web`
- [ ] `apps/server/src/x.ts` — expected: `packages: @superdoc-collab/server`
- [ ] `libs/types/src/x.ts` — expected: packages are types, history, web and server
- [ ] `.agents/skills/x/SKILL.md` — expected: `class: tooling`, gates include `hooks`, no `e2e`
- [ ] `AGENTS.md` — expected: `class: tooling`
- [ ] `.github/workflows/verify.yml` — expected: `class: tooling`, no `e2e`
- [ ] `apps/server/src/repository-shape/x.test.ts` — expected: `typecheck`, no `e2e`
- [ ] `pnpm-lock.yaml` — expected: `class: product`, every gate including `audit`
- [ ] `scripts/verify-gates.tsv` — expected: every gate
- [ ] An unknown path (`LICENSE`) — expected: every gate
- [ ] A rename `apps/web/src/a.ts` → `docs/a.md` — expected: `class: product`, web in packages
- [ ] An untracked `apps/server/src/new.ts` — expected: server in packages
- [ ] README plus one `apps/web` file — expected: `class: product`
- [ ] `docker/Dockerfile` — expected: gates include `docker`

## Runs (stub tools log their calls)

- [ ] README change, green — expected: no `typecheck`, `test:unit` or `test:e2e` call; exit 0
- [ ] `docker/Dockerfile` with Docker absent — expected: `verify: docker failed` and the fix line; exit 1
- [ ] A failing typecheck — expected: `verify: typecheck failed`, no later gate called, no record, exit 1
- [ ] `gitleaks` absent — expected: `verify: secrets failed`; exit 1
- [ ] Green on a clean tree — expected: a record for `HEAD` under the git common directory
- [ ] Green on a dirty tree — expected: no record
- [ ] `pnpm-lock.yaml` change or `all` with Docker absent — expected: `verify: docker skipped: Docker is not running; the image is proven only when docker/ or deploy/ change`, exit 0, a record written
- [ ] Second run at a recorded `HEAD` — expected: `already green`, no tool called
- [ ] A docs commit after a recorded product commit — expected: `base:` is the recorded commit, `class: docs`
- [ ] A record written under another Node version — expected: ignored, `base:` is the merge base
- [ ] Merging a `main` that changed `apps/server` into a recorded web branch — expected: server in packages
- [ ] A recorded product commit, then `--plan` — expected: `class: product` (the branch class), `gates: secrets audit`
- [ ] Local `main` moved to `HEAD` — expected: the plan is unchanged, the base is `origin/main`
- [ ] `origin` unreachable — expected: `verify: could not fetch origin main; the base is origin/main as last fetched`, the run continues
- [ ] A tree dirty at the start, a `HEAD` that moves mid-run, a tree dirtied mid-run — expected: green, no record
- [ ] `.dockerignore` with Docker absent — expected: `verify: docker failed`; `docs/install.sh` — every gate; `docs/media/x.png` — `class: docs`
- [ ] A changed `apps/web/src/my file.ts` — expected: Prettier receives the path whole
- [ ] `gitleaks` only under `node_modules/.bin` — expected: `verify: secrets failed`, the planted binary never runs
- [ ] `guard-verify-records.sh` — expected: exit 2 for `.git/verify` in a command, in `git-common-dir` plus `verify`, in an Edit or patch path; exit 0 for `pnpm verify --plan`
- [ ] `all` — expected: `pnpm format:check`, `pnpm test:unit` and `pnpm test:e2e` called, records ignored for the base

## Harness

- [ ] `pnpm test:hooks` green with the new doctor line
- [ ] `pnpm verify --plan` on this branch — expected: `class: product` (the map and `package.json` changed), every gate but `shape` and `hooks`, which `pnpm test:unit` runs
- [ ] `pnpm verify all` on the branch head merged with `main` — expected: every gate green; summary posted on the PR
- [ ] The skills and `HARNESS.md` never list the gate steps (reviewer reads them)
