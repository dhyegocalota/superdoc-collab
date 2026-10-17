# Test plan: Agent doctor

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `.agents/hooks/hooks.test.sh::doctor: every tool present reports ok` — input: a stub `PATH` with every tool, `DOCTOR_UNAME=Darwin`; expected: before Task 1 the run prints `FAIL doctor:` lines because `doctor.sh` does not exist
- [ ] `.agents/hooks/hooks.test.sh::guard-secrets without jq` — input: `DOCTOR_PATH` pointing at an empty directory; expected before Task 1: `FAIL guard-secrets without jq: expected exit 2, got 0`
- [ ] Confirmed it fails for the right reason: `No such file or directory` for `doctor.sh`, and `got 0` for both guards (the guards fail open today)

## Unit

`bash .agents/hooks/hooks.test.sh` (also `pnpm test:hooks`, part of `pnpm test:unit`).

- [ ] `doctor: every tool present reports ok` — all stubs, Darwin; expected: summary `doctor: 0 missing required, 0 missing optional`, no `| missing |` line, exit 0
- [ ] `doctor: a line carries the full shape` — expected: `jq | ok | required | lost: <text> | fix: brew install jq`
- [ ] `doctor: missing jq on macOS names brew` — `jq` stub removed, `brew` present; expected: `jq | missing | required | lost: the four hooks; the two guards block | fix: brew install jq`, summary `1 missing required`, exit 1
- [ ] `doctor: missing jq on Linux names apt-get` — `DOCTOR_UNAME=Linux`, `apt-get` stub, no `brew`; expected: `fix: sudo apt-get install -y jq`
- [ ] `doctor: chromium on Linux installs with deps` — expected: `fix: pnpm install && pnpm exec playwright install --with-deps chromium`
- [ ] Edge: no package manager — expected: `fix: https://jqlang.github.io/jq/download/`, exit 1 unchanged
- [ ] Edge: only optional tools missing (`ffmpeg`, `gitleaks`, `docker`) — expected: `doctor: 0 missing required, 3 missing optional`, exit 0; the `ffmpeg` line says `lost: the recorder's mp4 and gif; a PR that touches UI cannot ship`
- [ ] Edge: `gh` present and `gh auth status` exits 1 — expected: `gh | missing | required | ... | fix: gh auth login (run it yourself; the agent cannot)`
- [ ] Edge: `node` prints `v22.11.0` with `.nvmrc` = 24 — expected: `node | missing | required | lost: everything | fix: nvm install (reads .nvmrc), or https://nodejs.org/en/download`
- [ ] Edge: `pnpm` prints `9.0.0` — expected: `pnpm | missing | required | lost: everything | fix: corepack enable && corepack prepare pnpm@8.15.9 --activate`
- [ ] Edge: no `chromium-*` directory in the fake cache — expected: `chromium | missing | required | lost: pnpm test:e2e, both Playwright MCP servers, /check-ui, /scenario, the tester | fix: pnpm install && pnpm exec playwright install chromium`
- [ ] Edge: `docker` present, `docker info` exits 1 — expected: `docker | missing | optional | lost: README → Run it and booting the image locally; every gate runs from source | fix: brew install --cask docker`
- [ ] Edge: `DOCTOR_SKIP=chromium` with no browser — expected: `chromium | skipped | required |`, summary `0 missing required`, exit 0
- [ ] `doctor.sh --fix jq` — expected: stdout is exactly `brew install jq` (with `brew` on the stub `PATH`), exit 0
- [ ] Edge: the error path — `guard-secrets.sh` and `guard-git-add-all.sh` with `DOCTOR_PATH` empty; expected: exit 2, stderr `Blocked: the hooks need jq. fix: https://jqlang.github.io/jq/download/`
- [ ] Every pre-existing check in `hooks.test.sh` still passes; the run ends with `hooks: all checks passed`
- [ ] `pnpm --filter @superdoc-collab/server exec vitest run src/repository-shape` — expected: `delivery-docs.test.ts` and `readme-run-block.test.ts` green after the README and `docs/install.md` edits
- [ ] `pnpm format:check` — expected: clean

## E2E (Playwright specs)

- [ ] Not applicable: no browser surface changes. Stated here on purpose.

## Prove it for real — the agent's perspective

The product UI is untouched; the user of this feature is the agent at session start. The tester proves it with real sessions, not Playwright.

- [ ] Happy path: `pnpm doctor` on the tester's machine — expected: one line per tool in the fixed shape, a summary line, exit code 0 when no required tool is missing (`echo $?` recorded)
- [ ] Session start, Claude Code: open a new Claude Code session in a git worktree of the branch and ask "what did the session hook report?" — expected: the agent quotes the `doctor:` summary line from its context on the first turn
- [ ] Session start with a gap: in a worktree, start Claude Code with `PATH` lacking `jq` (`PATH=/usr/bin:/bin claude`, or a shell where `jq` is renamed) — expected: the first turn's context has `jq | missing | required | ... | fix: <this platform's command>`; the agent, asked to edit `.env`, is blocked with `Blocked: the hooks need jq. fix: ...`; the agent asks before installing and installs nothing on its own
- [ ] Session start, Codex: `codex` in the same worktree — expected: the `SessionStart` hook runs (status message `Checking the tools the harness needs`) and the agent can quote the summary line
- [ ] `/verify` gate 0: run `/verify unit` — expected: the report is the first thing printed; with every required tool present the gate continues to typecheck; with `DOCTOR_PATH` pointing at an empty directory the gate stops at 0 and pastes the report
- [ ] CI: the `checks` job of `verify.yml` on this branch — expected: the `pnpm doctor` step is green and its log shows `chromium | skipped | required |` and `gh | ok | required |`
- [ ] Empty: `DOCTOR_SKIP` listing every tool — expected: nine `skipped` lines, `0 missing required, 0 missing optional`, exit 0
- [ ] Many: `DOCTOR_PATH` empty, Darwin and Linux — expected: nine `missing` lines, `6 missing required, 3 missing optional`, exit 1, each `fix:` an URL (no manager on an empty `PATH`)
- [ ] Rejected input: `doctor.sh --fix` with an unknown tool name — expected: empty stdout, exit 0, nothing else printed
- [ ] Docs: `docs/install.md#develop-with-an-agent` exists, the README's Read more links it, HARNESS §0 has invariant 11, §7 has "Image proof without Docker", §11 Ask first names installing a tool, §12 has the `doctor.sh` row

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

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
