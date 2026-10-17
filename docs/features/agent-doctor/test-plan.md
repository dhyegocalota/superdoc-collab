# Test plan: Agent doctor

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

Tester run: content of b55ce49 (the working tree moved to e181d69 mid-run; `.agents/hooks/` unchanged), macOS, 2026-10-17. Unit checks below are named checks inside `bash .agents/hooks/hooks.test.sh`, which printed `hooks: all checks passed` (exit 0); each is cited as "hooks green".

**DEFECT D1 — resolved by 6d04ca8: the script is called directly and has no `package.json` entry.** **DEFECT D1 (blocks the happy path, `/verify` gate 0 and CI): `pnpm doctor` is pnpm's built-in command, not the `doctor` script.** `pnpm doctor` printed nothing and exited 0 (local run, and the CI step: `Run pnpm doctor` in run 39057065057 logs only its env block, no report, finished in under a second). The script runs only as `pnpm run doctor`. So the CI step, `/verify` gate 0 and every doc that says `pnpm doctor` check nothing. Fix: call `pnpm run doctor` everywhere (or rename the script so no built-in collides) and add a repository-shape check that every `pnpm <name>` in docs and workflows is a script, not a built-in.

## The failing test first

- [x] `.agents/hooks/hooks.test.sh::doctor: every tool present reports ok` — input: a stub `PATH` with every tool, `DOCTOR_UNAME=Darwin`; expected: before Task 1 the run prints `FAIL doctor:` lines because `doctor.sh` does not exist — evidence: d10c064's `hooks.test.sh` run against the scripts of d10c064~1 in a throwaway worktree printed 25 `FAIL` lines, e.g. `FAIL doctor: every tool present exits 0: expected exit 0, got 127` and `No such file or directory`. Caveat: test and implementation share the single commit d10c064, so `git log` alone cannot show red-first
- [x] `.agents/hooks/hooks.test.sh::guard-secrets without jq` — input: `DOCTOR_PATH` pointing at an empty directory; expected before Task 1: `FAIL guard-secrets without jq: expected exit 2, got 0` — evidence: same throwaway run printed exactly `FAIL guard-secrets without jq: expected exit 2, got 0`
- [x] Confirmed it fails for the right reason: `No such file or directory` for `doctor.sh`, and `got 0` for both guards (the guards fail open today) — evidence: same run: `FAIL guard-secrets without jq: expected exit 2, got 0`, `FAIL guard-git-add-all without jq: expected exit 2, got 0`, plus two `... names the fix` mismatches; doctor failures exit 127 (script absent). Worktree removed

## Unit

`bash .agents/hooks/hooks.test.sh` (also `pnpm test:hooks`, part of `pnpm test:unit`).

