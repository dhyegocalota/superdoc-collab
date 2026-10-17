#!/usr/bin/env bash
hook_input=$(cat)
[[ "$(jq -r '.stop_hook_active // false' <<<"$hook_input" 2>/dev/null)" == "true" ]] && exit 0
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0
changed=$(
  git -c core.quotePath=false diff --name-only --no-renames HEAD 2>/dev/null
  git -c core.quotePath=false ls-files --others --exclude-standard
)
[[ -n "$changed" ]] || exit 0
rule_globs=$(awk '/^paths:/ { inside = 1; next } /^---$/ { inside = 0 } inside && match($0, /"[^"]*"/) { print FILENAME "\t" substr($0, RSTART + 1, RLENGTH - 2) }' .claude/rules/*.md 2>/dev/null)

nearest_readme() {
  local directory=$1
  [[ "$directory" == */* ]] || { echo "README.md"; return; }
  directory=${directory%/*}
  while [[ ! -f "$directory/README.md" && "$directory" == */* ]]; do
    directory=${directory%/*}
  done
  [[ -f "$directory/README.md" ]] && echo "$directory/README.md" && return
  echo "README.md"
}

describing_documents() {
  local file rule glob
  while IFS= read -r file; do
    [[ "${file##*/}" == README.md || "$file" == .claude/rules/* ]] && continue
    nearest_readme "$file"
    while IFS=$'\t' read -r rule glob; do
      [[ -n "$glob" && "$file" == $glob ]] && echo "$rule"
    done <<<"$rule_globs"
  done <<<"$changed"
}

stale=$(describing_documents | sort -u | grep -vxF -f <(printf '%s\n' "$changed"))
[[ -n "$stale" ]] || exit 0
head=$(git rev-parse HEAD 2>/dev/null)
reminded_file="$(git rev-parse --git-dir)/docs-reminder"
reminded=""
[[ -f "$reminded_file" && "$(head -n 1 "$reminded_file")" == "head $head" ]] && reminded=$(tail -n +2 "$reminded_file")
fresh=$(grep -vxF -f <(printf '%s\n' "$reminded") <<<"$stale")
[[ -n "$fresh" ]] || exit 0
printf 'head %s\n%s\n' "$head" "$(printf '%s\n%s\n' "$reminded" "$fresh" | grep -v '^$' | sort -u)" > "$reminded_file"
documents=$(sed 's/.*/`&`/' <<<"$fresh" | paste -sd ' ' -)
jq -n --arg documents "$documents" '{
  decision: "block",
  reason: "Docs check: this change touches folders described by \($documents), and none of them changed. Update each one whose facts the change made wrong (layout, commands, routes, variables, behaviour, versions), or say in one line why none applies, then stop. Each document is named once until the next commit (.claude/HARNESS.md → Build)."
}'
exit 0
