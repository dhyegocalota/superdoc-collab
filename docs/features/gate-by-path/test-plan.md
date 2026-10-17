# Test plan: Gate by path

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts). Tooling change: the lead ticks with the gate output and the reviewer refutes (ADR 0030).

Evidence key: **T** = `bash scripts/verify.test.sh` at `f9bb2b7`, `verify: all checks passed` (the named check in quotes); **H** = `bash .agents/hooks/hooks.test.sh` at `f9bb2b7`, `hooks: all checks passed`. Boxes whose expectation changed during review are struck through and restated; the reviewer re-ran its attacks against each restatement.

## The failing test first

- [x] `scripts/verify.test.sh` against the stub — expected: every case fails, the run ends `verify: N check(s) failed` and exits 1 — evidence: `9564661` printed `verify: 45 check(s) failed`; review fixes red at `8addc71` (`verify: 30 check(s) failed`, `hooks: 7 check(s) failed`) and `efafe0d`; the reviewer re-ran `9564661` and `8addc71` in throwaway worktrees with the same text
- [x] Confirmed it fails for the right reason: the stub's `verify.sh is not implemented`, not a fixture error — evidence: developer report and reviewer spot-check at `9564661`

## Classification (`--plan` in the scratch repository)

- [x] README typo — ~~`gates: doctor format secrets shape`~~ `class: docs`, `gates: doctor format secrets audit shape` (the audit became always-on, security finding 4) — evidence: T "a README typo"
- [x] `docs/install.md` — ~~`class: docs`~~ `class: tooling` (followed step by step, reviewer finding 4 of the re-review) — evidence: T "docs/install.md"; `docs/agent-install.md` and a scenario likewise — T "docs/agent-install.md", "a scenario"; an ADR stays `docs` — T "an ADR"
- [x] `apps/web/README.md` — expected: `class: docs` — evidence: T "a package README"
- [x] `apps/web/vite.config.ts` — expected: `class: product`, gates include `typecheck unit e2e`, `packages: @superdoc-collab/web` — evidence: T "a web file"
- [x] `apps/server/src/x.ts` — expected: `packages: @superdoc-collab/server` — evidence: T "a server file"
- [x] `libs/types/src/x.ts` — expected: packages are types, history, web and server — evidence: T "a types file"
- [x] `.agents/skills/x/SKILL.md` — expected: `class: tooling`, gates include `hooks`, no `e2e` — evidence: T "a skill"
- [x] `AGENTS.md` — expected: `class: tooling` — evidence: T "AGENTS.md"
- [x] `.github/workflows/verify.yml` — expected: `class: tooling`, no `e2e` — evidence: T "a workflow"
- [x] `apps/server/src/repository-shape/x.test.ts` — expected: `typecheck`, no `e2e` — evidence: T "a repository shape test"
- [x] `pnpm-lock.yaml` — expected: `class: product`, every gate including `audit` — evidence: T "the lockfile"
- [x] `scripts/verify-gates.tsv` — expected: every gate — evidence: T "the gate map"
- [x] An unknown path (`LICENSE`) — expected: every gate — evidence: T "an unknown path"
- [x] A rename `apps/web/src/a.ts` → `docs/a.md` — expected: `class: product`, web in packages — evidence: T "a rename out of an app"
- [x] An untracked `apps/server/src/new.ts` — expected: server in packages — evidence: T "an untracked server file"
- [x] README plus one `apps/web` file — expected: `class: product` — evidence: T "a README and a web file"
- [x] `docker/Dockerfile` — expected: gates include `docker` — evidence: T "the Dockerfile"

## Runs (stub tools log their calls)