- [x] `doctor: every tool present reports ok` — all stubs, Darwin; expected: summary `doctor: 0 missing required, 0 missing optional`, no `| missing |` line, exit 0 — evidence: hooks green (`every tool present reports ok`, `has no missing line`, `exits 0`)
- [x] `doctor: a line carries the full shape` — expected: `jq | ok | required | lost: <text> | fix: brew install jq` — evidence: hooks green; live `jq | ok | required | lost: the four hooks; the two guards block | fix: brew install jq`
- [x] `doctor: missing jq on macOS names brew` — `jq` stub removed, `brew` present; expected: `jq | missing | required | lost: the four hooks; the two guards block | fix: brew install jq`, summary `1 missing required`, exit 1 — evidence: hooks green (`missing jq on macOS names brew`, `one missing required is counted`, `a missing required tool exits 1`)
- [x] `doctor: missing jq on Linux names apt-get` — `DOCTOR_UNAME=Linux`, `apt-get` stub, no `brew`; expected: `fix: sudo apt-get install -y jq` — evidence: hooks green
- [x] `doctor: chromium on Linux installs with deps` — expected: `fix: pnpm install && pnpm exec playwright install --with-deps chromium` — evidence: hooks green; live `DOCTOR_PATH=<empty> DOCTOR_UNAME=Linux` printed that exact fix
- [x] Edge: no package manager — expected: `fix: https://jqlang.github.io/jq/download/`, exit 1 unchanged — evidence: hooks green (`no package manager falls back to the URL`, `the fallback keeps the exit code`); live empty `DOCTOR_PATH`: that URL, exit=1
- [x] Edge: only optional tools missing (`ffmpeg`, `gitleaks`, `docker`) — expected: `doctor: 0 missing required, 3 missing optional`, exit 0; the `ffmpeg` line says `lost: the recorder's mp4 and gif; a PR that touches UI cannot ship` — evidence: hooks green (`optional tools are counted apart`, `ffmpeg says what is lost`)
- [x] Edge: `gh` present and `gh auth status` exits 1 — expected: `gh | missing | required | ... | fix: gh auth login (run it yourself; the agent cannot)` — evidence: hooks green (`gh without auth is missing with the human step`)
- [x] Edge: `node` prints `v22.11.0` with `.nvmrc` = 24 — expected: `node | missing | required | lost: everything | fix: nvm install (reads .nvmrc), or https://nodejs.org/en/download` — evidence: hooks green (`node below .nvmrc is missing`)
- [x] Edge: `pnpm` prints `9.0.0` — expected: `pnpm | missing | required | lost: everything | fix: corepack enable && corepack prepare pnpm@8.15.9 --activate` — evidence: hooks green (`pnpm at another version is missing`)
- [x] Edge: no `chromium-*` directory in the fake cache — expected: `chromium | missing | required | lost: pnpm test:e2e, both Playwright MCP servers, /check-ui, /scenario, the tester | fix: pnpm install && pnpm exec playwright install chromium` — evidence: hooks green (`no chromium in the cache is missing`)
- [x] Edge: `docker` present, `docker info` exits 1 — expected: `docker | missing | optional | lost: README → Run it and booting the image locally; every gate runs from source | fix: brew install --cask docker` — evidence: hooks green (`docker without a daemon is missing but optional`)
- [x] Edge: `DOCTOR_SKIP=chromium` with no browser — expected: `chromium | skipped | required |`, summary `0 missing required`, exit 0 — evidence: hooks green (`a skipped tool is printed as skipped`, `is not counted`)
- [x] `doctor.sh --fix jq` — expected: stdout is exactly `brew install jq` (with `brew` on the stub `PATH`), exit 0 — evidence: live `bash .agents/hooks/doctor.sh --fix jq` printed `brew install jq`; `--fix gh` printed `gh auth login (run it yourself; the agent cannot)`
- [x] Edge: the error path — `guard-secrets.sh` and `guard-git-add-all.sh` with `DOCTOR_PATH` empty; expected: exit 2, stderr `Blocked: the hooks need jq. fix: https://jqlang.github.io/jq/download/` — evidence: live, both guards fed a real tool-input JSON with `DOCTOR_PATH=$(mktemp -d)`: that line, exit=2; control without `DOCTOR_PATH` on `.env` gave the normal `.env` block, exit 2
- [x] Every pre-existing check in `hooks.test.sh` still passes; the run ends with `hooks: all checks passed` — evidence: `bash .agents/hooks/hooks.test.sh` → `hooks: all checks passed`, exit 0
- [ ] `pnpm --filter @superdoc-collab/server exec vitest run src/repository-shape` — expected: `delivery-docs.test.ts` and `readme-run-block.test.ts` green after the README and `docs/install.md` edits — BLOCKED: deferred to the lead's /verify (heavy lock)
- [ ] `pnpm format:check` — expected: clean — BLOCKED: deferred to the lead's /verify (heavy lock). CI run 39057065057 on b55ce49: step `Run pnpm format:check` success in job `checks`

## E2E (Playwright specs)

- [x] Not applicable: no browser surface changes. Stated here on purpose. — evidence: no Playwright MCP opened, per the lead's instruction

## Prove it for real — the agent's perspective

The product UI is untouched; the user of this feature is the agent at session start. The tester proves it with real sessions, not Playwright.

