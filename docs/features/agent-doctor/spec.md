# Agent doctor

**Status:** Building
**Tier:** 🟡
**Owner approval:** approved 2026-10-17
**ADRs:** [0026](../../adr/0026-the-agent-repairs-its-own-machine-doctor-reports-never-installs.md), [0014](../../adr/0014-one-source-per-agent-surface.md), [0022](../../adr/0022-mechanical-security-gates-and-a-security-reviewer.md)
**Not changing:** product code, `README.md` → Run it (pinned by `readme-run-block.test.ts`), `.github/actions/install`, the skills `/open-pr`, `/check-ui`, `/scenario`, `CLAUDE.md` → Tooling, `.mcp.json`, `.codex/config.toml`

## Problem

Developing in this repository is agentic: the developer opens it in Claude Code or Codex and the agent does the work. The harness that agent runs assumes `jq`, `gh`, `ffmpeg`, `gitleaks`, Docker, Node 24, pnpm 8.15.9 and the Playwright Chromium, and nothing in the repository names them. CI has them all, so CI never shows the gap. On a developer's machine most of them fail loudly and late (at `/open-pr`, hours in); `gitleaks` degrades honestly; `jq` fails silently and turns the two blocking guards (`.env`, `git add -A`) into `exit 0`.

## Goals

- The agent knows, on the first turn of a session, which tools the machine lacks, what the harness cannot do without each, and the exact command to install it on this platform.
- The two blocking guards never become no-ops: without `jq` they block and say how to install it.
- One executable list of requirements, run by the session hook, by `/verify` and by CI, so it cannot drift from `actions/install`.
- A human reading `docs/install.md` learns in three lines how to start developing: clone, open in an agent, approve the installs, ask for `/verify`.

## Non-goals

- Installing anything from a hook (ADR 0026).
- Pinning tool versions beyond Node (`.nvmrc`) and pnpm (`packageManager`).
- A devcontainer or Nix shell.
- Windows without a POSIX shell; the harness already depends on bash and the `.claude/skills` symlink.
- Checking network reachability for `npx` or OpenRouter.

## Design

### Data flow

`.agents/hooks/doctor.sh` runs with no input. It detects the platform (`uname -s`) and the first package manager on `PATH` among `brew`, `apt-get`, `dnf`, `apk`, `pacman`. For each tool it runs the check, then prints one line in a fixed shape:

```
<tool> | ok|missing|skipped | required|optional | lost: <capability> | fix: <command or URL>
```

The exit code is 1 when any required tool is missing, 0 otherwise. Optional tools never change the exit code.

| Tool | Check | Required | Lost without it |
|---|---|---|---|
| node | `node -v` major ≥ `.nvmrc` | yes | everything |
| pnpm | `pnpm -v` equals the version in `package.json` → `packageManager` | yes | everything |
| jq | on `PATH` | yes | the four hooks; the two guards block |
| gh | on `PATH` and `gh auth token` exits 0 (local, no network) | yes | `/open-pr`, the recorder's release upload; `gh auth login` is the human's step |
| Playwright Chromium | a `chromium-*` directory in the Playwright cache (`PLAYWRIGHT_BROWSERS_PATH`, else `~/Library/Caches/ms-playwright` on Darwin and `~/.cache/ms-playwright` elsewhere), so the check needs no `node_modules` | yes | `pnpm test:e2e`, both Playwright MCP servers, `/check-ui`, `/scenario`, the tester |
| gitleaks | on `PATH` | optional | the local secret scan; CI runs it |
| ffmpeg | on `PATH` | optional | the recorder's mp4 and gif; a PR that touches UI cannot ship |
| docker | on `PATH` and the daemon answers `docker info` | optional | README → Run it and booting the image locally; every gate runs from source |
| `.claude/skills` | resolves to `.agents/skills` | yes | every Claude Code skill (ADR 0014) |

The `fix:` column comes from one table keyed by `<tool>:<package manager>`; a tool with no entry for the detected manager prints its official install URL. Node and pnpm fixes point at `nvm`/`corepack` through that same table.

Wiring, one source and thin adapters (ADR 0014):

- `.claude/settings.json`: `SessionStart` hook → `doctor.sh`.
- `.codex/hooks.json`: the same event, after the plan verifies Codex's event name; if Codex has none, `$verify` gate 0 is the Codex path.
- `.agents/skills/verify/SKILL.md`: gate 0 is `.agents/hooks/doctor.sh`; a non-zero exit stops the gate with the report pasted verbatim.
- `.github/workflows/verify.yml`: one step runs the doctor after `actions/install` in the `checks` job and fails the job on exit 1.
- No `package.json` script: `pnpm doctor` is pnpm's own built-in and would shadow it, and a script would need pnpm to report that pnpm is missing. Every caller runs `.agents/hooks/doctor.sh` directly.

