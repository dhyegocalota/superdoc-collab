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

scratch=$(mktemp -d)
printf 'const value = input ?? "fallback";\nif (a) {\n  b();\n} else {\n  c();\n}\n' > "$scratch/else.ts"
printf 'export function clean(): number {\n  return 1;\n}\n' > "$scratch/clean.ts"
printf 'const value = input ?? "fallback";\n' > "$scratch/notes.md"
expect_stderr "claude: else and ?? default are warned" "else.*return early|masks a missing value" warn-conventions.sh "$(claude_edit "$scratch/else.ts")"
expect_stderr "codex: patch headers reach the same warnings" "masks a missing value" warn-conventions.sh "$(codex_patch Update "$scratch/else.ts")"
expect_exit "clean file passes silently" 0 warn-conventions.sh "$(claude_edit "$scratch/clean.ts")"
[[ -z "$(printf '%s' "$(claude_edit "$scratch/clean.ts")" | "$here/warn-conventions.sh" 2>&1)" ]] || { echo "FAIL clean file produced a warning"; failures=$((failures + 1)); }
[[ -z "$(printf '%s' "$(claude_edit "$scratch/notes.md")" | "$here/warn-conventions.sh" 2>&1)" ]] || { echo "FAIL markdown file produced a warning"; failures=$((failures + 1)); }
rm -rf "$scratch"

[[ "$failures" == 0 ]] && echo "hooks: all checks passed" && exit 0
echo "hooks: $failures check(s) failed"
exit 1