- [x] README change, green — expected: no `typecheck`, `test:unit` or `test:e2e` call; exit 0 — evidence: T "a README change runs green", "a README change skips the heavy gates"
- [x] `docker/Dockerfile` with Docker absent — expected: `verify: docker failed` and the fix line; exit 1 — evidence: T "Docker down fails", "Docker down names the fix"
- [x] A failing typecheck — expected: `verify: typecheck failed`, no later gate called, no record, exit 1 — evidence: T "a failing typecheck …" (four checks)
- [x] `gitleaks` absent — expected: `verify: secrets failed`; exit 1 — evidence: T "a missing gitleaks exits 1", "… names the fix"
- [x] Green on a clean tree — expected: a record for `HEAD` under the git common directory — evidence: T "a clean green run writes the record"
- [x] Green on a dirty tree — expected: no record — evidence: T "a dirty green run writes no record"
- [x] `pnpm-lock.yaml` change or `all` with Docker absent — expected: `verify: docker skipped: …` (the message now names the image's own files), exit 0, a record written — evidence: T "the lockfile without Docker …", "all without Docker …"
- [x] Second run at a recorded `HEAD` — ~~no tool called~~ `already green` after the secret scan and the audit, nothing else called (security finding 2a) — evidence: T "a second run is already green", "… still scans and audits", "… runs nothing else"
- [x] A docs commit after a recorded product commit — ~~`class: docs`~~ `base:` is the recorded commit, gates are the docs gates, `class: product` because the class is the branch's (reviewer finding 1) — evidence: T "a docs commit after a recorded commit"
- [x] A record written under another Node version — expected: ignored, `base:` is the merge base — evidence: T "a record under another Node version"
- [x] Merging a `main` that changed `apps/server` into a recorded web branch — expected: server in packages — evidence: T "a merge of main into a recorded branch"
- [x] A recorded product commit, then `--plan` — expected: `class: product`, `gates: secrets audit` — evidence: T "the class after a recorded run", "the gates after a recorded run"; reviewer `class.sh` held
- [x] Local `main` moved to `HEAD` — expected: the plan is unchanged, the base is `origin/main` — evidence: T "a moved local main"; reviewer scenario G held
- [x] `origin` unreachable — expected: the fetch failure is printed, the run continues — evidence: T "a failed fetch is said", "a failed fetch still plans"
- [x] A tree dirty at the start, a `HEAD` that moves mid-run, a tree dirtied mid-run — expected: green, no record — evidence: T "a tree dirty at the start …", "a HEAD that moved …", "a tree dirty at the end …"; reviewer scenarios A and B held
- [x] `.dockerignore` with Docker absent — expected: `verify: docker failed`; `docs/install.sh` — every gate; `docs/media/x.png` — `class: docs` — evidence: T "the dockerignore without Docker …", "an unknown file under docs", "a screenshot"
- [x] A changed `apps/web/src/my file.ts` — expected: Prettier receives the path whole — evidence: T "a path with a space reaches Prettier whole"
- [x] `gitleaks` only under `node_modules/.bin` — expected: `verify: secrets failed`, the planted binary never runs — evidence: T "only a planted gitleaks …", "a planted gitleaks is never run"
- [x] `guard-verify-records.sh` — ~~exit 2 for `git-common-dir` plus `verify`~~ exit 2 for writes under `.git/verify` and for Edit or patch paths into it; exit 0 for `pnpm verify --plan` (security re-review finding 3) — evidence: H
- [x] A tracking ref forged to `HEAD` with a fetch refspec that does not update it — expected: the base comes from `FETCH_HEAD`, the plan is still `product` with full gates — evidence: T "a forged tracking ref"
- [x] A green run with `origin` unreachable — expected: `verify: no record: origin main could not be fetched`, exit 0, no record — evidence: T "a failed fetch still runs green", "… says no record", "… writes no record"
- [x] `docs/install.md`, `docs/agent-install.md`, `docs/scenarios/x.md` — expected: `class: tooling`; `docs/adr/0001-x.md` — `class: docs` — evidence: T "docs/install.md", "docs/agent-install.md", "a scenario", "an ADR"
- [x] The guard on `ls .git/verify`, `cat .git/verify/x`, `rg -n git-common-dir scripts/verify.sh`, a commit message naming `.git/verify` — expected: exit 0; on `rm -rf .git/verify`, `cp a .git/verify/b`, a relative patch path and a `..` path into `.git/verify` — exit 2 — evidence: H; lead probe at `f9bb2b7`: `ls .git/verify` → 0, `rg -n git-common-dir scripts/verify.sh` → 0, `echo x > .git/verify/abc` → 2
- [x] `all` — expected: `pnpm format:check`, `pnpm test:unit` and `pnpm test:e2e` called, records ignored for the base — evidence: T "all ignores records", "all checks the whole format", "all runs every unit suite", "all runs every E2E suite"

## Harness

- [x] `pnpm test:hooks` green with the new doctor line — evidence: H, and inside `pnpm test:unit` of the gate run at `de4997a` (`hooks: all checks passed`)
- [x] `pnpm verify --plan` on this branch — expected: `class: product` (the map and `package.json` changed), every gate but `shape` and `hooks`, which `pnpm test:unit` runs — evidence: `gates: doctor format secrets typecheck audit unit e2e docker`, all four packages, at `de4997a`
- [x] `pnpm verify all` on the branch head merged with `main` — expected: every gate green; summary posted on the PR — evidence: `pnpm verify all` at `de4997a`: 8 gates green (972 unit tests, 46 E2E, image built), log `verify-all-de4997a.log`; `pnpm verify` at `f9bb2b7`: see GATE_EVIDENCE; the merge-time run is posted as a PR comment
- [x] The skills and `HARNESS.md` never list the gate steps (reviewer reads them) — evidence: `agent-surfaces.test.ts` "the verify and open-pr skills never repeat the steps of the gate"; reviewer conventions lens PASS
- [x] (pin, security re-review MINOR) The README Quick install, the install guide's agent section and `docs/agent-install.md` name only `https://github.com/dhyegocalota/superdoc-collab` — evidence: `delivery-docs.test.ts` "the install prompts and the agent install file point only at this repository", 22 passed; mutation: the README prompt pointed at `github.com/attacker/superdoc-collab` → 1 failed naming that URL, restored
- [x] (main's CI added a Kolkata unit job) A server change — expected: `verify: unit in Asia/Kolkata` and a second server `test:unit` with `TZ=Asia/Kolkata`; a web change — no time-zone run; `all` — the libraries and the server again in Kolkata — evidence: red `94e1beb` (3 checks failed), green `3eeaf40`, `verify.test.sh` "all checks passed"
