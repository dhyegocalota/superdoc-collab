#!/usr/bin/env bash
hook_input=$(cat)
[[ "$(jq -r '.stop_hook_active // false' <<<"$hook_input")" == "true" ]] && exit 0
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0
changed=$(git -c core.quotePath=false status --porcelain --untracked-files=all | sed -E 's/^.{3}//; s/.* -> //')
[[ -n "$changed" ]] || exit 0

nearest_readme() {
  local directory
  directory=$(dirname "$1")
  while [[ "$directory" != "." && ! -f "$directory/README.md" ]]; do
    directory=$(dirname "$directory")
  done
  [[ "$directory" == "." ]] && echo "README.md" && return
  echo "$directory/README.md"
}

rule_globs() { sed -n '/^paths:/,/^---$/p' "$1" | sed -nE 's/^ *- "(.*)"$/\1/p'; }

matches_rule() {
  local file=$1 rule=$2 glob
  while IFS= read -r glob; do
    [[ "$file" == $glob ]] && return 0
  done < <(rule_globs "$rule")
  return 1
}

describing_documents() {
  local file rule
  while IFS= read -r file; do
    [[ "${file##*/}" == README.md || "$file" == .claude/rules/* ]] && continue
    nearest_readme "$file"
    for rule in .claude/rules/*.md; do
      [[ -f "$rule" ]] || continue
      matches_rule "$file" "$rule" && echo "$rule"
    done
  done <<<"$changed"
}

stale=$(describing_documents | sort -u | grep -vxF -f <(printf '%s\n' "$changed"))
[[ -n "$stale" ]] || exit 0
reminded="$(git rev-parse --git-dir)/docs-reminder"
[[ -f "$reminded" && "$(cat "$reminded")" == "$stale" ]] && exit 0
printf '%s\n' "$stale" > "$reminded"
documents=$(sed 's/.*/`&`/' <<<"$stale" | paste -sd ' ' -)
jq -n --arg documents "$documents" '{
  decision: "block",
  reason: "Docs check: this change touches folders described by \($documents), and none of them changed. Update each one whose facts the change made wrong (layout, commands, routes, variables, behaviour, versions), or say in one line why none applies, then stop. This reminder fires once per set of documents (.claude/HARNESS.md → Build)."
}'
exit 0