Guards fail closed: `touched-files.sh` and `guard-git-add-all.sh` start with a `jq` presence check that exits 2 with `Blocked: the hooks need jq. fix: <the doctor's line for jq>`.

Documents, each pointing at the script and never repeating the list:

- `.claude/HARNESS.md` §0 invariant 11: the agent repairs its own machine before working and never works with a blocking hook off; `doctor.sh` is the only list of requirements. §7 Ship: a diff that touches `docker/` or `deploy/` on a machine without Docker either installs it (asked first) or states in the PR that the image was proven by CI only, never silently. §11 Ask first: installing a tool on the machine. §12 table: the doctor row.
- `docs/install.md` → "Develop with an agent": three lines mirroring "Install with an agent".
- `README.md` → Read more: one link to that section.

### Interfaces

- `doctor.sh` stdin: none. stdout: one line per tool in the shape above, then a summary line `doctor: <n> missing required, <m> missing optional`. Exit 0 or 1.
- Test seams: `DOCTOR_UNAME`, `DOCTOR_PATH`, `DOCTOR_HOME`, `DOCTOR_SKIP` and `DOCTOR_NVMRC` override `uname -s`, the tool lookup path, the home directory, the tools to skip and the `.nvmrc` file, so `hooks.test.sh` pins the Linux and macOS `fix:` lines, the missing-tool paths and the hostile `.nvmrc` case without touching the real machine. All five are read only by the doctor; the `jq` guard checks the real `PATH`.
- The doctor validates what it reads from the repository before using it: `.nvmrc` must be digits and `packageManager` must be `pnpm@x.y.z`, or it exits 1 with a one-line reason before any report line, because a `-ge` comparison evaluates its operands arithmetically and would execute a crafted file.
- `hooks.test.sh`: new cases for the doctor and for the guards without `jq`.

### Failure handling

- `jq` missing → doctor line says so, guards block with the same line; nothing else in the harness is trusted until it is installed.
- `gh` present, not authenticated → `missing`, `fix: gh auth login (run it yourself; the agent cannot)`.
- No package manager recognised → `fix:` is the official URL; the exit code is unchanged.
- The doctor itself must never fail on a missing tool: every check is `command -v` or a sub-command guarded by it.
- On CI, a required tool missing fails the `checks` job; the message is the same report.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Does the doctor install what is missing? | installs / reports only | Reports only; the agent asks before each install | 2026-10-17 |
| Which platforms? | macOS only / detect from the machine | Detect; never assume macOS, Linux is as likely | 2026-10-17 |
| Where does the human read how to start? | HARNESS prose list / `docs/install.md` mirror of "Install with an agent" + README link | The mirror and the link; prose never repeats the list | 2026-10-17 |
| Is `gh` required or optional? | required / optional | Required: no PR opens without it | 2026-10-17 |
| Is Docker required or optional for a developer? | required / optional / ask the developer | Optional, no question asked: every gate boots the stack from source (`e2e/stack.ts`); Docker is the operator's Run it block and the CI image job. When the diff touches `docker/` or `deploy/` and Docker is missing, the agent asks to install it or states in the PR that the image was proven by CI only | 2026-10-17 |

## Test strategy summary

- `hooks.test.sh` (part of `pnpm test:unit`): doctor with a fake `PATH` holding every tool → all `ok`, exit 0; one required tool removed → its `missing` line, exit 1; only optional tools removed → exit 0; `DOCTOR_UNAME=Linux` with `apt-get` on the fake `PATH` → `fix: sudo apt-get install -y jq`; `DOCTOR_UNAME=Darwin` with `brew` → `fix: brew install jq`; no manager → the URL; both guards without `jq` → exit 2 with the `fix:` line.
- `delivery-docs.test.ts` and `readme-run-block.test.ts` keep passing after the README and `docs/install.md` edits.
- Tester: starts a Claude Code session in a worktree with `jq` hidden from `PATH`, confirms the turn-1 report, confirms `Edit` on `.env` is blocked with the `fix:` line, installs nothing, restores `PATH`, confirms a clean report and `/verify` gate 0 green. On CI: the doctor step is green in `verify.yml`.