- [x] Happy path: `.agents/hooks/doctor.sh` on the tester's machine — expected: one line per tool in the fixed shape, a summary line, exit code 0 when no required tool is missing (`echo $?` recorded) — evidence: at 6d04ca8, bash .agents/hooks/doctor.sh; echo exit=$?: nine lines in the fixed shape, all ok, doctor: 0 missing required, 0 missing optional, exit=0. D1 addressed: no script in package.json
- [x] Session start, Claude Code: open a new Claude Code session in a git worktree of the branch and ask "what did the session hook report?" — expected: the agent quotes the `doctor:` summary line from its context on the first turn — evidence: `claude -p` (one-shot, not an interactive TUI) in a detached worktree of b55ce49 replied `doctor: 0 missing required, 0 missing optional` and `jq | ok | required | lost: the four hooks; the two guards block | fix: brew install jq` (the hook calls the script directly, so D1 does not touch it)
- [x] Session start with a gap: in a worktree, start Claude Code with `PATH` lacking `jq` (`PATH=/usr/bin:/bin claude`, or a shell where `jq` is renamed) — expected: the first turn's context has `jq | missing | required | ... | fix: <this platform's command>`; the agent, asked to edit `.env`, is blocked with `Blocked: the hooks need jq. fix: ...`; the agent asks before installing and installs nothing on its own — evidence: `jq` is in `/usr/bin` here, so `PATH` cannot hide it; used `DOCTOR_PATH=<empty dir>` as instructed. `claude -p` quoted `jq | missing | required | lost: the four hooks; the two guards block | fix: https://jqlang.github.io/jq/download/` and `doctor: 4 missing required, 3 missing optional`. A Write of `.env.qa` returned `PreToolUse:Write hook error: ... Blocked: the hooks need jq. fix: https://jqlang.github.io/jq/download/`, file not created; the control run without `DOCTOR_PATH` returned `Blocked: agents never edit .env files; document the variable in .env.example instead.` Targets `.env`, `.env.local`, `.env.staging` never reach the hook because the Read-deny rules in `.claude/settings.json` refuse the Write first. Nothing was installed. "Asks before installing" not exercised: one-shot mode never asked the agent to repair anything
- [ ] Session start, Codex: `codex` in the same worktree — expected: the `SessionStart` hook runs (status message `Checking the tools the harness needs`) and the agent can quote the summary line — BLOCKED: codex not available on the tester's machine (`command -v codex` printed nothing)
- [x] `/verify` gate 0: run `/verify unit` — expected: the report is the first thing printed; with every required tool present the gate continues to typecheck; with `DOCTOR_PATH` pointing at an empty directory the gate stops at 0 and pastes the report — evidence: at 6d04ca8, script run: exit=0 with the nine ok lines; DOCTOR_PATH=$(mktemp -d): doctor: 5 missing required, 3 missing optional, exit=1 (stop condition). .agents/skills/verify/SKILL.md:10 now names .agents/hooks/doctor.sh. The full skill run is the lead's
- [ ] CI: the `checks` job of `verify.yml` on this branch — expected: the `.agents/hooks/doctor.sh` step is green and its log shows `chromium | skipped | required |` and `gh | ok | required |` — BLOCKED: run 39058340592 on 6d04ca8 never started: every job failed with no steps, annotation "The job was not started because recent account payments have failed or your spending limit needs to be increased" (billing). Earlier runs on 1e6a49c (39057759448) and e181d69 succeeded but predate the fix; the step output could not be read
- [x] Empty: `DOCTOR_SKIP` listing every tool — expected: nine `skipped` lines, `0 missing required, 0 missing optional`, exit 0 — evidence: `DOCTOR_SKIP` with all nine names → nine `skipped` lines, `doctor: 0 missing required, 0 missing optional`, exit=0
- [x] Many: `DOCTOR_PATH` empty, Darwin and Linux — expected: ~~nine `missing` lines, `6 missing required, 3 missing optional`~~ (plan error: `skills` is a checked-in symlink and Darwin reads the home Playwright cache, neither depends on `PATH`) every tool found through `PATH` is `missing`, `5 missing required, 3 missing optional` on Linux and `4 missing required, 3 missing optional` on Darwin, exit 1, each `fix:` an URL (no manager on an empty `PATH`) — evidence: at 6d04ca8, empty `DOCTOR_PATH`: Linux `doctor: 5 missing required, 3 missing optional` exit=1; Darwin `doctor: 4 missing required, 3 missing optional` exit=1; every `fix:` for jq, gh, gitleaks, ffmpeg, docker is a URL
- [x] Rejected input: `doctor.sh --fix` with an unknown tool name — expected: empty stdout, exit 0, nothing else printed — evidence: `doctor.sh --fix nothing` → `exit=0 out=[]`
- [x] Docs: `docs/install.md#develop-with-an-agent` exists, the README's Read more links it, HARNESS §0 has invariant 11, §7 has "Image proof without Docker", §11 Ask first names installing a tool, §12 has the `doctor.sh` row — evidence: `docs/install.md:36` `## Develop with an agent`; `README.md:31` links `docs/install.md#develop-with-an-agent`; `.claude/HARNESS.md:32` invariant 11, `:127` "Image proof without Docker", `:202` Ask first (the doctor's fix lines), `:211` `doctor.sh` row; `.claude/settings.json:26` and `.codex/hooks.json:9` run the script directly with `|| true`

