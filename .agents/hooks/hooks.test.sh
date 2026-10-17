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
stop_call() { printf '{"hook_event_name":"Stop","stop_hook_active":%s}' "$1"; }
remind() { (cd "$repository" && printf '%s' "$(stop_call "$1")" | "$here/remind-docs.sh" 2>&1); }
expect_reminder() {
  local name=$1 active=$2 pattern=$3
  local output
  output=$(remind "$active")
  [[ "$output" =~ $pattern ]] && return
  echo "FAIL $name: output did not match /$pattern/: $output"
  failures=$((failures + 1))
}
expect_silence() {
  local name=$1 active=$2
  local output
  output=$(remind "$active")
  [[ -z "$output" ]] && return
  echo "FAIL $name: expected no output, got: $output"
  failures=$((failures + 1))
}
expect_silence "outside a git repository the docs reminder stays silent" false
git -C "$repository" init -q
mkdir -p "$repository/apps/web/src" "$repository/.claude/rules"
printf '# Root\n' > "$repository/README.md"
printf '# Web\n' > "$repository/apps/web/README.md"
printf -- '---\npaths:\n  - "apps/web/**"\n---\n\n# Web facts\n' > "$repository/.claude/rules/web.md"
printf 'one\n' > "$repository/apps/web/src/main.tsx"
git -C "$repository" add README.md apps .claude
git -C "$repository" -c user.name=hooks -c user.email=hooks@example.com commit -q -m initial
expect_silence "a clean tree raises no docs reminder" false
printf 'two\n' > "$repository/apps/web/src/main.tsx"
expect_reminder "a code change names the nearest README and the rule whose globs match it" false '"decision": "block".*`\.claude/rules/web\.md` `apps/web/README\.md`'
printf 'two\n' > "$repository/apps/web/src/main.tsx"
expect_silence "the same set of documents is reminded once" false
printf '{}\n' > "$repository/package.json"
expect_silence "a stop that is already continuing is never blocked" true
printf '# Web, updated\n' > "$repository/apps/web/README.md"
printf -- '---\npaths:\n  - "apps/web/**"\n---\n\n# Web facts, updated\n' > "$repository/.claude/rules/web.md"
reminder=$(remind false)
[[ "$reminder" =~ \`README\.md\` ]] || { echo "FAIL a file outside every documented folder did not name the root README: $reminder"; failures=$((failures + 1)); }
[[ "$reminder" =~ apps/web/README|rules/web ]] && { echo "FAIL an updated document is still reminded: $reminder"; failures=$((failures + 1)); }
rm -rf "$repository"

[[ "$failures" == 0 ]] && echo "hooks: all checks passed" && exit 0
echo "hooks: $failures check(s) failed"
exit 1
