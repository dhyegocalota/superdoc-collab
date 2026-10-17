#!/usr/bin/env bash
set -u
here="$(cd "$(dirname "$0")" && pwd)"
failures=0

expect_exit() {
  local name=$1 expected=$2 script=$3 input=$4
  printf '%s' "$input" | "$here/$script" >/dev/null 2>&1
  local actual=$?
  [[ "$actual" == "$expected" ]] && return
  echo "FAIL $name: expected exit $expected, got $actual"
  failures=$((failures + 1))
}

expect_stderr() {
  local name=$1 pattern=$2 script=$3 input=$4
  local output
  output=$(printf '%s' "$input" | "$here/$script" 2>&1 >/dev/null)
  [[ "$output" =~ $pattern ]] && return
  echo "FAIL $name: stderr did not match /$pattern/: $output"
  failures=$((failures + 1))
}

claude_edit() { printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"}}' "$1"; }
codex_patch() { printf '{"tool_name":"apply_patch","tool_input":{"command":"*** Begin Patch\\n*** %s File: %s\\n@@\\n+x\\n*** End Patch"}}' "$1" "$2"; }
bash_call() { printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$1"; }

expect_exit "claude: .env edit is blocked" 2 guard-secrets.sh "$(claude_edit /repo/.env)"
expect_exit "claude: .env.local edit is blocked" 2 guard-secrets.sh "$(claude_edit /repo/apps/server/.env.local)"
expect_exit "claude: .env.example edit is allowed" 0 guard-secrets.sh "$(claude_edit /repo/.env.example)"
expect_exit "claude: ordinary file is allowed" 0 guard-secrets.sh "$(claude_edit /repo/apps/web/src/main.tsx)"
expect_exit "codex: .env update is blocked" 2 guard-secrets.sh "$(codex_patch Update .env)"
expect_exit "codex: .env add is blocked" 2 guard-secrets.sh "$(codex_patch Add apps/server/.env.production)"
expect_exit "codex: .env.example update is allowed" 0 guard-secrets.sh "$(codex_patch Update .env.example)"
expect_exit "codex: ordinary patch is allowed" 0 guard-secrets.sh "$(codex_patch Update apps/web/src/main.tsx)"
expect_exit "empty input is allowed" 0 guard-secrets.sh '{}'

expect_exit "git add -A is blocked" 2 guard-git-add-all.sh "$(bash_call 'git add -A')"
expect_exit "git add . is blocked" 2 guard-git-add-all.sh "$(bash_call 'git add .')"
expect_exit "git add --all is blocked" 2 guard-git-add-all.sh "$(bash_call 'git add --all && git commit')"
expect_exit "the no-verify flag is blocked" 2 guard-git-add-all.sh "$(bash_call 'git commit --no-verify -m x')"
expect_exit "git add by name is allowed" 0 guard-git-add-all.sh "$(bash_call 'git add README.md .agents/hooks')"
expect_exit "git add of a dotfile is allowed" 0 guard-git-add-all.sh "$(bash_call 'git add .gitignore')"

expect_exit "verify records: a command naming .git/verify is blocked" 2 guard-verify-records.sh "$(bash_call 'echo x > .git/verify/abc')"
expect_exit "verify records: rm of .git/verify is blocked" 2 guard-verify-records.sh "$(bash_call 'rm -rf .git/verify')"
expect_exit "verify records: cp into .git/verify is blocked" 2 guard-verify-records.sh "$(bash_call 'cp a .git/verify/b')"
expect_exit "verify records: ls of .git/verify is allowed" 0 guard-verify-records.sh "$(bash_call 'ls .git/verify')"
expect_exit "verify records: cat of a record is allowed" 0 guard-verify-records.sh "$(bash_call 'cat .git/verify/x')"
expect_exit "verify records: a search for git-common-dir is allowed" 0 guard-verify-records.sh "$(bash_call 'rg -n git-common-dir scripts/verify.sh')"
expect_exit "verify records: git-common-dir beside pnpm verify is allowed" 0 guard-verify-records.sh "$(bash_call 'git rev-parse --git-common-dir && pnpm verify --plan')"
expect_exit "verify records: a commit message naming .git/verify is allowed" 0 guard-verify-records.sh "$(bash_call 'git commit -m \"mentions .git/verify\"')"
expect_exit "verify records: a relative Codex patch under .git/verify is blocked" 2 guard-verify-records.sh "$(codex_patch Add .git/verify/abc)"
expect_exit "verify records: an edit through dot-dot segments is blocked" 2 guard-verify-records.sh "$(claude_edit /repo/.git/worktrees/x/../../verify/abc)"
expect_exit "verify records: a Claude edit under .git/verify is blocked" 2 guard-verify-records.sh "$(claude_edit /repo/.git/verify/abc)"
expect_exit "verify records: a Codex patch under .git/verify is blocked" 2 guard-verify-records.sh "$(codex_patch Add /repo/.git/verify/abc)"
expect_exit "verify records: pnpm verify --plan is allowed" 0 guard-verify-records.sh "$(bash_call 'pnpm verify --plan')"
expect_exit "verify records: an ordinary edit is allowed" 0 guard-verify-records.sh "$(claude_edit /repo/scripts/verify.sh)"
expect_stderr "verify records: the block names the script" "records of green commits are written only by scripts/verify.sh" guard-verify-records.sh "$(bash_call 'rm -rf .git/verify')"

scratch=$(mktemp -d)
printf 'const value = input ?? "fallback";\nif (a) {\n  b();\n} else {\n  c();\n}\n' > "$scratch/else.ts"
printf 'export function clean(): number {\n  return 1;\n}\n' > "$scratch/clean.ts"
printf 'const value = input ?? "fallback";\n' > "$scratch/notes.md"
printf '// NB ADR 0015: the rule in one sentence.\nexport const LIMIT = 5;\n' > "$scratch/pointer.ts"
printf '// NB ADR 0015: the rule in one sentence.\n// plain comment\nexport const LIMIT = 5;\n' > "$scratch/comment.ts"
expect_stderr "claude: else and ?? default are warned" "else.*return early|masks a missing value" warn-conventions.sh "$(claude_edit "$scratch/else.ts")"
expect_stderr "codex: patch headers reach the same warnings" "masks a missing value" warn-conventions.sh "$(codex_patch Update "$scratch/else.ts")"
expect_exit "clean file passes silently" 0 warn-conventions.sh "$(claude_edit "$scratch/clean.ts")"
[[ -z "$(printf '%s' "$(claude_edit "$scratch/clean.ts")" | "$here/warn-conventions.sh" 2>&1)" ]] || { echo "FAIL clean file produced a warning"; failures=$((failures + 1)); }
[[ -z "$(printf '%s' "$(claude_edit "$scratch/notes.md")" | "$here/warn-conventions.sh" 2>&1)" ]] || { echo "FAIL markdown file produced a warning"; failures=$((failures + 1)); }
expect_stderr "a plain comment next to an NB pointer is warned" "only '// NB ADR NNNN:' pointers are allowed" warn-conventions.sh "$(claude_edit "$scratch/comment.ts")"
[[ -z "$(printf '%s' "$(claude_edit "$scratch/pointer.ts")" | "$here/warn-conventions.sh" 2>&1)" ]] || { echo "FAIL an NB ADR pointer produced a warning"; failures=$((failures + 1)); }
rm -rf "$scratch"

repository=$(mktemp -d)
codex_stop() { printf '{"session_id":"s","turn_id":"t","transcript_path":null,"cwd":"%s","hook_event_name":"Stop","model":"m","permission_mode":"default","stop_hook_active":%s,"last_assistant_message":null}' "$repository" "$1"; }
remind() { (cd "$repository" && printf '%s' "$(codex_stop "$1")" | "$here/remind-docs.sh" 2>&1); }
in_repository() { git -C "$repository" -c user.name=hooks -c user.email=hooks@example.com "$@"; }
expect_match() {
  local name=$1 output=$2 pattern=$3
  [[ "$output" =~ $pattern ]] && return
  echo "FAIL $name: output did not match /$pattern/: $output"
  failures=$((failures + 1))
}
expect_no_match() {
  local name=$1 output=$2 pattern=$3
  [[ "$output" =~ $pattern ]] || return
  echo "FAIL $name: output matched /$pattern/: $output"
  failures=$((failures + 1))
}
expect_silence() {
  local name=$1 output=$2
  [[ -z "$output" ]] && return
  echo "FAIL $name: expected no output, got: $output"
  failures=$((failures + 1))
}
expect_silence "outside a git repository the docs reminder stays silent" "$(remind false)"
in_repository init -q
mkdir -p "$repository/apps/web/src" "$repository/libs/plain" "$repository/.claude/rules"
printf '# Root\n' > "$repository/README.md"
printf '# Web\n' > "$repository/apps/web/README.md"
printf -- '---\npaths:\n  - "apps/web/**"\n---\n\n# Web facts\n' > "$repository/.claude/rules/web.md"
printf 'one\n' > "$repository/apps/web/src/main.tsx"
in_repository add README.md apps .claude
in_repository commit -q -m initial
expect_silence "a clean tree raises no docs reminder" "$(remind false)"
printf 'two\n' > "$repository/apps/web/src/main.tsx"
expect_match "a code change names the nearest README and the rule whose globs match it" "$(remind false)" '"decision": "block".*`\.claude/rules/web\.md` `apps/web/README\.md`'
expect_silence "the same documents are reminded once" "$(remind false)"
printf '{}\n' > "$repository/package.json"
expect_silence "a stop that is already continuing is never blocked" "$(remind true)"
printf '# Web, updated\n' > "$repository/apps/web/README.md"
reminder=$(remind false)
expect_match "a file outside every documented folder names the root README" "$reminder" '`README\.md`'
expect_no_match "a document already reminded since the last commit is not reminded again" "$reminder" 'rules/web'
in_repository add package.json
in_repository commit -qam second
printf 'three\n' > "$repository/apps/web/src/main.tsx"
expect_match "a commit starts the reminders over" "$(remind false)" 'apps/web/README\.md'
in_repository commit -qam third
mkdir -p "$repository/apps/web/src/my dir"
printf 'x\n' > "$repository/apps/web/src/my dir/b c.ts"
expect_match "a path with spaces names its folder's README" "$(remind false)" 'apps/web/README\.md'
in_repository add apps
in_repository commit -qm fourth
in_repository mv apps/web/src/main.tsx libs/plain/main.tsx
expect_match "a rename names the README of the folder the file left" "$(remind false)" 'apps/web/README\.md'
rm -rf "$repository"

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
doctor() { PLAYWRIGHT_BROWSERS_PATH= DOCTOR_UNAME="$1" DOCTOR_PATH="$doctor_bin" DOCTOR_HOME="$doctor_home" DOCTOR_SKIP="${2:-}" "$here/doctor.sh" 2>&1; }
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

stub_all; rm "$doctor_bin/gh" "$doctor_bin/brew"; stub apk 'exit 0'
expect_match "doctor: gh on Alpine is github-cli" "$(doctor_line Linux gh)" 'fix: sudo apk add github-cli$'

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
expect_match "doctor: docker without a daemon is missing but optional" "$(doctor_line Darwin docker)" '^docker \| missing \| optional \| lost: README → Quick install with Docker and booting the image locally; every gate runs from source \| fix: brew install --cask docker$'

stub_all; rm -rf "$doctor_home/Library/Caches/ms-playwright"
report=$(doctor Darwin chromium)
expect_match "doctor: a skipped tool is printed as skipped" "$(doctor_line Darwin chromium chromium)" '^chromium \| skipped \| required \|'
expect_match "doctor: a skipped tool is not counted" "$report" 'doctor: 0 missing required, 0 missing optional'

stub_all; rm "$doctor_bin/jq"
fix_line=$(DOCTOR_PATH="$doctor_bin" "$here/doctor.sh" --fix jq)
[[ "$fix_line" == "brew install jq" ]] || { echo "FAIL doctor --fix prints the fix alone: $fix_line"; failures=$((failures + 1)); }

nvmrc_file=$(mktemp)
doctor_nvmrc() { DOCTOR_NVMRC="$nvmrc_file" DOCTOR_PATH="$doctor_bin" DOCTOR_HOME="$doctor_home" "$here/doctor.sh" 2>&1; }
stub_all
printf '24.7.0\n' > "$nvmrc_file"
expect_match "doctor: a full version in .nvmrc is read as its major" "$(doctor_nvmrc | grep '^node ')" '^node \| ok \|'
pwned_dir=$(mktemp -d)
printf 'root[$(touch${IFS}'"$pwned_dir"'/marker)]\n' > "$nvmrc_file"
output=$(doctor_nvmrc); status=$?
[[ "$status" == 1 ]] || { echo "FAIL doctor with a hostile .nvmrc: expected exit 1, got $status"; failures=$((failures + 1)); }
expect_match "doctor: a hostile .nvmrc is refused" "$output" '^doctor: \.nvmrc is not a version$'
[[ ! -e "$pwned_dir/marker" ]] || { echo "FAIL doctor evaluated the .nvmrc"; failures=$((failures + 1)); }
rm -rf "$pwned_dir"
rm -f "$nvmrc_file"

guard_path=$(mktemp -d)
for tool in bash env cat dirname sed tr uname ls grep; do ln -s "$(command -v $tool)" "$guard_path/$tool"; done
guard_without_jq() { PATH="$guard_path" "$here/$1" 2>&1 >/dev/null; }
output=$(printf '%s' "$(claude_edit /repo/apps/web/src/main.tsx)" | guard_without_jq guard-secrets.sh); status=$?
[[ "$status" == 2 ]] || { echo "FAIL guard-secrets without jq: expected exit 2, got $status"; failures=$((failures + 1)); }
expect_match "guard-secrets without jq names the fix" "$output" '^Blocked: the hooks need jq\. fix: https://jqlang\.github\.io/jq/download/$'
output=$(printf '%s' "$(bash_call 'git add README.md')" | guard_without_jq guard-git-add-all.sh); status=$?
[[ "$status" == 2 ]] || { echo "FAIL guard-git-add-all without jq: expected exit 2, got $status"; failures=$((failures + 1)); }
expect_match "guard-git-add-all without jq names the fix" "$output" '^Blocked: the hooks need jq\. fix: '
rm -rf "$doctor_bin" "$doctor_home" "$guard_path"

[[ "$failures" == 0 ]] && echo "hooks: all checks passed" && exit 0
echo "hooks: $failures check(s) failed"
exit 1