## Edge cases found during execution

Each ran against the content of b55ce49.

- [x] D1: `pnpm doctor` — expected: the report, exit 1 when a required tool is missing; observed: no output, exit 0 (built-in), locally and on CI. DEFECT, regression test requested: a repository-shape or hooks check that fails when `package.json` has a script named like a `pnpm` built-in that docs, skills or workflows call without `run` — evidence: ADDRESSED at 6d04ca8: grep -rn 'pnpm doctor' .github .agents/skills finds only the warning in .agents/skills/verify/SKILL.md:10 (never pnpm doctor, which is pnpm's own built-in); package.json has no doctor script; .github/workflows/verify.yml:26 runs .agents/hooks/doctor.sh. The CI proof is blocked by billing (see the CI box)
- [x] `DOCTOR_UNAME=FreeBSD`, `DOCTOR_PATH` empty — expected: no crash, URL fallbacks, exit 1 — observed: `jq ... fix: https://jqlang.github.io/jq/download/`, `chromium ... fix: pnpm install && pnpm exec playwright install chromium` (the non-Linux branch, no `--with-deps`), `5 missing required, 3 missing optional`, exit 1
- [x] Doctor run from another cwd (`cd /tmp && bash <repo>/.agents/hooks/doctor.sh`) — expected: same report as in the repo — observed: `0 missing required, 0 missing optional`, exit 0
- [x] `.nvmrc` with trailing newline — `od -c .nvmrc` shows `2 4 \n`; observed: node `v24.7.0` reports `ok`
- [x] `PLAYWRIGHT_BROWSERS_PATH` pointing at an empty directory — expected: chromium missing, exit 1 — observed: `chromium | missing | required`, `1 missing required`, exit 1; with a `chromium-1234` directory added: `ok`; pointing at `/nonexistent`: `missing`
- [x] `DOCTOR_HOME` pointing at an empty directory — observed: `chromium | missing`, `skills | ok` (the symlink is repository-relative)
- [x] `--fix gh` with `gh` installed vs hidden — observed: installed prints `gh auth login (run it yourself; the agent cannot)`; with `DOCTOR_PATH` empty prints `https://github.com/cli/cli#installation`; `--fix` with no argument prints nothing, exit 0
- [x] `--fix` on an ok tool and with injection text (`--fix "jq; echo hi"`) — observed: an ok tool still prints its fix line; the injection string prints nothing and nothing runs, exit 0
- [x] `DOCTOR_UNAME=linux` (lowercase) — observed: URL fallback, no `sudo apt-get`, because the match is case-sensitive; real `uname` prints `Linux`, so harmless, noted only
- [x] `DOCTOR_SKIP="nope"` (unknown name) — observed: ignored, `0 missing required, 0 missing optional`
- [x] `--fix jq` with `DOCTOR_UNAME=Linux` while `brew` is on `PATH` — observed: `brew install jq` (the manager comes from `PATH`; `DOCTOR_UNAME` only picks the default), noted because a Linuxbrew host gets `brew`
- [x] The `node` check is `>=` the `.nvmrc` major (`doctor.sh:80`), so a newer major reports `ok` — observed by reading; the older-node edge is covered by hooks green

- [x] Re-run at ae08665 (contains 1e6a49c): `hooks.test.sh` → `hooks: all checks passed`; `bash .agents/hooks/doctor.sh` → `doctor: 0 missing required, 0 missing optional`, exit 0
- [x] Injection: `DOCTOR_NVMRC=<file 'root[$(touch${IFS}/tmp/doctor-pwned)]'>` — expected exit 1, message, no file — observed at ae08665: `doctor: .nvmrc is not a version`, exit=1, `ls /tmp/doctor-pwned`: No such file
- [x] `.nvmrc` variants at ae08665 — `24`, `v24.7.0`, `24\n` → exit 0; `abc` and empty → `doctor: .nvmrc is not a version`, exit 1; `24 25` → accepted, exit 0 (two majors on one line pass the validation; harmless, noted)
- [x] Guards with jq hidden from the real `PATH` (a temp dir of symlinks without jq, no `DOCTOR_PATH`) at ae08665 — `guard-secrets.sh` on `/x/.env.qa` and `guard-git-add-all.sh` on `git add -A`: both `Blocked: the hooks need jq. fix: https://jqlang.github.io/jq/download/`, exit 2; the doctor in that PATH reports `jq | missing`, `4 missing required, 3 missing optional`. A full `claude -p` session on that PATH could not run: `You've reached your Fable limit`, so the session-level check was not repeated; with `DOCTOR_PATH` it was proven at b55ce49
- [x] D1 still present at ae08665: `.github/workflows/verify.yml:26` runs `pnpm doctor` and `.agents/skills/verify/SKILL.md:10` says `pnpm doctor`; no `pnpm run doctor` anywhere — ADDRESSED at 6d04ca8, same grep as D1 above

## Tester summary

Re-run at 6d04ca8: D1 ADDRESSED. Boxes: 45 ticked of 49 owned (adversarial 3 excluded). Not ticked: Codex (BLOCKED, codex absent), the repository-shape run and the format check (deferred to the lead's /verify, heavy lock), CI (BLOCKED: run 39058340592 never started, account billing failure; rerun after billing is fixed and read the `checks` log for `chromium | skipped` and `gh | ok`), and the `/verify` skill run (lead's). Passed earlier items stand; shell boxes were re-run at ae08665 and 6d04ca8.

Defect D1 (high): `pnpm doctor` runs pnpm's built-in, prints nothing and exits 0. CI step, `/verify` gate 0 and the happy-path command are therefore no-ops; green CI proves nothing about the doctor. Reproduce: `pnpm doctor; echo $?` prints `0` and no report; run 39057065057 step log has no report. Fix: `pnpm run doctor` in `.github/workflows/verify.yml`, `.agents/skills/verify/SKILL.md`, `.claude/HARNESS.md`, docs and README, plus a regression test.

Passed: `hooks.test.sh` green; red-first reproduced in a throwaway worktree (25 FAIL lines); empty, rejected-input and docs paths; real `claude -p` sessions quote the `doctor:` line and block `.env.qa` with `Blocked: the hooks need jq. fix: ...` under `DOCTOR_PATH=<empty>`; nothing installed; script edge cases (FreeBSD, other cwd, trailing newline, browsers path, injection) behave.

Also: "Many" expectation is wrong in the plan (see its box). Red-first is shown only by the throwaway run because test and implementation share d10c064. Session checks used `claude -p`, not a TUI; "asks before installing" not exercised.

Ready for review: no, fix D1 first.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: the session hook's report reaches the agent's context in Claude Code even when a required tool is missing — attack: remove `|| true` mentally and check the exit code path; start a session with `jq` hidden and ask for the report; result: <refuted | held>
- [ ] Claim 2: the doctor needs only bash and coreutils — attack: grep `doctor.sh` for `jq`, `node`, `python`, `pnpm` outside `have`/`run`; run it with `DOCTOR_PATH` empty; result: <refuted | held>
- [ ] Claim 3: the Linux `fix:` lines are right without a Linux machine — attack: compare each `install_with` branch and the `--with-deps` line with the vendors' install docs for apt, dnf, apk, pacman; result: <refuted | held>

## Coverage honesty

What is not tested and why.

- Real Linux, dnf, apk and pacman machines: pinned only through `DOCTOR_UNAME` and stubs; the owner's and the tester's machines are macOS, CI is Ubuntu with apt-get. The risk accepted is a wrong install command on a distribution nobody on the project uses today; the line still names the tool and the URL fallback exists.
- Codex's `SessionStart` is proven by one manual session, not by `hooks.test.sh`, because the test harness cannot start Codex.
- `docker info` latency with a stopped daemon is observed, not asserted.
