# Plan: Agent doctor

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `.agents/hooks/` (one source for both agent tools, ADR 0014); the `SessionStart` event in `.claude/settings.json` and `.codex/hooks.json`; gate 0 of `/verify`; the `checks` job of `verify.yml`.
**Goal:** one bash script that tells the agent, on the first turn and in `/verify`, which tools the machine lacks and the exact command to install each on this platform, while the two blocking guards stop being no-ops without `jq`.
**Architecture:** `doctor.sh` holds the tool table and the fix table and prints one line per tool; the guards call `doctor.sh --fix jq` so the fix text has one home. Three adapters call the script: the session hooks (report only, exit forced to 0 so the output reaches the context), `/verify` and CI (exit code matters). Documents point at the script and never repeat the list.
**Tech stack:** bash 3.2+ and coreutils only (no `jq`, no node) inside the doctor; `hooks.test.sh` for tests; Prettier on every Markdown and JSON touched.

**Assumptions (decided, owner can override):**

- The doctor's `fix:` for Node is `nvm install` (reads `.nvmrc`) with the nodejs.org URL as the alternative, and for pnpm it is `corepack enable && corepack prepare pnpm@<version> --activate`, the same on every platform; package managers ship versions the repo does not pin.
- On CI the doctor runs with `DOCTOR_SKIP=chromium` (the `checks` job has no browser and the line is printed as `skipped`) and `GH_TOKEN: ${{ github.token }}` so `gh auth status` passes.
- `warn-conventions.sh` inherits the `jq` requirement because it sources `touched-files.sh`; a PostToolUse exit 2 shows the fix line to the agent and blocks nothing. `remind-docs.sh` keeps its own `jq` call unchanged (out of the spec's scope).
- The doctor checks the browser through the Playwright cache directory (`$PLAYWRIGHT_BROWSERS_PATH`, else `~/Library/Caches/ms-playwright` on Darwin, `~/.cache/ms-playwright` elsewhere) and not through `pnpm exec playwright`, so it needs no `node_modules`.
- Codex's `SessionStart` hook exists (`codex-rs/config/src/hook_config.rs`, `HookEventsToml.session_start`) and takes the same `command` handler shape the repository already uses.

## Global constraints

- Everything in English; no comments; flat `if`s, early returns, no `else`; named functions; no `?? default` (AGENTS.md → Code conventions).
- The doctor depends on bash and coreutils alone; every tool invocation is guarded by `command -v`.
- Report line shape, exactly: `<tool> | ok|missing|skipped | required|optional | lost: <capability> | fix: <command or URL>`; summary line `doctor: <n> missing required, <m> missing optional`; exit 1 when `n > 0`, else 0.
- Test seams, read only by the doctor and the `jq` guard: `DOCTOR_UNAME`, `DOCTOR_PATH`, `DOCTOR_HOME`, `DOCTOR_SKIP`.
- `pnpm format:check` must stay green: run `pnpm exec prettier --write <files>` on every `.md` and `.json` touched.
- `README.md` → Run it does not change (pinned by `readme-run-block.test.ts`).

## Review focus

Inputs the spec implies and no step below would test unless listed here; each has its test in the owning task.

1. `gh` installed but `gh auth status` fails → `missing` with `fix: gh auth login (run it yourself; the agent cannot)` (Task 1, step 6).
2. `node` present at a major below `.nvmrc` → `missing` (not `ok`), fix names `nvm install` (Task 1, step 6).
3. `pnpm` present at another version than `packageManager` → `missing` (Task 1, step 6).
4. Machine with no recognised package manager → `fix:` is the official URL and the exit code is unchanged (Task 1, step 6).
5. `docker` on `PATH` but daemon down (`docker info` fails) → `missing | optional`, exit code unchanged (Task 1, step 6).

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `.agents/hooks/doctor.sh`, `.agents/hooks/touched-files.sh`, `.agents/hooks/guard-git-add-all.sh`, `.agents/hooks/hooks.test.sh`, `package.json` (`doctor` script) | `developer-1` |
| G2 | `.claude/settings.json`, `.codex/hooks.json`, `.agents/skills/verify/SKILL.md`, `.github/workflows/verify.yml` | `developer-2` |
| G3 | `.claude/HARNESS.md`, `docs/install.md`, `README.md`, `docs/features/README.md`, `docs/features/agent-doctor/tester-briefing.md` | `developer-3` |

## Sequencing

G1 first: it defines the script's path, flags, environment variables and exit codes. G2 and G3 run in parallel after G1's interface exists (step 4 of Task 1 creates the file); they only reference it. The tester runs after all three.

## Steps

Author this list with every box empty. A sub-agent ticks its own line. A wrong step is struck through with the reason, not deleted.

### Task 1 (G1): `doctor.sh` and the fail-closed guards

**Files:**
- Create: `.agents/hooks/doctor.sh` (executable)
- Modify: `.agents/hooks/touched-files.sh`
- Modify: `.agents/hooks/guard-git-add-all.sh`
- Modify: `.agents/hooks/hooks.test.sh` (append before the final summary lines)
- Modify: `package.json` → `scripts`

**Interfaces:**
- Produces: `.agents/hooks/doctor.sh` with no arguments → report on stdout, exit 0/1; `.agents/hooks/doctor.sh --fix <tool>` → the fix text alone on stdout, exit 0; environment `DOCTOR_UNAME`, `DOCTOR_PATH`, `DOCTOR_HOME`, `DOCTOR_SKIP` (space-separated tool names). Tool names: `node pnpm jq gh chromium skills gitleaks ffmpeg docker`. `pnpm doctor` runs it.

- [ ] **Step 1: Write the failing tests.** Append to `.agents/hooks/hooks.test.sh` immediately before the line `[[ "$failures" == 0 ]] && echo "hooks: all checks passed" && exit 0`:

```bash
doctor_bin=$(mktemp -d)
doctor_home=$(mktemp -d)
stub() { printf '#!/bin/bash\n%s\n' "$2" > "$doctor_bin/$1"; chmod +x "$doctor_bin/$1"; }
stub_all() {
  rm -f "$doctor_bin"/*
  stub node 'echo v24.7.0'
  stub pnpm 'echo 8.15.9'
  stub jq 'exit 0'
  stub gh 'exit 0'
  stub gitleaks 'exit 0'
  stub ffmpeg 'exit 0'
  stub docker 'exit 0'
  stub brew 'exit 0'
  rm -rf "$doctor_home/Library" "$doctor_home/.cache"
  mkdir -p "$doctor_home/Library/Caches/ms-playwright/chromium-1247" "$doctor_home/.cache/ms-playwright/chromium-1247"
}
doctor() { DOCTOR_UNAME="$1" DOCTOR_PATH="$doctor_bin" DOCTOR_HOME="$doctor_home" DOCTOR_SKIP="${2:-}" "$here/doctor.sh" 2>&1; }
doctor_line() { doctor "$1" "${3:-}" | grep "^$2 "; }
doctor_exit() { local name=$1 expected=$2 platform=$3; doctor "$platform" >/dev/null; local actual=$?; [[ "$actual" == "$expected" ]] && return; echo "FAIL $name: expected exit $expected, got $actual"; failures=$((failures + 1)); }

stub_all
report=$(doctor Darwin)
expect_match "doctor: every tool present reports ok" "$report" 'doctor: 0 missing required, 0 missing optional'
expect_no_match "doctor: every tool present has no missing line" "$report" '\| missing \|'
expect_match "doctor: a line carries the full shape" "$(doctor_line Darwin jq)" '^jq \| ok \| required \| lost: [^|]+ \| fix: brew install jq$'
doctor_exit "doctor: every tool present exits 0" 0 Darwin

rm "$doctor_bin/jq"
report=$(doctor Darwin)
expect_match "doctor: missing jq on macOS names brew" "$(doctor_line Darwin jq)" '^jq \| missing \| required \| lost: the four hooks; the two guards block \| fix: brew install jq$'
expect_match "doctor: one missing required is counted" "$report" 'doctor: 1 missing required, 0 missing optional'
doctor_exit "doctor: a missing required tool exits 1" 1 Darwin

stub_all; rm "$doctor_bin/jq" "$doctor_bin/brew"; stub apt-get 'exit 0'
report=$(doctor Linux)
expect_match "doctor: missing jq on Linux names apt-get" "$report" 'fix: sudo apt-get install -y jq'
expect_match "doctor: chromium on Linux installs with deps" "$(doctor_line Linux chromium)" '^chromium \| ok \| required \| lost: [^|]+ \| fix: pnpm install && pnpm exec playwright install --with-deps chromium$'

stub_all; rm "$doctor_bin/jq" "$doctor_bin/brew"
report=$(doctor Linux)
expect_match "doctor: no package manager falls back to the URL" "$report" 'fix: https://jqlang.github.io/jq/download/'
doctor_exit "doctor: the fallback keeps the exit code" 1 Linux

stub_all; rm "$doctor_bin/ffmpeg" "$doctor_bin/gitleaks" "$doctor_bin/docker"
report=$(doctor Darwin)
expect_match "doctor: optional tools are counted apart" "$report" 'doctor: 0 missing required, 3 missing optional'
expect_match "doctor: ffmpeg says what is lost" "$(doctor_line Darwin ffmpeg)" '^ffmpeg \| missing \| optional \| lost: the recorder.s mp4 and gif; a PR that touches UI cannot ship \| fix: brew install ffmpeg$'
doctor_exit "doctor: missing optional tools exit 0" 0 Darwin

stub_all; stub gh 'exit 1'
report=$(doctor Darwin)
expect_match "doctor: gh without auth is missing with the human step" "$(doctor_line Darwin gh)" '^gh \| missing \| required \| lost: [^|]+ \| fix: gh auth login \(run it yourself; the agent cannot\)$'

stub_all; stub node 'echo v22.11.0'
expect_match "doctor: node below .nvmrc is missing" "$(doctor_line Darwin node)" '^node \| missing \| required \| lost: everything \| fix: nvm install \(reads \.nvmrc\), or https://nodejs\.org/en/download$'

stub_all; stub pnpm 'echo 9.0.0'
expect_match "doctor: pnpm at another version is missing" "$(doctor_line Darwin pnpm)" '^pnpm \| missing \| required \| lost: everything \| fix: corepack enable && corepack prepare pnpm@8\.15\.9 --activate$'

stub_all; rm -rf "$doctor_home/Library/Caches/ms-playwright"
expect_match "doctor: no chromium in the cache is missing" "$(doctor_line Darwin chromium)" '^chromium \| missing \| required \| lost: pnpm test:e2e, both Playwright MCP servers, /check-ui, /scenario, the tester \| fix: pnpm install && pnpm exec playwright install chromium$'

stub_all; stub docker 'exit 1'
expect_match "doctor: docker without a daemon is missing but optional" "$(doctor_line Darwin docker)" '^docker \| missing \| optional \| lost: README → Run it and booting the image locally; every gate runs from source \| fix: brew install --cask docker$'

stub_all; rm -rf "$doctor_home/Library/Caches/ms-playwright"
report=$(doctor Darwin chromium)
expect_match "doctor: a skipped tool is printed as skipped" "$(doctor_line Darwin chromium chromium)" '^chromium \| skipped \| required \|'
expect_match "doctor: a skipped tool is not counted" "$report" 'doctor: 0 missing required, 0 missing optional'

stub_all; rm "$doctor_bin/jq"
fix_line=$(DOCTOR_PATH="$doctor_bin" "$here/doctor.sh" --fix jq)
[[ "$fix_line" == "brew install jq" ]] || { echo "FAIL doctor --fix prints the fix alone: $fix_line"; failures=$((failures + 1)); }

empty_path=$(mktemp -d)
guard_without_jq() { DOCTOR_PATH="$empty_path" "$here/$1" 2>&1 >/dev/null; }
output=$(printf '%s' "$(claude_edit /repo/apps/web/src/main.tsx)" | guard_without_jq guard-secrets.sh); status=$?
[[ "$status" == 2 ]] || { echo "FAIL guard-secrets without jq: expected exit 2, got $status"; failures=$((failures + 1)); }
expect_match "guard-secrets without jq names the fix" "$output" '^Blocked: the hooks need jq\. fix: https://jqlang\.github\.io/jq/download/$'
output=$(printf '%s' "$(bash_call 'git add README.md')" | guard_without_jq guard-git-add-all.sh); status=$?
[[ "$status" == 2 ]] || { echo "FAIL guard-git-add-all without jq: expected exit 2, got $status"; failures=$((failures + 1)); }
expect_match "guard-git-add-all without jq names the fix" "$output" '^Blocked: the hooks need jq\. fix: '
rm -rf "$doctor_bin" "$doctor_home" "$empty_path"
```

Stubs use `#!/bin/bash`, not `env`: the doctor runs them with `PATH` reduced to the stub directory, where `env` would not find `bash`. Per-tool assertions go through `doctor_line`, because bash's `=~` anchors `^` and `$` to the whole string, not to a line.

- [ ] **Step 2: Run the tests and confirm they fail for the right reason.** `bash .agents/hooks/hooks.test.sh`. Expected: lines starting `FAIL doctor:` because `doctor.sh` does not exist (`No such file or directory`), `FAIL guard-secrets without jq: expected exit 2, got 0`, `FAIL guard-git-add-all without jq: expected exit 2, got 0`; the earlier checks still pass.

- [ ] **Step 3: Write `.agents/hooks/doctor.sh`** and `chmod +x` it:

```bash
#!/usr/bin/env bash
set -u
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
platform=${DOCTOR_UNAME:-$(uname -s)}
lookup_path=${DOCTOR_PATH:-$PATH}
home=${DOCTOR_HOME:-$HOME}
skipped=" ${DOCTOR_SKIP:-} "
wanted_node=$(tr -d '[:space:]' < "$root/.nvmrc")
wanted_pnpm=$(sed -nE 's/.*"packageManager": *"pnpm@([^"]+)".*/\1/p' "$root/package.json")

have() { PATH=$lookup_path command -v "$1" >/dev/null 2>&1; }
run() { PATH=$lookup_path "$@"; }

package_manager() {
  local candidate
  for candidate in brew apt-get dnf apk pacman; do
    have "$candidate" && { echo "$candidate"; return; }
  done
  echo none
}
manager=$(package_manager)

install_with() {
  case "$manager" in
    brew) echo "brew install $1" ;;
    apt-get) echo "sudo apt-get install -y $1" ;;
    dnf) echo "sudo dnf install -y $1" ;;
    apk) echo "sudo apk add $1" ;;
    pacman) echo "sudo pacman -S --noconfirm $1" ;;
    *) echo "$2" ;;
  esac
}

chromium_install() {
  [[ "$platform" == Linux ]] && { echo "pnpm install && pnpm exec playwright install --with-deps chromium"; return; }
  echo "pnpm install && pnpm exec playwright install chromium"
}

docker_install() {
  [[ "$manager" == brew ]] && { echo "brew install --cask docker"; return; }
  echo "https://docs.docker.com/engine/install/"
}

fix_for() {
  case "$1" in
    node) echo "nvm install (reads .nvmrc), or https://nodejs.org/en/download" ;;
    pnpm) echo "corepack enable && corepack prepare pnpm@$wanted_pnpm --activate" ;;
    jq) install_with jq "https://jqlang.github.io/jq/download/" ;;
    gh) install_with gh "https://github.com/cli/cli#installation" ;;
    gh-auth) echo "gh auth login (run it yourself; the agent cannot)" ;;
    chromium) chromium_install ;;
    skills) echo "ln -sfn ../.agents/skills .claude/skills" ;;
    gitleaks) install_with gitleaks "https://github.com/gitleaks/gitleaks#installing" ;;
    ffmpeg) install_with ffmpeg "https://ffmpeg.org/download.html" ;;
    docker) docker_install ;;
  esac
}

lost_for() {
  case "$1" in
    node|pnpm) echo "everything" ;;
    jq) echo "the four hooks; the two guards block" ;;
    gh) echo "/open-pr and the recorder's release upload" ;;
    chromium) echo "pnpm test:e2e, both Playwright MCP servers, /check-ui, /scenario, the tester" ;;
    skills) echo "every Claude Code skill (ADR 0014)" ;;
    gitleaks) echo "the local secret scan; CI runs it" ;;
    ffmpeg) echo "the recorder's mp4 and gif; a PR that touches UI cannot ship" ;;
    docker) echo "README → Run it and booting the image locally; every gate runs from source" ;;
  esac
}

browsers_dir() {
  [[ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ]] && { echo "$PLAYWRIGHT_BROWSERS_PATH"; return; }
  [[ "$platform" == Darwin ]] && { echo "$home/Library/Caches/ms-playwright"; return; }
  echo "$home/.cache/ms-playwright"
}

node_major() { run node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'; }

check_node() { have node && [[ "$(node_major)" -ge "$wanted_node" ]]; }
check_pnpm() { have pnpm && [[ "$(run pnpm -v 2>/dev/null)" == "$wanted_pnpm" ]]; }
check_jq() { have jq; }
check_gh() { have gh && run gh auth status >/dev/null 2>&1; }
check_chromium() { ls -d "$(browsers_dir)"/chromium-* >/dev/null 2>&1; }
check_skills() { [[ "$(cd "$root/.claude/skills" 2>/dev/null && pwd -P)" == "$(cd "$root/.agents/skills" && pwd -P)" ]]; }
check_gitleaks() { have gitleaks; }
check_ffmpeg() { have ffmpeg; }
check_docker() { have docker && run docker info >/dev/null 2>&1; }

fix_name_for() {
  [[ "$1" == gh ]] && have gh && { echo gh-auth; return; }
  echo "$1"
}

if [[ "${1:-}" == --fix ]]; then
  fix_for "$(fix_name_for "$2")"
  exit 0
fi

missing_required=0
missing_optional=0

report() {
  local tool=$1 requirement=$2 state
  state=missing
  [[ "$skipped" == *" $tool "* ]] && state=skipped
  [[ "$state" == missing ]] && "check_$tool" && state=ok
  printf '%s | %s | %s | lost: %s | fix: %s\n' "$tool" "$state" "$requirement" "$(lost_for "$tool")" "$(fix_for "$(fix_name_for "$tool")")"
  [[ "$state" == missing ]] || return 0
  [[ "$requirement" == required ]] && missing_required=$((missing_required + 1)) && return 0
  missing_optional=$((missing_optional + 1))
}

report node required
report pnpm required
report jq required
report gh required
report chromium required
report skills required
report gitleaks optional
report ffmpeg optional
report docker optional
echo "doctor: $missing_required missing required, $missing_optional missing optional"
[[ "$missing_required" == 0 ]]
```

- [ ] **Step 4: Make the guards fail closed.** Replace the whole of `.agents/hooks/touched-files.sh` with:

```bash
#!/usr/bin/env bash
hook_input=$(cat)

require_jq() {
  PATH=${DOCTOR_PATH:-$PATH} command -v jq >/dev/null 2>&1 && return
  echo "Blocked: the hooks need jq. fix: $("$(dirname "${BASH_SOURCE[0]}")/doctor.sh" --fix jq)" >&2
  exit 2
}
require_jq

touched_files() {
  local file_path
  file_path=$(jq -r '.tool_input.file_path // ""' <<<"$hook_input")
  if [[ -n "$file_path" ]]; then
    echo "$file_path"
    return
  fi
  jq -r '.tool_input.command // ""' <<<"$hook_input" | sed -nE 's/^\*\*\* (Update|Add|Delete) File: //p; s/^\*\*\* Move to: //p'
}
```

Replace the first two lines of `.agents/hooks/guard-git-add-all.sh` (`#!/usr/bin/env bash` and `command=$(jq -r '.tool_input.command // ""')`) with:

```bash
#!/usr/bin/env bash
source "$(dirname "$0")/touched-files.sh"
command=$(jq -r '.tool_input.command // ""' <<<"$hook_input")
```

- [ ] **Step 5: Add the script to `package.json`**, after `"test:hooks"`:

```json
    "doctor": "bash .agents/hooks/doctor.sh",
```

- [ ] **Step 6: Run the tests.** `bash .agents/hooks/hooks.test.sh`. Expected: `hooks: all checks passed`, exit 0. Then `pnpm doctor` on the real machine: every line `ok` (or an honest `missing` for a tool this machine lacks), exit code matches the summary. Then `pnpm exec prettier --check package.json`.

- [ ] **Step 7: Commit.**

```bash
git add .agents/hooks/doctor.sh .agents/hooks/touched-files.sh .agents/hooks/guard-git-add-all.sh .agents/hooks/hooks.test.sh package.json
git commit -m "feat(hooks): doctor.sh reports the tools the harness needs; guards fail closed without jq"
```

### Task 2 (G2): wire the doctor into the sessions, `/verify` and CI

**Files:**
- Modify: `.claude/settings.json`
- Modify: `.codex/hooks.json`
- Modify: `.agents/skills/verify/SKILL.md`
- Modify: `.github/workflows/verify.yml` (`checks` job)

**Interfaces:**
- Consumes: `.agents/hooks/doctor.sh` (exit 1 on a missing required tool; `DOCTOR_SKIP`), `pnpm doctor`.

- [ ] **Step 1: Claude Code session hook.** In `.claude/settings.json` → `hooks`, add before `"PreToolUse"`:

```json
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.agents/hooks/doctor.sh || true"
          }
        ]
      }
    ],
```

The `|| true` is deliberate: Claude Code adds a hook's stdout to the context only on exit 0, and the report is the point.

- [ ] **Step 2: Codex session hook.** In `.codex/hooks.json` → `hooks`, add before `"PreToolUse"`:

```json
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$(git rev-parse --show-toplevel)/.agents/hooks/doctor.sh\" || true",
            "timeout": 30,
            "statusMessage": "Checking the tools the harness needs"
          }
        ]
      }
    ],
```

- [ ] **Step 3: `/verify` gate 0.** In `.agents/skills/verify/SKILL.md`: extend `allowed-tools` with `Bash(.agents/hooks/doctor.sh:*)`; renumber the list so it starts with:

```
0. `pnpm doctor`: the machine report. A missing required tool stops the gate with the report pasted verbatim; the agent asks before running any `fix:` line (ADR 0026). Missing optional tools are reported and the gate continues
1. `pnpm typecheck`
```

and add to the success report: `doctor clean (or the optional tools missing)`.

- [ ] **Step 4: CI step.** In `.github/workflows/verify.yml` → `checks` job, after `- run: pnpm test:hooks`:

```yaml
      - run: pnpm doctor
        env:
          GH_TOKEN: ${{ github.token }}
          DOCTOR_SKIP: chromium
```

- [ ] **Step 5: Verify locally.** `pnpm exec prettier --check .claude/settings.json .codex/hooks.json .agents/skills/verify/SKILL.md .github/workflows/verify.yml`; `GH_TOKEN=$(gh auth token) DOCTOR_SKIP=chromium pnpm doctor` exits 0 on a machine where `jq`, `gh`, node and pnpm are right. Confirm the Claude Code hook fires: open a new Claude Code session in the repository and check that the first turn's context contains the `doctor:` summary line (the tester repeats this with evidence).

- [ ] **Step 6: Commit.**

```bash
git add .claude/settings.json .codex/hooks.json .agents/skills/verify/SKILL.md .github/workflows/verify.yml
git commit -m "chore(harness): run the doctor at session start, as /verify gate 0 and on CI"
```

### Task 3 (G3): the documents point at the doctor

**Files:**
- Modify: `.claude/HARNESS.md` (§0, §7, §11, §12)
- Modify: `docs/install.md` (new section after "Install with an agent")
- Modify: `README.md` (Read more)
- Modify: `docs/features/README.md` (status of the `agent-doctor` row)
- Create content: `docs/features/agent-doctor/tester-briefing.md`

**Interfaces:**
- Consumes: the names `doctor.sh`, `pnpm doctor`, `DOCTOR_SKIP`, the fail-closed guards (Task 1), gate 0 and the CI step (Task 2).

- [ ] **Step 1: HARNESS §0.** Append invariant 11 after invariant 10:

```markdown
11. The agent repairs its own machine before it works, and never works with a blocking hook off. `.agents/hooks/doctor.sh` is the only list of the tools the harness needs; it runs at session start, as `/verify` gate 0 and on CI, and prose never repeats it. It reports; the agent asks before installing ([ADR 0026](../docs/adr/0026-the-agent-repairs-its-own-machine-doctor-reports-never-installs.md)).
```

- [ ] **Step 2: HARNESS §7.** After the paragraph that starts `**Merge on green.**`, add:

```markdown
**Image proof without Docker.** When the diff touches `docker/` or `deploy/` and the doctor reports Docker missing, the agent either asks to install it or writes in the PR body that the image was proven by the `docker` job of CI only. Never silently.
```

- [ ] **Step 3: HARNESS §11.** In the **Ask first** line, after `dependencies added,` insert `installing a tool on the machine (the doctor's fix: lines),`.

- [ ] **Step 4: HARNESS §12.** Add a row to the hook table after `guard-git-add-all.sh`:

```markdown
| `doctor.sh` | SessionStart; `/verify` gate 0; CI `checks` | prints one line per tool the harness needs (`ok`, `missing` or `skipped`, required or optional, what is lost, the `fix:` for this platform's package manager); exit 1 when a required tool is missing. The session hooks force exit 0 so the report reaches the context |
```

and, in the paragraph after the table, extend the sentence about `pnpm test:hooks` with: `The two guards exit 2 with the doctor's fix line when jq is absent; a guard that becomes a no-op is not a guard.`

- [ ] **Step 5: `docs/install.md`.** After the "Install with an agent" section (before `## First login`), add:

```markdown
## Develop with an agent

Clone the repository and open it in Claude Code or Codex. The first session reports which tools the harness needs and are missing on this machine, with the install command for your platform; approve the installs you want, then ask for `/verify`. The list lives in `.agents/hooks/doctor.sh` and nowhere else.
```

- [ ] **Step 6: README Read more.** Change the first bullet to:

```markdown
- [Install and run](docs/install.md): Docker, Railway or an agent, then claim the instance and invite your team; [develop with an agent](docs/install.md#develop-with-an-agent)
```

- [ ] **Step 7: Features index.** In `docs/features/README.md`, change the `agent-doctor` row's status from `Draft` to `Building`.

- [ ] **Step 8: Tester briefing.** Fill `docs/features/agent-doctor/tester-briefing.md`: what changed (one line per file from the three tasks), how to run (`bash .agents/hooks/hooks.test.sh`, `pnpm doctor`, a fresh Claude Code session in a worktree), the red/green table (the `doctor:` checks, the two guard checks), hypotheses (the session hook fires and the report is in context; `Edit` on `.env` is blocked with the fix line when `jq` is hidden; `pnpm doctor` on CI is green; the Linux fix lines are right), known gaps (no Linux machine at hand: Linux is pinned by `DOCTOR_UNAME` only).

- [ ] **Step 9: Verify.** `pnpm exec prettier --write .claude/HARNESS.md docs/install.md README.md docs/features/README.md docs/features/agent-doctor/tester-briefing.md`; `pnpm --filter @superdoc-collab/server exec vitest run src/repository-shape` → `delivery-docs.test.ts` and `readme-run-block.test.ts` green.

- [ ] **Step 10: Commit.**

```bash
git add .claude/HARNESS.md docs/install.md README.md docs/features/README.md docs/features/agent-doctor/tester-briefing.md
git commit -m "docs(harness): the doctor is the one list of tools; develop with an agent"
```

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1.3 | bash 3.2 (macOS default) rejects a construct | `doctor.sh: line N: syntax error` in `hooks.test.sh` | rewrite the line; no `declare -A`, no `${var,,}` |
| 1.3 | `docker info` hangs with a stopped daemon | `pnpm doctor` takes seconds on the `docker` line | wrap with `timeout 5` when `timeout` is on `PATH`, else keep |
| 1.4 | `warn-conventions.sh` now exits 2 without `jq` and a PostToolUse hook shows a red line | the fix line appears after every edit on a machine without `jq` | intended: the line is the instruction |
| 2.1 | Claude Code does not add the stdout to context | a fresh session shows no `doctor:` line | check the hook's exit code is 0 (`\|\| true`) and the command path |
| 2.4 | CI `gh auth status` fails with `github.token` | the `checks` job fails on the `gh` line | add `gh` to `DOCTOR_SKIP` on CI and record it in the ADR consequences |
| 3.6 | README link check fails on the anchor | `delivery-docs.test.ts` red | match the heading slug Prettier leaves (`develop-with-an-agent`) |

**Steps with no backout:** none; every change is a file in git.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** not applicable, no UI touched.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
